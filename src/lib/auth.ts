import type { RealtimeChannel, Session } from '@supabase/supabase-js'
import { create } from 'zustand'
import { AppError, errMsg, q, rpc } from './api'
import { startRealtime, stopRealtime } from './realtime'
import { removeAccount, saveAccount, setLastUsername, touchAccount, updateSavedPassword } from './savedAccounts'
import { startShop, stopShop } from './shop'
import { setRemember, supabase, usernameToEmail } from './supabase'
import type { Perm, Profile } from './types'
import { clearLiveCache } from './useLive'

export type AuthStatus = 'loading' | 'signedOut' | 'noProfile' | 'pending' | 'ready' | 'error'

interface AuthState {
  status: AuthStatus
  session: Session | null
  profile: Profile | null
  shopName: string
  error: string | null
}

export const useAuth = create<AuthState>(() => ({ status: 'loading', session: null, profile: null, shopName: '', error: null }))

export const PERM_LABELS: Record<Perm, string> = {
  sell: 'البيع',
  discount: 'تقليل السعر والخصم',
  credit: 'البيع الآجل',
  returns: 'المرتجع والاستبدال',
  customers: 'العملاء والتحصيل',
  products: 'إضافة وتعديل المنتجات والأسعار والعروض',
  stock: 'توريد وجرد وهوالك وفك الشواحن',
  purchases: 'المشتريات والتجار',
  used: 'شراء الموبايلات المستعملة',
  expenses: 'المصاريف',
  drawer: 'الدرج (تصفية وإيداع)',
  reports: 'تقرير الأرباح وأسعار الجملة',
  log: 'السجل',
  undo: 'التراجع عن العمليات',
  settings: 'الإعدادات',
}

export function can(p: Perm, profile = useAuth.getState().profile): boolean {
  if (!profile) return false
  return profile.role === 'owner' || profile.perms?.[p] === true
}
export const isOwner = (profile = useAuth.getState().profile) => profile?.role === 'owner'

/** hook: هل المستخدم معاه الصلاحية؟ */
export function useCan(p: Perm): boolean {
  const profile = useAuth((s) => s.profile)
  return can(p, profile)
}

// ───────── متابعة الجلسة والـ profile ─────────

let profileChannel: RealtimeChannel | null = null
// undefined = لسه معرفناش الجلسة
let currentUid: string | null | undefined = undefined
let shopStarted = false
// أثناء إنشاء الحساب: منغيرش الشاشة لحد ما ربط المحل يخلص (عشان صفحة "اربط حسابك" متظهرش لحظة)
let registering = false

async function loadProfile(uid: string) {
  const rows = (await q(supabase.from('profiles').select().eq('id', uid))) as Profile[]
  return rows[0] ?? null
}

async function applyProfile(p: Profile | null) {
  if (!p) {
    useAuth.setState({ profile: null, status: 'noProfile' })
    await stopApp()
    return
  }
  useAuth.setState({ profile: p })
  if (!p.active) {
    useAuth.setState({ status: 'pending' })
    await stopApp()
    return
  }
  if (!shopStarted) {
    shopStarted = true
    startRealtime()
    try {
      await startShop()
    } catch (e) {
      shopStarted = false
      useAuth.setState({ status: 'error', error: errMsg(e) })
      return
    }
    loadShopName()
  }
  useAuth.setState({ status: 'ready', error: null })
}

async function loadShopName() {
  try {
    const rows = (await q(supabase.from('shops').select('name').limit(1))) as { name: string }[]
    const name = rows[0]?.name ?? ''
    useAuth.setState({ shopName: name })
    const p = useAuth.getState().profile
    if (p) touchAccount(p.username, { name: p.name, shopName: name })
  } catch {
    /* مش مهم */
  }
}

async function stopApp() {
  if (!shopStarted) return
  shopStarted = false
  await stopRealtime()
  stopShop()
  clearLiveCache()
}

function watchProfile(uid: string) {
  if (profileChannel) void supabase.removeChannel(profileChannel)
  profileChannel = supabase
    .channel(`me-${uid}-${Date.now()}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${uid}` }, (c) => {
      if (c.eventType === 'DELETE') void applyProfile(null)
      else void applyProfile(c.new as Profile)
    })
    .subscribe((status) => {
      // بعد ما الاتصال يرجع: نتأكد من الحالة (يمكن المدير فعّل الحساب واحنا من غير نت)
      if (status === 'SUBSCRIBED' && currentUid === uid) void refreshProfile()
    })
}

export async function refreshProfile() {
  const uid = currentUid
  if (!uid) return
  try {
    const p = await loadProfile(uid)
    if (currentUid === uid) await applyProfile(p)
  } catch (e) {
    if (useAuth.getState().status === 'loading') useAuth.setState({ status: 'error', error: errMsg(e) })
  }
}

async function onSession(session: Session | null) {
  const uid = session?.user.id ?? null
  useAuth.setState({ session })
  if (uid === currentUid) return
  currentUid = uid
  if (!uid) {
    if (profileChannel) void supabase.removeChannel(profileChannel)
    profileChannel = null
    await stopApp()
    useAuth.setState({ status: 'signedOut', profile: null, shopName: '' })
    return
  }
  watchProfile(uid)
  if (registering) return
  useAuth.setState({ status: 'loading' })
  await refreshProfile()
}

let inited = false
export function initAuth() {
  if (inited) return
  inited = true
  supabase.auth.onAuthStateChange((_event, session) => {
    // مينفعش ننادي supabase جوه الـ callback مباشرة (ممكن يعلّق)، فبنأجلها
    setTimeout(() => void onSession(session), 0)
  })
  supabase.auth
    .getSession()
    .then(({ data }) => onSession(data.session))
    .catch(() => useAuth.setState({ status: 'signedOut' }))
}

// ───────── العمليات ─────────

function checkUsername(u: string) {
  const t = u.trim()
  if (!t) throw new AppError('اكتب اسم المستخدم')
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(t)) throw new AppError('اسم المستخدم لازم يبقى 3 حروف إنجليزي أو أرقام على الأقل، من غير مسافات')
}
function checkPassword(p: string) {
  if (p.length < 6) throw new AppError('الباسورد لازم يبقى 6 حروف أو أرقام على الأقل')
}

export interface LoginOpts {
  remember: boolean // الجلسة تفضل محفوظة بعد ما يقفل المتصفح
  savePassword: boolean // يحفظ اسم المستخدم والباسورد للدخول بضغطة
}

function rememberCreds(username: string, password: string, opts: LoginOpts, extra: { name?: string; shopName?: string } = {}) {
  setLastUsername(username)
  if (opts.savePassword) saveAccount(username, password, extra)
  else removeAccount(username)
}

export async function signIn(username: string, password: string, opts: LoginOpts) {
  if (!username.trim()) throw new AppError('اكتب اسم المستخدم')
  if (!password) throw new AppError('اكتب الباسورد')
  setRemember(opts.remember)
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password }).catch((e) => ({ error: e }))
  if (error) throw new AppError(errMsg(error))
  rememberCreds(username, password, opts)
}

async function signUpOrIn(username: string, password: string) {
  checkUsername(username)
  checkPassword(password)
  const email = usernameToEmail(username)
  const { data, error } = await supabase.auth.signUp({ email, password }).catch((e) => ({ data: null, error: e }))
  if (error) {
    // لو الحساب اتعمل قبل كده (مثلاً المحاولة الأولى فشلت في النص) نجرب ندخل بيه
    if (/already registered|already exists/i.test(String(error.message))) {
      const r = await supabase.auth.signInWithPassword({ email, password })
      if (r.error) throw new AppError('اسم المستخدم ده متسجل قبل كده. اختار اسم تاني أو سجل دخول')
      return
    }
    throw new AppError(errMsg(error))
  }
  if (!data?.session) {
    const r = await supabase.auth.signInWithPassword({ email, password })
    if (r.error) throw new AppError(errMsg(r.error))
  }
}

async function register(username: string, password: string, opts: LoginOpts, link: () => Promise<void>) {
  setRemember(opts.remember)
  registering = true
  try {
    const s = useAuth.getState().session
    if (s?.user.email !== usernameToEmail(username)) await signUpOrIn(username, password)
    await link()
  } finally {
    registering = false
  }
  await refreshProfile()
}

export async function createShop(f: { shopName: string; ownerName: string; username: string; password: string }, opts: LoginOpts) {
  if (!f.shopName.trim() || !f.ownerName.trim()) throw new AppError('اكتب اسم المحل واسمك')
  let r = { shop_id: '', join_code: '' }
  await register(f.username, f.password, opts, async () => {
    r = await rpc<{ shop_id: string; join_code: string }>('create_shop', {
      p_shop_name: f.shopName.trim(),
      p_owner_name: f.ownerName.trim(),
      p_username: f.username.trim().toLowerCase(),
    })
    rememberCreds(f.username, f.password, opts, { name: f.ownerName.trim(), shopName: f.shopName.trim() })
  })
  return r
}

export async function joinShop(f: { code: string; name: string; username: string; password: string }, opts: LoginOpts) {
  if (!f.code.trim()) throw new AppError('اكتب كود المحل')
  if (!f.name.trim()) throw new AppError('اكتب اسمك')
  await register(f.username, f.password, opts, async () => {
    await rpc('join_shop', { p_code: f.code.trim().toUpperCase(), p_name: f.name.trim(), p_username: f.username.trim().toLowerCase() })
    rememberCreds(f.username, f.password, opts, { name: f.name.trim() })
  })
}

/** ربط حساب موجود (مسجل دخول بالفعل) بمحل */
export async function linkShop(mode: 'join' | 'create', f: { code?: string; name: string; shopName?: string }) {
  const s = useAuth.getState().session
  const username = s?.user.email?.split('@')[0] ?? ''
  if (mode === 'join') {
    await rpc('join_shop', { p_code: (f.code ?? '').trim().toUpperCase(), p_name: f.name.trim(), p_username: username })
  } else {
    await rpc('create_shop', { p_shop_name: (f.shopName ?? '').trim(), p_owner_name: f.name.trim(), p_username: username })
  }
  await refreshProfile()
}

export async function signOut() {
  await supabase.auth.signOut().catch(() => {})
  // لو النت قاطع signOut ممكن يفشل: نمسح الجلسة من الجهاز في كل الأحوال
  try {
    localStorage.removeItem('cd.auth')
    sessionStorage.removeItem('cd.auth')
  } catch {
    /* ignore */
  }
  await onSession(null)
}

export async function changeMyPassword(password: string) {
  checkPassword(password)
  const { error } = await supabase.auth.updateUser({ password })
  if (error) throw new AppError(errMsg(error))
  const p = useAuth.getState().profile
  if (p) updateSavedPassword(p.username, password)
}

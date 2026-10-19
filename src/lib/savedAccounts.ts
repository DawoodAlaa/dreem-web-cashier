// الحسابات المحفوظة على الجهاز: عشان تدخل بضغطة من غير ما تكتب اسم المستخدم والباسورد كل مرة.
// الباسورد بيتحفظ مشفّر بمفتاح خاص بالجهاز ده (مش نص عادي)، وتقدر تمسح أي حساب محفوظ في أي وقت.

const KEY = 'cd.accounts'
const DEVICE_KEY = 'cd.device'

export interface SavedAccount {
  username: string
  name?: string
  shopName?: string
  secret?: string // الباسورد بعد التشفير (لو المستخدم اختار يحفظه)
  savedAt: number
}

function read(): SavedAccount[] {
  try {
    const j = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(j) ? j : []
  } catch {
    return []
  }
}
function write(list: SavedAccount[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list))
  } catch {
    /* المتصفح مانع التخزين */
  }
}

function deviceKey(): string {
  try {
    let k = localStorage.getItem(DEVICE_KEY)
    if (!k) {
      const a = new Uint8Array(32)
      crypto.getRandomValues(a)
      k = Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('')
      localStorage.setItem(DEVICE_KEY, k)
    }
    return k
  } catch {
    return 'cashier-dreem'
  }
}

function xor(bytes: Uint8Array, key: string): Uint8Array {
  const k = new TextEncoder().encode(key)
  const out = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) out[i] = bytes[i] ^ k[i % k.length]
  return out
}
const toB64 = (b: Uint8Array) => btoa(String.fromCharCode(...b))
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

function encode(pw: string): string {
  return toB64(xor(new TextEncoder().encode(pw), deviceKey()))
}
function decode(s: string): string | null {
  try {
    return new TextDecoder().decode(xor(fromB64(s), deviceKey()))
  } catch {
    return null
  }
}

export function listAccounts(): SavedAccount[] {
  return read().sort((a, b) => b.savedAt - a.savedAt)
}

export function saveAccount(username: string, password: string | null, extra: { name?: string; shopName?: string } = {}) {
  const u = username.trim().toLowerCase()
  if (!u) return
  const list = read().filter((a) => a.username !== u)
  const old = read().find((a) => a.username === u)
  list.push({
    username: u,
    name: extra.name ?? old?.name,
    shopName: extra.shopName ?? old?.shopName,
    secret: password ? encode(password) : undefined,
    savedAt: Date.now(),
  })
  write(list)
}

/** تحديث الاسم واسم المحل بعد الدخول (من غير ما نلمس الباسورد) */
export function touchAccount(username: string, extra: { name?: string; shopName?: string }) {
  const u = username.trim().toLowerCase()
  const list = read()
  const a = list.find((x) => x.username === u)
  if (!a) return
  if (extra.name) a.name = extra.name
  if (extra.shopName) a.shopName = extra.shopName
  write(list)
}

/** بعد تغيير الباسورد: لو الحساب محفوظ بباسورد، نحدّثه */
export function updateSavedPassword(username: string, password: string) {
  const u = username.trim().toLowerCase()
  const list = read()
  const a = list.find((x) => x.username === u)
  if (!a || !a.secret) return
  a.secret = encode(password)
  write(list)
}

export function removeAccount(username: string) {
  write(read().filter((a) => a.username !== username.trim().toLowerCase()))
}

export function accountPassword(a: SavedAccount): string | null {
  return a.secret ? decode(a.secret) : null
}

const LAST_USER = 'cd.lastUser'
export function lastUsername(): string {
  try {
    return localStorage.getItem(LAST_USER) || ''
  } catch {
    return ''
  }
}
export function setLastUsername(u: string) {
  try {
    localStorage.setItem(LAST_USER, u.trim().toLowerCase())
  } catch {
    /* ignore */
  }
}

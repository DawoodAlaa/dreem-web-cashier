import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://wqffcdjskrpcmwvqlrmi.supabase.co'
// مفتاح عام (publishable) — آمن يتحط في الموقع. ممنوع مفتاح service_role هنا.
const SUPABASE_KEY = 'sb_publishable_yW-ZdBJ5JUb3OxOBTNU6rA_u3LBTvF8'

// ───────── "افتكرني": الجلسة بتتحفظ على الجهاز فمش محتاج تسجل دخول كل مرة ─────────
// لو المستخدم شال علامة "افتكرني"، الجلسة بتتحفظ في sessionStorage وبتتمسح لما يقفل المتصفح.

const REMEMBER_KEY = 'cd.remember'

function safe(s: () => Storage): Storage | null {
  try {
    return s()
  } catch {
    return null
  }
}
const local = () => safe(() => window.localStorage)
const session = () => safe(() => window.sessionStorage)

export function getRemember(): boolean {
  try {
    return local()?.getItem(REMEMBER_KEY) !== '0'
  } catch {
    return true
  }
}
export function setRemember(v: boolean) {
  try {
    local()?.setItem(REMEMBER_KEY, v ? '1' : '0')
  } catch {
    /* المتصفح مانع التخزين */
  }
}

const authStorage = {
  getItem(k: string) {
    try {
      return local()?.getItem(k) ?? session()?.getItem(k) ?? null
    } catch {
      return null
    }
  },
  setItem(k: string, v: string) {
    try {
      if (getRemember()) {
        local()?.setItem(k, v)
        session()?.removeItem(k)
      } else {
        session()?.setItem(k, v)
        local()?.removeItem(k)
      }
    } catch {
      /* ignore */
    }
  },
  removeItem(k: string) {
    try {
      local()?.removeItem(k)
      session()?.removeItem(k)
    } catch {
      /* ignore */
    }
  },
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: authStorage,
    storageKey: 'cd.auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
  realtime: { params: { eventsPerSecond: 30 } },
})

export const usernameToEmail = (u: string) => `${u.trim().toLowerCase()}@users.cashier-dreem.app`

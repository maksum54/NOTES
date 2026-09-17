import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readJSON, removeRaw, writeJSON } from '@/lib/storage'
import { GOOGLE_CLIENT_ID, connectDrive, forgetDriveSession, isDriveConfigured } from '@/lib/drive'

/* ============================================================
   MODE LOGIN
   Dua jalur:
   1. Google Sign-In  -> sekalian memberi izin Google Drive (backup).
   2. Mode Lokal      -> nama + passcode 6 digit, tanpa akun, tanpa server.
   ============================================================ */

export type AuthMode = 'google' | 'local'

export interface Account {
  mode: AuthMode
  name: string
  email: string
  picture: string
  /** Hash passcode (khusus mode lokal). Passcode mentah tidak pernah disimpan. */
  passHash?: string
  createdAt: string
}

interface AuthValue {
  account: Account | null
  /** Terkunci = sudah punya akun lokal berpasscode tapi belum membuka kunci sesi ini. */
  locked: boolean
  googleAvailable: boolean
  signInWithGoogle: () => Promise<void>
  signInLocal: (name: string, passcode: string) => void
  unlock: (passcode: string) => boolean
  lock: () => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthValue | null>(null)
const SESSION_KEY = 'notes.session.unlocked'

/** Hash sederhana (FNV-1a). Ini kunci layar lokal, bukan pengaman kriptografis. */
function hashPasscode(passcode: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < passcode.length; i += 1) {
    h ^= passcode.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h.toString(16).padStart(8, '0')
}

interface GoogleJwtPayload {
  name?: string
  email?: string
  picture?: string
}

/** Ambil profil user dari access token Drive (scope drive.file sudah cukup untuk /userinfo). */
async function fetchGoogleProfile(): Promise<GoogleJwtPayload> {
  try {
    const raw = localStorage.getItem('notes.drive.token')
    if (!raw) return {}
    const { accessToken } = JSON.parse(raw) as { accessToken: string }
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return {}
    return (await res.json()) as GoogleJwtPayload
  } catch {
    return {}
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(() => readJSON<Account | null>('auth', null))
  const [locked, setLocked] = useState<boolean>(() => {
    const stored = readJSON<Account | null>('auth', null)
    if (!stored?.passHash) return false
    return sessionStorage.getItem(SESSION_KEY) !== '1'
  })

  useEffect(() => {
    if (account) writeJSON('auth', account)
    else removeRaw('auth')
  }, [account])

  const signInWithGoogle = useCallback(async () => {
    if (!isDriveConfigured()) throw new Error('google-not-configured')
    // connectDrive sendiri sudah meminta token SENYAP dulu kalau izinnya
    // pernah diberikan, dan baru menampilkan consent bila senyapnya gagal.
    // (Dulu di sini dikirim interactive=false untuk login berikutnya, yang
    // justru membuat login GAGAL total begitu sesi Google habis — bukannya
    // jatuh ke layar consent.)
    await connectDrive(true)
    const profile = await fetchGoogleProfile()
    setAccount({
      mode: 'google',
      name: profile.name || profile.email?.split('@')[0] || 'Google User',
      email: profile.email ?? '',
      picture: profile.picture ?? '',
      createdAt: new Date().toISOString(),
    })
    setLocked(false)
    sessionStorage.setItem(SESSION_KEY, '1')
  }, [])

  const signInLocal = useCallback((name: string, passcode: string) => {
    setAccount({
      mode: 'local',
      name: name.trim() || 'Engineer',
      email: '',
      picture: '',
      passHash: passcode ? hashPasscode(passcode) : undefined,
      createdAt: new Date().toISOString(),
    })
    setLocked(false)
    sessionStorage.setItem(SESSION_KEY, '1')
  }, [])

  const unlock = useCallback(
    (passcode: string) => {
      if (!account?.passHash) return false
      if (hashPasscode(passcode) !== account.passHash) return false
      setLocked(false)
      sessionStorage.setItem(SESSION_KEY, '1')
      return true
    },
    [account],
  )

  const lock = useCallback(() => {
    if (!account?.passHash) return
    sessionStorage.removeItem(SESSION_KEY)
    setLocked(true)
  }, [account])

  const signOut = useCallback(async () => {
    // Data project & standard sengaja TIDAK dihapus di sini — logout bukan reset.
    // Logout hanya melupakan sesi Drive di perangkat ini. Izin Google TIDAK
    // dicabut, supaya login berikutnya tersambung sendiri tanpa consent lagi.
    if (account?.mode === 'google') forgetDriveSession()
    sessionStorage.removeItem(SESSION_KEY)
    setAccount(null)
    setLocked(false)
  }, [account])

  const value = useMemo<AuthValue>(
    () => ({
      account,
      locked,
      googleAvailable: GOOGLE_CLIENT_ID.trim().length > 0,
      signInWithGoogle,
      signInLocal,
      unlock,
      lock,
      signOut,
    }),
    [account, locked, signInWithGoogle, signInLocal, unlock, lock, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth harus dipakai di dalam AuthProvider')
  return ctx
}

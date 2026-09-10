/* ============================================================
   WARNING DI HANDPHONE OR PC
   Web Notification API lewat service worker registration, jadi
   notifikasi tetap muncul di Android saat app dalam mode standalone.
   ============================================================ */

export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

export function notificationSupport(): PermissionState {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported'
  return Notification.permission as PermissionState
}

export async function requestNotificationPermission(): Promise<PermissionState> {
  if (!('Notification' in window)) return 'unsupported'
  if (Notification.permission === 'granted') return 'granted'
  if (Notification.permission === 'denied') return 'denied'
  try {
    return (await Notification.requestPermission()) as PermissionState
  } catch {
    return 'denied'
  }
}

export async function showNotification(
  title: string,
  body: string,
  opts: { tag?: string; url?: string } = {},
): Promise<void> {
  if (!('Notification' in window) || Notification.permission !== 'granted') return

  const options: NotificationOptions = {
    body,
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    tag: opts.tag,
    data: { url: opts.url ?? '/' },
  }

  try {
    // Lewat SW dulu supaya klik notifikasi bisa membuka app yang sudah jalan.
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.getRegistration()
      if (reg) {
        await reg.showNotification(title, options)
        return
      }
    }
    new Notification(title, options)
  } catch (err) {
    console.warn('[notify] gagal menampilkan notifikasi', err)
  }
}

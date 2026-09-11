/**
 * Latar belakang solid tanpa gradient. Komponen dipertahankan supaya struktur
 * <Aurora /> di AppShell tidak perlu diubah — isi (blob/gradient) sudah
 * dihapus sesuai keputusan desain "tanpa gradient".
 */
export function Aurora() {
  return <div className="aurora" aria-hidden="true" />
}

# NOTES — Engineering Project Notes

PWA untuk mencatat standard teknis (IEC / NEC / PUIL / SNI) dan melacak progres
project engineering per building & per area, dengan review otomatis oleh AI dan
backup ke Google Drive.

Dibangun mengikuti alur flowchart:

```
STORAGE GOOGLE DRIVE  <-->  CATATAN STANDARD
                            ├── BISA IMPORT DARI EXCEL
                            └── ELECTRICAL / ELECTRONIC / OTHER → PERKATEGORI

NAMA PROJECT → NAMA BUILDING   (nama bebas diketik sendiri)

 tiap building ├── SUMMARY CLIENT → AI cek ke STANDARD IEC/NEC/PUIL/SNI
               │                  → WARNING DI HANDPHONE / PC
               ├── TARGET SUBMIT  → SUDAH / BELUM
               └── TASK (TUGAS)   → SUDAH / BELUM
                     └── gambar · coretan papan tulis · link · tanya AI
```

> **Catatan soal building.** "Finish Good Warehouse", "Raw Material Warehouse",
> dan "Utility" pada flowchart adalah *contoh* nama building, bukan struktur
> tetap. Jadi ketiganya tidak dibuat otomatis — kamu menamai sendiri tiap
> building sesuai kebutuhan project, dan building itulah yang langsung
> menyimpan Summary Client, Target Submit, serta daftar Task-nya.

## Fitur

| | |
|---|---|
| **UI Apple Glass** | Material kaca berlapis (backdrop blur + saturasi), latar aurora bergerak, segmented control ala iOS |
| **Dual bahasa** | Indonesia (default) & English, seluruh label lewat dictionary terpisah — tidak ada string hardcode di komponen |
| **Dual theme** | Gelap (default), terang, dan mengikuti sistem — tersimpan di localStorage, diterapkan sebelum React mount agar tidak ada flash |
| **Mode login** | Google Sign-In (sekaligus izin Drive) atau Mode Lokal dengan passcode 6 digit tanpa akun |
| **AI** | Endpoint vikey.ai (kompatibel OpenAI). Review summary client terhadap catatan standard, asisten umum, dan chat per-task |
| **Google Drive** | Backup/restore seluruh data sebagai satu file JSON, scope `drive.file` (app hanya menyentuh file buatannya sendiri) |
| **Import Excel** | `.xlsx` / `.xls` / `.csv` → catatan standard, dengan pengenalan nama kolom yang toleran (ID & EN) |
| **Papan coretan** | Coret-coret di atas gambar seperti papan tulis: pena, stabilo, teks, penghapus. Koordinat ternormalisasi jadi tetap presisi di HP maupun PC |
| **Warning** | Notifikasi di HP & PC saat AI menemukan penyimpangan atau target submit mendekat/lewat |
| **Offline-first** | localStorage-primary + service worker; app tetap jalan penuh tanpa internet |

## Menjalankan

```bash
npm install
cp .env.example .env.local   # isi value-nya (lihat di bawah)
npm run dev                  # http://localhost:5173
```

```bash
npm run build     # type-check + build produksi ke dist/
npm run preview   # cek hasil build
```

## Environment variables

Semua opsional — app tetap jalan tanpa satu pun terisi, hanya fitur terkait yang nonaktif.

| Variable | Keterangan |
|---|---|
| `VITE_VIKEY_BASE_URL` | Base URL endpoint AI. Default `https://api.vikey.ai/v1` |
| `VITE_VIKEY_MODEL` | Model ID default, mis. `gpt-4o-mini` |
| `VITE_VIKEY_API_KEY` | **Hanya untuk development lokal.** Di production dikosongkan — user memasukkan key sendiri lewat Pengaturan, tersimpan di localStorage browser masing-masing supaya tidak ikut ter-bundle ke JS publik |
| `VITE_GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID (tipe *Web application*) dari Google Cloud Console. Aman diekspos di client (ini bukan client secret) |

`.env.local` tidak pernah di-commit — `.gitignore` sudah menutup `.env*` kecuali `.env.example`.

### Menyiapkan Google Drive

1. Google Cloud Console → buat project → **APIs & Services → Library** → aktifkan **Google Drive API**.
2. **Credentials → Create Credentials → OAuth client ID → Web application**.
3. *Authorized JavaScript origins*: `http://localhost:5173` dan domain Vercel kamu.
4. Salin Client ID ke `VITE_GOOGLE_CLIENT_ID`.

Scope yang diminta hanya `drive.file`, jadi aplikasi ini tidak bisa membaca file lain di Drive kamu.

## Deploy ke Vercel

Import repo di Vercel (framework terdeteksi otomatis sebagai Vite), lalu isi env var
di **Settings → Environment Variables**, bedakan scope Production / Preview / Development.
Setelah menambah atau mengubah env var, **redeploy manual** — deployment yang sudah jalan
tidak otomatis memakai nilai baru.

`vercel.json` sudah mengatur SPA rewrite, `no-cache` untuk `/sw.js`, dan cache
permanen untuk `/assets/*`.

## Format Excel catatan standard

Baris pertama dianggap header. Kolom yang dikenali (kapital, spasi, dan underscore diabaikan):

| Kolom | Alias yang juga diterima |
|---|---|
| `category` | kategori, jenis, tipe, type |
| `subcategory` | perkategori, subkategori, group, grup |
| `body` | standard, standar, badan, source, sumber |
| `code` | kode, clause, klausul, pasal, ref, referensi |
| `title` | judul, nama, name, subject |
| `content` | isi, konten, deskripsi, description, keterangan, catatan |
| `tags` | tag, label, keyword, keywords |

Template siap pakai bisa diunduh dari halaman **Catatan Standard → Unduh template Excel**.

## Struktur

```
src/
├── components/
│   ├── glass/        Kit UI kaca: Card, Button, Field, Modal, Segmented, Badge
│   ├── layout/       AppShell (sidebar + tab bar), Aurora, PageHeader, InstallPrompt
│   └── icons.tsx     Ikon garis tipis bergaya SF Symbols
├── context/          Theme, Lang, Auth, Data (satu sumber kebenaran + auto-sync Drive)
├── features/
│   └── whiteboard/   Papan coretan di atas gambar
├── i18n/             Dictionary id.ts & en.ts
├── lib/              storage, ai (vikey), drive, excel, notify, utils
├── pages/            Login, Dashboard, Projects, ProjectDetail,
│                     BuildingDetail, TaskDetail, Standards, Warnings,
│                     Assistant, Settings
└── types/            Model data yang diturunkan dari flowchart
```

## Catatan arsitektur

- **localStorage-primary.** Data utama hidup di perangkat; Google Drive adalah lapisan
  sinkron, bukan sumber kebenaran. Kalau Drive atau AI mati, app tetap jalan penuh.
- **Backup otomatis di-debounce 4 detik**, jadi mengetik cepat tidak memicu puluhan upload.
- **Gambar dikompres** (maks 1600px, JPEG q82) sebelum disimpan supaya localStorage tidak cepat penuh.
- **Coretan disimpan sebagai koordinat 0..1**, bukan piksel, jadi tetap menempel presisi di ukuran layar apa pun.
- **API key AI tidak pernah masuk bundle produksi** — diisi user lewat Pengaturan.
- **Building adalah unit terkecil.** Tidak ada level sub-area; nama building
  bebas, sehingga satu project bisa berisi "Raw Material Warehouse", "Utility",
  atau apa pun sesuai kebutuhan lapangan.
- **Migrasi data v1 → v2.** Data dari versi sebelumnya (yang building-nya punya
  tiga area tetap) tidak kompatibel, jadi project lama dibuang otomatis saat app
  dibuka. Catatan standard tetap dipertahankan karena tidak terpengaruh.

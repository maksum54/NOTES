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
| **Google Drive** | Backup/restore seluruh data sebagai satu file JSON, scope `drive.file` (app hanya menyentuh file buatannya sendiri). Login Google = Drive & Storage langsung tersambung; consent hanya sekali di awal |
| **Import Excel** | `.xlsx` / `.xls` / `.csv` → catatan standard, dengan pengenalan nama kolom yang toleran (ID & EN) |
| **Papan coretan** | Coret-coret di atas gambar seperti papan tulis: pena, stabilo, teks, penghapus. Koordinat ternormalisasi jadi tetap presisi di HP maupun PC |
| **Warning** | Notifikasi di HP & PC saat AI menemukan penyimpangan atau target submit mendekat/lewat |
| **Sticky note mengambang** | Sampai DUA catatan/task bisa menempel sekaligus (slot atas & bawah), dan keduanya bisa dilepas jadi JENDELA sendiri yang selalu tampil di atas aplikasi lain (Document Picture-in-Picture) — tetap terlihat walau browser di-minimize |
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
├── lib/              storage, ai (vikey), drive, excel, notify,
│                     detachedWindow, pinnedPopups, utils
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
- **Maksimal dua sticky sekaligus.** Popup yang menempel disimpan sebagai
  daftar dua slot (atas & bawah) di `lib/pinnedPopups.ts`, jadi catatan dan
  task bisa menempel berdampingan tanpa saling menimpa. Pin ketiga mengambil
  slot popup yang paling lama menempel; catatan itu sendiri tidak diubah —
  statusnya tetap tersemat di halaman Catatan, hanya popup melayangnya yang
  berhenti. Di jendela sticky keduanya ditumpuk atas–bawah dalam SATU jendela,
  karena browser hanya mengizinkan satu jendela Picture-in-Picture per tab.
- **Satu editor untuk task & catatan.** "Task Baru" di halaman building tidak
  membuka form judul/deskripsi/tenggat, melainkan langsung membuat task kosong
  lalu membuka pop-up editor ala Keep yang sama dengan "Catatan Baru" — judul,
  rich text, warna, pengingat, checklist, gambar, sampai pin. Pin dari halaman
  building juga ikut menempel (popup melayang), sama seperti halaman Task.
- **Warna kartu menentukan warna teks, bukan tema.** Kartu/pop-up yang diberi
  warna dari palet mengunci variabel `--ink` sesuai luminansi warnanya
  (`inkStyleFor` di `lib/utils.ts`), supaya catatan kuning di tema gelap tidak
  jadi teks putih di atas kuning. Panel yang punya latar sendiri di atasnya
  (palet, menu) memakai kelas `.ink-theme` untuk menarik kembali tinta tema.
- **Sticky note = jendela OS, bukan div.** Popup yang di-pin bisa dipindah ke
  jendela Document Picture-in-Picture (Chrome/Edge 116+) yang selalu di atas
  aplikasi lain, jadi catatan tetap terlihat saat browser di-minimize atau
  ketutup Excel/AutoCAD. Browser tanpa API itu memakai `window.open` biasa —
  tetap jendela sendiri, hanya tidak always-on-top. Isinya tetap dirender React
  halaman utama lewat portal (CSS & tema disalin ke dokumen jendela), sehingga
  editing, auto-save, dan sinkron Drive berjalan sama persis. Aktifkan
  "pin = langsung jadi sticky note" di Pengaturan -> Tampilan kalau mau otomatis.
- **Drive tersambung sendiri, consent hanya sekali.** Token Google berumur
  ~1 jam, jadi tiap app dibuka token diperbarui SENYAP (`prompt: ''`) selama
  izinnya pernah diberikan. Halaman Storage/Pengaturan/Beranda mengikuti status
  itu lewat `useDriveStatus` (bukan memotretnya sekali saat mount), sehingga
  halaman yang dibuka selagi perbaruan berjalan tidak lagi salah bilang "belum
  tersambung". Logout hanya melupakan sesi Drive di perangkat ini — izinnya
  TIDAK dicabut, supaya login berikutnya langsung tersambung. Hanya tombol
  "Putuskan" yang benar-benar mencabut izin; penandanya disimpan
  (`notes.drive.optOut`) supaya reload tidak menyambungkan ulang diam-diam.
- **API key AI tidak pernah masuk bundle produksi** — diisi user lewat Pengaturan.
- **Building adalah unit terkecil.** Tidak ada level sub-area; nama building
  bebas, sehingga satu project bisa berisi "Raw Material Warehouse", "Utility",
  atau apa pun sesuai kebutuhan lapangan.
- **Migrasi data v1 → v2.** Data dari versi sebelumnya (yang building-nya punya
  tiga area tetap) tidak kompatibel, jadi project lama dibuang otomatis saat app
  dibuka. Catatan standard tetap dipertahankan karena tidak terpengaruh.

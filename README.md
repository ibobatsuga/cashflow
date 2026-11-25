# MoneyMap — Smart Cashflow & Wealth Workspace

**MoneyMap** adalah aplikasi web progresif (PWA) untuk mengelola arus kas harian, alokasi anggaran keluarga (*sandwich generation*), portofolio multi-aset, hutang-piutang, serta laporan neraca keuangan — dibangun menggunakan sistem desain *Soft-Neumorphic Cerulean SaaS Dashboard* dengan tipografi **Manrope**.

## Fitur Utama

- **Executive Cashflow Dashboard:** Ringkasan Kekayaan Bersih, Pemasukan, Pengeluaran, Kas & Dana Darurat, grafik performa arus kas 6 bulan, ritme belanja mingguan, komposisi pilar alokasi, dan jurnal terbaru.
- **Alokasi Hibrida & Cut-off Gajian Kustom:** Kunci alokasi per pos dalam **Persentase (%)** maupun **Nominal Tetap (Rp)**, lengkap dengan periode gajian tanggal `1–28` dan pembekuan snapshot bulanan.
- **Kantong Multi-Aset & Harga Buku Rata-rata:** Mendukung kantong `Rp`, `gram` (Emas), `lot` (Saham), `lembar`, `valas`, dan unit kustom dengan kalkulasi modal tertanam, *unrealized/realized P&L*, serta fitur **Cocokkan Saldo (Rekonsiliasi)**.
- **Tracker Hutang & Piutang Terintegrasi Neraca:** Memisahkan pembayaran **Pokok** (pengurang kewajiban neraca) dari **Bunga** (beban operasional).
- **Laporan 3-Pernyataan & Ekspor PDF A4:** Neraca Kekayaan Bersih, Arus Kas per Kantong, dan Surplus/Defisit Operasional lengkap dengan pembanding periode sebelumnya serta unduhan PDF A4 siap cetak.
- **Privasi Lokal Ganda (Zero-Server Vault):** Penyimpanan ganda sinkron-asinkron di `localStorage` + `IndexedDB` (`moneymap_db`) dan ekspor/impor JSON tervalidasi.

## Menjalankan Secara Lokal

```bash
npm install
npm run dev
```

Build produksi:

```bash
npm run build
```

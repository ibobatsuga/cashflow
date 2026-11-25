import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { MoneyMapState } from '../types';
import {
  computeBalanceSheet,
  computeCashFlowStatement,
  computeIncomeStatement,
  fmtRp,
  fmtSignedRp,
  fmtUnit,
  formatPeriodLabel,
  formatShortDate,
  getPeriodRange,
  getPrevPeriodKey,
  todayISO,
} from './financeEngine';

function asciiSafe(input: string): string {
  return (input || '')
    .replace(/\u2212/g, '-')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2192/g, '->')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export interface PdfReportOptions {
  periodKey: string;
  includeNeraca: boolean;
  includeArusKas: boolean;
  includeLabaRugi: boolean;
  includeDebts: boolean;
  includeTransactions: boolean;
}

export function exportFinancialReportPDF(state: MoneyMapState, opts: PdfReportOptions): void {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  const cutoff = state.setup.cutoffDay;
  const curRange = getPeriodRange(opts.periodKey, cutoff);
  const prevKey = getPrevPeriodKey(opts.periodKey);
  const prevRange = getPeriodRange(prevKey, cutoff);

  const curLabel = asciiSafe(formatPeriodLabel(opts.periodKey, cutoff, true));
  const prevLabel = asciiSafe(formatPeriodLabel(prevKey, cutoff, false));
  const owner = asciiSafe(state.setup.nama || 'MoneyMap Workspace');

  const margin = 14;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(26, 70, 115); // #1A4673
    doc.text(`MoneyMap - Laporan Keuangan (${owner})`, margin, 14);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(113, 113, 113);
    doc.text(`Periode: ${curLabel}   |   Pembanding: ${prevLabel}   |   Dicetak: ${todayISO()}`, margin, 19.5);

    doc.setDrawColor(225, 225, 225);
    doc.setLineWidth(0.35);
    doc.line(margin, 22.5, pageWidth - margin, 22.5);
  };

  drawHeader();
  let y = 28;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 16) {
      doc.addPage();
      drawHeader();
      y = 28;
    }
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setFillColor(240, 240, 243);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 7.5, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 0);
    doc.text(asciiSafe(title), margin + 3, y + 5.1);
    y += 10;
  };

  if (opts.includeNeraca) {
    const bsCur = computeBalanceSheet(state, curRange.selesai);
    const bsPrev = computeBalanceSheet(state, prevRange.selesai);
    sectionTitle('1. Neraca & Kekayaan Bersih (Net Worth)');

    const rows: string[][] = [
      ['Kas & Likuiditas Harian', fmtRp(bsPrev.totalKas), fmtRp(bsCur.totalKas), asciiSafe(fmtSignedRp(bsCur.totalKas - bsPrev.totalKas))],
      ['Portofolio Investasi', fmtRp(bsPrev.totalInvestasi), fmtRp(bsCur.totalInvestasi), asciiSafe(fmtSignedRp(bsCur.totalInvestasi - bsPrev.totalInvestasi))],
      ['Piutang Aktif', fmtRp(bsPrev.totalPiutang), fmtRp(bsCur.totalPiutang), asciiSafe(fmtSignedRp(bsCur.totalPiutang - bsPrev.totalPiutang))],
      ['TOTAL ASET', fmtRp(bsPrev.totalAset), fmtRp(bsCur.totalAset), asciiSafe(fmtSignedRp(bsCur.totalAset - bsPrev.totalAset))],
      ['TOTAL KEWAJIBAN (HUTANG)', fmtRp(bsPrev.totalHutang), fmtRp(bsCur.totalHutang), asciiSafe(fmtSignedRp(bsCur.totalHutang - bsPrev.totalHutang))],
      ['KEKAYAAN BERSIH', fmtRp(bsPrev.kekayaanBersih), fmtRp(bsCur.kekayaanBersih), asciiSafe(fmtSignedRp(bsCur.kekayaanBersih - bsPrev.kekayaanBersih))],
    ];

    autoTable(doc, {
      startY: y,
      head: [['Komponen Neraca', prevLabel, asciiSafe(formatPeriodLabel(opts.periodKey, cutoff, false)), 'Perubahan']],
      body: rows,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [20, 20, 20], lineColor: [225, 225, 225] },
      headStyles: { fillColor: [28, 144, 194], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.row.index === 3 || data.row.index === 5)) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { top: 28, left: margin, right: margin, bottom: 16 },
      didDrawPage: drawHeader,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  if (opts.includeArusKas) {
    const cf = computeCashFlowStatement(state, curRange);
    sectionTitle('2. Arus Kas per Kantong Likuid');
    const tAwal = cf.reduce((s, r) => s + r.awal, 0);
    const tMasuk = cf.reduce((s, r) => s + r.masuk, 0);
    const tKeluar = cf.reduce((s, r) => s + r.keluar, 0);
    const tAkhir = cf.reduce((s, r) => s + r.akhir, 0);

    const body = cf.map((r) => [
      asciiSafe(r.pocket.nama),
      fmtRp(r.awal),
      r.masuk > 0 ? `+${fmtRp(r.masuk)}` : '-',
      r.keluar > 0 ? `-${fmtRp(r.keluar)}` : '-',
      fmtRp(r.akhir),
    ]);
    body.push(['TOTAL KAS', fmtRp(tAwal), `+${fmtRp(tMasuk)}`, `-${fmtRp(tKeluar)}`, fmtRp(tAkhir)]);

    autoTable(doc, {
      startY: y,
      head: [['Kantong Kas', 'Saldo Awal', 'Uang Masuk', 'Uang Keluar', 'Saldo Akhir']],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [20, 20, 20], lineColor: [225, 225, 225] },
      headStyles: { fillColor: [26, 70, 115], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && data.row.index === body.length - 1) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { top: 28, left: margin, right: margin, bottom: 16 },
      didDrawPage: drawHeader,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  if (opts.includeLabaRugi) {
    const isCur = computeIncomeStatement(state, curRange);
    sectionTitle('3. Ringkasan Surplus / Defisit Operasional');
    const catRows = Object.entries(isCur.perKategori)
      .sort((a, b) => b[1] - a[1])
      .map(([cat, val]) => [`   - ${asciiSafe(cat)}`, fmtRp(val)]);

    const body: string[][] = [
      ['Total Pemasukan Tercatat', fmtRp(isCur.masuk)],
      ...catRows,
      ['Total Pengeluaran Operasional', fmtRp(isCur.keluarOperasional)],
    ];
    if (isCur.bungaHutang > 0) {
      body.push(['Beban Bunga & Biaya Cicilan', fmtRp(isCur.bungaHutang)]);
    }
    if (Math.abs(isCur.untungRealisasiAset) >= 1) {
      body.push(['Keuntungan / Kerugian Realisasi Aset', asciiSafe(fmtSignedRp(isCur.untungRealisasiAset))]);
    }
    body.push([
      isCur.surplusBersih >= 0 ? 'SURPLUS BERSIH PERIODE INI' : 'DEFISIT BERSIH PERIODE INI',
      asciiSafe(fmtSignedRp(isCur.surplusBersih)),
    ]);

    autoTable(doc, {
      startY: y,
      head: [['Komponen Laba / Rugi Arus Kas', 'Nominal']],
      body,
      theme: 'grid',
      styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, textColor: [20, 20, 20], lineColor: [225, 225, 225] },
      headStyles: { fillColor: [28, 144, 194], textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 1: { halign: 'right' } },
      didParseCell: (data) => {
        if (data.section === 'body' && (data.row.index === 0 || data.row.index === body.length - 1)) {
          data.cell.styles.fontStyle = 'bold';
        }
      },
      margin: { top: 28, left: margin, right: margin, bottom: 16 },
      didDrawPage: drawHeader,
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
  }

  if (opts.includeDebts) {
    const activeDebts = state.debts.filter((d) => d.sisa > 0);
    sectionTitle('4. Posisi Hutang & Piutang Aktif');
    if (activeDebts.length === 0) {
      doc.setFontSize(8.5);
      doc.setTextColor(113, 113, 113);
      doc.text('Tidak ada kontrak hutang atau piutang aktif pada akhir periode ini.', margin, y + 3);
      y += 9;
    } else {
      autoTable(doc, {
        startY: y,
        head: [['Nama Kontrak', 'Tipe', 'Total Awal', 'Sisa Pokok', 'Status']],
        body: activeDebts.map((d) => [
          asciiSafe(d.nama),
          d.tipe === 'piutang' ? 'Piutang' : 'Hutang',
          fmtRp(d.nominal),
          fmtRp(d.sisa),
          d.cair ? 'Aktif' : 'Komitmen',
        ]),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2, lineColor: [225, 225, 225] },
        headStyles: { fillColor: [26, 70, 115], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
        margin: { top: 28, left: margin, right: margin, bottom: 16 },
        didDrawPage: drawHeader,
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 7;
    }
  }

  if (opts.includeTransactions) {
    const txns = state.transactions
      .filter((t) => t.tgl >= curRange.mulai && t.tgl <= curRange.selesai)
      .sort((a, b) => a.tgl.localeCompare(b.tgl));
    sectionTitle(`5. Rincian Jurnal Transaksi (${txns.length} Baris)`);
    if (txns.length > 0) {
      const pocketById = new Map(state.pockets.map((p) => [p.id, p]));
      autoTable(doc, {
        startY: y,
        head: [['Tanggal', 'Tipe', 'Kategori / Keterangan', 'Kantong', 'Nominal']],
        body: txns.map((t) => {
          const src = pocketById.get(t.kantongId);
          const dst = t.kantongTujuanId ? pocketById.get(t.kantongTujuanId) : null;
          const kLabel = asciiSafe(
            dst ? `${src?.nama || '-'} -> ${dst.nama} (${t.unit ? fmtUnit(t.unit, dst) : ''})` : src?.nama || '-'
          );
          return [
            formatShortDate(t.tgl),
            asciiSafe(t.tipe.replace('_', ' ')),
            asciiSafe(t.kat ? `${t.kat}${t.ket ? ' - ' + t.ket : ''}` : t.ket || '-'),
            kLabel,
            fmtRp(t.nominal),
          ];
        }),
        theme: 'grid',
        styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.7, lineColor: [225, 225, 225] },
        headStyles: { fillColor: [28, 144, 194], textColor: [255, 255, 255], fontStyle: 'bold' },
        columnStyles: { 4: { halign: 'right' } },
        margin: { top: 28, left: margin, right: margin, bottom: 16 },
        didDrawPage: drawHeader,
      });
    }
  }

  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(
      `MoneyMap Smart Cashflow OS  •  Halaman ${i} dari ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const safeSlug = owner.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'Workspace';
  doc.save(`MoneyMap-Laporan-${safeSlug}-${opts.periodKey}.pdf`);
}

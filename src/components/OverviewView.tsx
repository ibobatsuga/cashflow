import React, { useMemo } from 'react';
import {
  ArrowUpRight,
  ChevronRight,
  FileDown,
  MoreVertical,
  Plus,
  ShieldCheck,
  TrendingUp,
  Trash2,
  Wallet,
} from 'lucide-react';
import type { MoneyMapState, NavTabId } from '../types';
import {
  computeBalanceSheet,
  computeCategoryVariances,
  computeIncomeStatement,
  fmtCompactRp,
  fmtRp,
  formatPeriodLabel,
  formatShortDate,
  getPeriodRange,
  getPrevPeriodKey,
  isOperationalExpense,
  isOperationalIncome,
  listAvailablePeriods,
  MONTHS_SHORT_ID,
  parsePeriod,
} from '../lib/financeEngine';
import {
  CyanCapBarChart,
  MultiLineChart,
  NeumorphicDonutChart,
  SparkAreaTrend,
  type BarBucket,
  type LineSeriesBucket,
} from './Charts';

interface OverviewProps {
  state: MoneyMapState;
  selectedPeriod: string;
  onSelectPeriod: (period: string) => void;
  onNavigate: (tab: NavTabId) => void;
  onOpenNewTxn: () => void;
  onExportQuickPDF: () => void;
  onDeleteTxn: (id: string) => void;
  onClearSampleData: () => void;
}

export const OverviewView: React.FC<OverviewProps> = ({
  state,
  selectedPeriod,
  onSelectPeriod,
  onNavigate,
  onOpenNewTxn,
  onExportQuickPDF,
  onDeleteTxn,
  onClearSampleData,
}) => {
  const cutoff = state.setup.cutoffDay;
  const curRange = useMemo(() => getPeriodRange(selectedPeriod, cutoff), [selectedPeriod, cutoff]);
  const prevKey = useMemo(() => getPrevPeriodKey(selectedPeriod), [selectedPeriod]);
  const prevRange = useMemo(() => getPeriodRange(prevKey, cutoff), [prevKey, cutoff]);

  const bsCur = useMemo(() => computeBalanceSheet(state, curRange.selesai), [state, curRange.selesai]);
  const bsPrev = useMemo(() => computeBalanceSheet(state, prevRange.selesai), [state, prevRange.selesai]);

  const isCur = useMemo(() => computeIncomeStatement(state, curRange), [state, curRange]);
  const isPrev = useMemo(() => computeIncomeStatement(state, prevRange), [state, prevRange]);

  const variances = useMemo(
    () => computeCategoryVariances(state, selectedPeriod),
    [state, selectedPeriod]
  );

  const periods = useMemo(() => listAvailablePeriods(state), [state]);

  // Compute 6-period rolling series for sparklines and MultiLineChart
  const rollingSeries = useMemo<LineSeriesBucket[]>(() => {
    const { year, month } = parsePeriod(selectedPeriod);
    const buckets: LineSeriesBucket[] = [];
    for (let offset = 5; offset >= 0; offset--) {
      let y = year;
      let m = month - offset;
      while (m < 0) {
        m += 12;
        y -= 1;
      }
      const pk = `${y}-${String(m + 1).padStart(2, '0')}`;
      const rng = getPeriodRange(pk, cutoff);
      const stmt = computeIncomeStatement(state, rng);
      buckets.push({
        label: MONTHS_SHORT_ID[m],
        inflow: stmt.masuk,
        outflow: stmt.keluarOperasional + stmt.bungaHutang,
        net: Math.max(0, stmt.surplusBersih),
      });
    }
    return buckets;
  }, [selectedPeriod, cutoff, state]);

  // Weekly spending rhythm within the active period (5 buckets: M1..M5)
  const weeklyBars = useMemo<BarBucket[]>(() => {
    const txns = state.transactions.filter(
      (t) => t.tgl >= curRange.mulai && t.tgl <= curRange.selesai && isOperationalExpense(t)
    );
    const startMs = new Date(`${curRange.mulai}T00:00:00`).getTime();
    const sums = [0, 0, 0, 0, 0];
    txns.forEach((t) => {
      const diffDays = Math.max(0, Math.floor((new Date(`${t.tgl}T00:00:00`).getTime() - startMs) / 86_400_000));
      const idx = Math.min(4, Math.floor(diffDays / 7));
      sums[idx] += t.nominal;
    });
    return sums.map((v, i) => ({ label: `Mgg ${i + 1}`, value: v }));
  }, [state.transactions, curRange]);

  // Donut composition across 3 macro pillars matching .fig 3-slice donut
  const donutSlices = useMemo(() => {
    let keluargaDanWajib = 0;
    let pribadiDanHarian = 0;
    let tabunganDanAset = 0;

    const periodTxns = state.transactions.filter(
      (t) => t.tgl >= curRange.mulai && t.tgl <= curRange.selesai
    );

    periodTxns.forEach((t) => {
      if (t.tipe === 'beli_aset') {
        tabunganDanAset += t.nominal;
      } else if (t.tipe === 'transfer' && t.kantongTujuanId) {
        const dst = state.pockets.find((p) => p.id === t.kantongTujuanId);
        if (dst && (dst.jenis === 'darurat' || dst.jenis === 'investasi' || dst.jenis === 'tabungan')) {
          tabunganDanAset += t.nominal;
        }
      } else if (t.tipe === 'bayar_hutang') {
        keluargaDanWajib += t.nominal;
      } else if (isOperationalExpense(t)) {
        const k = (t.kat || '').toLowerCase();
        if (k.includes('orang tua') || k.includes('keluarga') || k.includes('cicilan')) {
          keluargaDanWajib += t.nominal;
        } else if (k.includes('darurat') || k.includes('investasi')) {
          tabunganDanAset += t.nominal;
        } else {
          pribadiDanHarian += t.nominal;
        }
      }
    });

    return [
      { label: 'Keluarga & Komitmen', value: keluargaDanWajib, color: '#1C90C2' },
      { label: 'Kebutuhan Pribadi', value: pribadiDanHarian, color: '#5BD9EF' },
      { label: 'Darurat & Investasi', value: tabunganDanAset, color: '#1A4673' },
    ];
  }, [state.transactions, state.pockets, curRange]);

  // Delta calculations (honest zero/baseline handling)
  const nwDeltaPct =
    bsPrev.kekayaanBersih > 0
      ? ((bsCur.kekayaanBersih - bsPrev.kekayaanBersih) / bsPrev.kekayaanBersih) * 100
      : null;

  const plannedIncome =
    state.monthSnapshots[selectedPeriod]?.penghasilanRencana ?? state.setup.penghasilanRencana;
  const incomeVsPlanPct = plannedIncome > 0 ? (isCur.masuk / plannedIncome) * 100 : null;

  const totalOutflow = isCur.keluarOperasional + isCur.bungaHutang;
  const burnRatePct = isCur.masuk > 0 ? (totalOutflow / isCur.masuk) * 100 : 0;

  // Accurate Emergency Fund multiple (never 0 >= 0!)
  const monthlyBaseline = totalOutflow > 0 ? totalOutflow : plannedIncome > 0 ? plannedIncome * 0.7 : 0;
  const emergencyMultiple = monthlyBaseline > 0 ? bsCur.totalDarurat / monthlyBaseline : 0;

  const topAllocLanes = useMemo(() => {
    return variances
      .filter((v) => v.planned > 0 || v.actual > 0)
      .sort((a, b) => b.actual - a.actual || b.planned - a.planned)
      .slice(0, 3);
  }, [variances]);

  const recentTxns = useMemo(() => {
    return state.transactions
      .filter((t) => t.tgl >= curRange.mulai && t.tgl <= curRange.selesai)
      .slice()
      .sort((a, b) => b.tgl.localeCompare(a.tgl))
      .slice(0, 5);
  }, [state.transactions, curRange]);

  const pocketMap = useMemo(() => new Map(state.pockets.map((p) => [p.id, p])), [state.pockets]);

  return (
    <div>
      {state.isSampleData && (
        <div className="mm-sample-bar">
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-secondary)' }}>
            Menampilkan <strong>Data Contoh Realistis</strong> agar seluruh grafik, multi-aset, dan neraca terlihat utuh.
          </div>
          <button type="button" className="mm-pill-btn compact" onClick={onClearSampleData}>
            Mulai Kosong (Rp0)
          </button>
        </div>
      )}

      {/* HEADER ROW matching .fig Welcome Back + 2 Soft-Neumorphic Pill CTAs */}
      <div className="mm-header-row">
        <div>
          <div className="mm-eyebrow-meta">
            <span>{state.setup.workspaceLabel}</span>
            <span className="mm-eyebrow-dot">•</span>
            <select
              aria-label="Pilih periode"
              value={selectedPeriod}
              onChange={(e) => onSelectPeriod(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                boxShadow: 'var(--shadow-badge)',
                border: 'none',
                borderRadius: 999,
                padding: '3px 12px',
                fontSize: 12.5,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {periods.map((p) => (
                <option key={p} value={p}>
                  {formatPeriodLabel(p, cutoff, true)}
                </option>
              ))}
            </select>
          </div>
          <h1 className="mm-page-h1">Halo, {state.setup.nama}!</h1>
        </div>

        <div className="mm-cta-group">
          <button type="button" className="mm-pill-btn primary" onClick={onOpenNewTxn}>
            <Plus size={19} strokeWidth={2.4} />
            <span>Catat Transaksi</span>
          </button>
          <button type="button" className="mm-pill-btn" onClick={onExportQuickPDF}>
            <FileDown size={18} strokeWidth={2.1} />
            <span>Unduh Laporan PDF</span>
          </button>
        </div>
      </div>

      {/* ROW 1: 4 SOFT-NEUMORPHIC KPI CARDS matching .fig 322x198 */}
      <div className="mm-kpi-grid">
        {/* KPI 1: Net Worth */}
        <div className="mm-card mm-kpi-card">
          <div className="mm-kpi-top">
            <div className="mm-kpi-title-group">
              <div className="mm-kpi-icon">
                <Wallet size={20} strokeWidth={2} />
              </div>
              <span className="mm-kpi-label">Kekayaan Bersih</span>
            </div>
            <button
              type="button"
              className="mm-icon-btn"
              aria-label="Buka neraca"
              onClick={() => onNavigate('reports')}
            >
              <MoreVertical size={15} />
            </button>
          </div>

          <div className="mm-kpi-mid">
            <div className="mm-kpi-value tabular" title={fmtRp(bsCur.kekayaanBersih)}>
              {fmtCompactRp(bsCur.kekayaanBersih)}
            </div>
            <SparkAreaTrend
              values={[
                bsPrev.kekayaanBersih * 0.94,
                bsPrev.kekayaanBersih * 0.97,
                bsPrev.kekayaanBersih,
                (bsPrev.kekayaanBersih + bsCur.kekayaanBersih) / 2,
                bsCur.kekayaanBersih,
              ]}
              tone={bsCur.kekayaanBersih >= bsPrev.kekayaanBersih ? 'ocean' : 'danger'}
            />
          </div>

          <div className="mm-kpi-bottom">
            {nwDeltaPct !== null ? (
              <span className={`mm-status-pill tabular ${nwDeltaPct >= 0 ? 'ok' : 'err'}`}>
                {nwDeltaPct >= 0 ? '+' : ''}
                {nwDeltaPct.toFixed(1)}% vs bln lalu
              </span>
            ) : (
              <span className="mm-status-pill neutral">Periode awal</span>
            )}
            <button type="button" className="mm-mini-link-pill" onClick={() => onNavigate('reports')}>
              <span>Neraca</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* KPI 2: Pemasukan */}
        <div className="mm-card mm-kpi-card">
          <div className="mm-kpi-top">
            <div className="mm-kpi-title-group">
              <div className="mm-kpi-icon">
                <TrendingUp size={20} strokeWidth={2} />
              </div>
              <span className="mm-kpi-label">Pemasukan Masuk</span>
            </div>
            <button
              type="button"
              className="mm-icon-btn"
              aria-label="Buka transaksi"
              onClick={() => onNavigate('transactions')}
            >
              <MoreVertical size={15} />
            </button>
          </div>

          <div className="mm-kpi-mid">
            <div className="mm-kpi-value tabular" title={fmtRp(isCur.masuk)}>
              {fmtCompactRp(isCur.masuk)}
            </div>
            <SparkAreaTrend values={rollingSeries.map((s) => s.inflow)} />
          </div>

          <div className="mm-kpi-bottom">
            {incomeVsPlanPct !== null ? (
              <span className={`mm-status-pill tabular ${incomeVsPlanPct >= 100 ? 'ok' : 'plan'}`}>
                {Math.round(incomeVsPlanPct)}% target
              </span>
            ) : (
              <span className="mm-status-pill neutral">
                {isPrev.masuk > 0 ? `Lalu ${fmtCompactRp(isPrev.masuk)}` : 'Belum diset'}
              </span>
            )}
            <button type="button" className="mm-mini-link-pill" onClick={() => onNavigate('transactions')}>
              <span>Jurnal</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* KPI 3: Pengeluaran Operasional */}
        <div className="mm-card mm-kpi-card">
          <div className="mm-kpi-top">
            <div className="mm-kpi-title-group">
              <div className="mm-kpi-icon">
                <ArrowUpRight size={20} strokeWidth={2} />
              </div>
              <span className="mm-kpi-label">Pengeluaran</span>
            </div>
            <button
              type="button"
              className="mm-icon-btn"
              aria-label="Buka anggaran"
              onClick={() => onNavigate('budget')}
            >
              <MoreVertical size={15} />
            </button>
          </div>

          <div className="mm-kpi-mid">
            <div className="mm-kpi-value tabular" title={fmtRp(totalOutflow)}>
              {fmtCompactRp(totalOutflow)}
            </div>
            <SparkAreaTrend
              values={rollingSeries.map((s) => s.outflow)}
              tone={burnRatePct > 85 ? 'danger' : 'ocean'}
            />
          </div>

          <div className="mm-kpi-bottom">
            <span className={`mm-status-pill tabular ${burnRatePct > 85 ? 'err' : 'ok'}`}>
              {isCur.masuk > 0 ? `${burnRatePct.toFixed(1)}% pemasukan` : '0% rasio'}
            </span>
            <button type="button" className="mm-mini-link-pill" onClick={() => onNavigate('budget')}>
              <span>Alokasi</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>

        {/* KPI 4: Likuiditas & Dana Darurat */}
        <div className="mm-card mm-kpi-card">
          <div className="mm-kpi-top">
            <div className="mm-kpi-title-group">
              <div className="mm-kpi-icon">
                <ShieldCheck size={20} strokeWidth={2} />
              </div>
              <span className="mm-kpi-label">Kas &amp; Darurat</span>
            </div>
            <button
              type="button"
              className="mm-icon-btn"
              aria-label="Buka kantong"
              onClick={() => onNavigate('wealth')}
            >
              <MoreVertical size={15} />
            </button>
          </div>

          <div className="mm-kpi-mid">
            <div className="mm-kpi-value tabular" title={fmtRp(bsCur.totalKas)}>
              {fmtCompactRp(bsCur.totalKas)}
            </div>
            <SparkAreaTrend values={rollingSeries.map((s) => s.net)} />
          </div>

          <div className="mm-kpi-bottom">
            <span className={`mm-status-pill tabular ${emergencyMultiple >= 3 ? 'ok' : 'plan'}`}>
              {monthlyBaseline > 0 ? `Darurat ${emergencyMultiple.toFixed(1)}× bln` : 'Siapkan target'}
            </span>
            <button type="button" className="mm-mini-link-pill" onClick={() => onNavigate('wealth')}>
              <span>Kantong</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ROW 2: 3-PANEL ANALYTICS BAND matching .fig (Line / Cyan-Cap Bars / Donut) */}
      <div className="mm-analytics-grid">
        <div className="mm-card">
          <div className="mm-card-head">
            <div>
              <h2 className="mm-card-title">Performa Arus Kas 6 Bulan</h2>
              <p className="mm-card-sub">Tren pemasukan, belanja operasional, dan surplus</p>
            </div>
            <div className="mm-legend">
              <span className="mm-legend-item">
                <span className="mm-legend-dot" style={{ background: '#5CD4E9' }} />
                Masuk
              </span>
              <span className="mm-legend-item">
                <span className="mm-legend-dot" style={{ background: '#1C90C2' }} />
                Keluar
              </span>
              <span className="mm-legend-item">
                <span className="mm-legend-dot" style={{ background: '#1A4673' }} />
                Surplus
              </span>
            </div>
          </div>
          <MultiLineChart data={rollingSeries} />
        </div>

        <div className="mm-card">
          <div className="mm-card-head">
            <div>
              <h2 className="mm-card-title">Ritme Belanja Mingguan</h2>
              <p className="mm-card-sub">Distribusi pengeluaran per minggu di periode terpilih</p>
            </div>
            <span className="mm-status-pill neutral tabular">
              Surplus {fmtCompactRp(isCur.surplusBersih)}
            </span>
          </div>
          <CyanCapBarChart data={weeklyBars} />
        </div>

        <div className="mm-card">
          <div className="mm-card-head">
            <h2 className="mm-card-title">Pilar Alokasi</h2>
          </div>
          <NeumorphicDonutChart slices={donutSlices} />
        </div>
      </div>

      {/* ROW 3: TOP ALLOCATION PROGRESS + RECENT CASHFLOW LEDGER matching .fig */}
      <div className="mm-bottom-grid">
        <div className="mm-card">
          <div className="mm-card-head">
            <h2 className="mm-card-title">Realisasi Pos Prioritas</h2>
            <button
              type="button"
              onClick={() => onNavigate('budget')}
              style={{
                border: 'none',
                background: 'none',
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--ink-muted)',
                cursor: 'pointer',
              }}
            >
              Lihat Semua
            </button>
          </div>

          {topAllocLanes.length === 0 ? (
            <div style={{ padding: '24px 4px', color: 'var(--ink-muted)', fontSize: 13.5 }}>
              Belum ada realisasi pos di periode ini. Atur target di menu <strong>Anggaran</strong>.
            </div>
          ) : (
            <div className="mm-prog-list">
              {topAllocLanes.map((lane, idx) => {
                const over = lane.planned > 0 && lane.actual > lane.planned;
                const barColor = over ? '#882D2D' : idx % 2 === 0 ? '#1C90C2' : '#5BD9EF';
                const fillPct = lane.planned > 0 ? Math.min(100, (lane.actual / lane.planned) * 100) : 100;
                return (
                  <div key={lane.name}>
                    <div className="mm-prog-row-top">
                      <span className="mm-prog-name">{lane.name}</span>
                      <span className="mm-prog-pct tabular">{Math.round(lane.usedPct)}%</span>
                    </div>
                    <div className="mm-prog-track">
                      <div
                        className="mm-prog-fill"
                        style={{ width: `${fillPct}%`, background: barColor }}
                      />
                    </div>
                    <div className="mm-prog-meta tabular">
                      <span>Terpakai {fmtRp(lane.actual)}</span>
                      <span>
                        {lane.planned > 0
                          ? over
                            ? `Lewat ${fmtRp(lane.actual - lane.planned)}`
                            : `Target ${fmtRp(lane.planned)}`
                          : 'Tanpa pagu'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mm-card">
          <div className="mm-card-head">
            <h2 className="mm-card-title">Transaksi Terbaru</h2>
            <button
              type="button"
              onClick={() => onNavigate('transactions')}
              style={{
                border: 'none',
                background: 'none',
                fontSize: 12.5,
                fontWeight: 700,
                color: 'var(--ink-muted)',
                cursor: 'pointer',
              }}
            >
              Lihat Semua ({state.transactions.filter((t) => t.tgl >= curRange.mulai && t.tgl <= curRange.selesai).length})
            </button>
          </div>

          {recentTxns.length === 0 ? (
            <div style={{ padding: '26px 8px', color: 'var(--ink-muted)', fontSize: 13.5 }}>
              Belum ada aktivitas tercatat pada periode ini. Klik <strong>+ Catat Transaksi</strong> untuk memulai.
            </div>
          ) : (
            <div className="mm-table-wrap">
              <table className="mm-table">
                <thead>
                  <tr>
                    <th>Transaksi</th>
                    <th>Tanggal</th>
                    <th>Kantong</th>
                    <th className="right">Nominal</th>
                    <th>Status</th>
                    <th className="right">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTxns.map((tx) => {
                    const src = pocketMap.get(tx.kantongId);
                    const dst = tx.kantongTujuanId ? pocketMap.get(tx.kantongTujuanId) : null;
                    const isMasuk = isOperationalIncome(tx) || tx.tipe === 'jual_aset' || tx.tipe === 'terima_piutang';
                    const isTransferOrAsset =
                      tx.tipe === 'transfer' || tx.tipe === 'beli_aset' || tx.tipe === 'jual_aset';

                    const badgeClass = isTransferOrAsset ? 'plan' : isMasuk ? 'ok' : 'err';
                    const badgeText =
                      tx.tipe === 'beli_aset'
                        ? 'Beli Aset'
                        : tx.tipe === 'jual_aset'
                        ? 'Jual Aset'
                        : tx.tipe === 'transfer'
                        ? 'Pindah Kas'
                        : tx.tipe === 'bayar_hutang'
                        ? `Cicilan (${tx.porsi || 'pokok'})`
                        : isMasuk
                        ? 'Uang Masuk'
                        : 'Pengeluaran';

                    return (
                      <tr key={tx.id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{tx.ket || tx.kat || 'Transaksi'}</div>
                          {tx.kat && (
                            <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 1 }}>
                              {tx.kat}
                              {tx.mood ? ` · ${tx.mood}` : ''}
                            </div>
                          )}
                        </td>
                        <td className="tabular" style={{ color: 'var(--ink-muted)', whiteSpace: 'nowrap' }}>
                          {formatShortDate(tx.tgl)}
                        </td>
                        <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                          {dst ? `${src?.nama || '—'} → ${dst.nama}` : src?.nama || '—'}
                        </td>
                        <td className="right tabular" style={{ fontWeight: 800, whiteSpace: 'nowrap' }}>
                          {isMasuk ? '+' : tx.tipe === 'transfer' ? '' : '−'}
                          {fmtRp(tx.nominal)}
                        </td>
                        <td>
                          <span className={`mm-status-pill ${badgeClass}`}>{badgeText}</span>
                        </td>
                        <td className="right">
                          <button
                            type="button"
                            className="mm-icon-btn"
                            title="Hapus transaksi"
                            aria-label="Hapus transaksi"
                            onClick={() => onDeleteTxn(tx.id)}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useMemo, useState } from 'react';
import { Award, CheckCircle2, FileDown } from 'lucide-react';
import type { MoneyMapState } from '../types';
import {
  computeBalanceSheet,
  computeCashFlowStatement,
  computeIncomeStatement,
  fmtCompactRp,
  fmtRp,
  fmtSignedRp,
  fmtUnit,
  formatPeriodLabel,
  getPeriodRange,
  getPrevPeriodKey,
  listAvailablePeriods,
  MONTHS_SHORT_ID,
  parsePeriod,
} from '../lib/financeEngine';

interface ReportsViewProps {
  state: MoneyMapState;
  selectedPeriod: string;
  onSelectPeriod: (p: string) => void;
}

export const ReportsView: React.FC<ReportsViewProps> = ({
  state,
  selectedPeriod,
  onSelectPeriod,
}) => {
  const [incNeraca, setIncNeraca] = useState(true);
  const [incArusKas, setIncArusKas] = useState(true);
  const [incLabaRugi, setIncLabaRugi] = useState(true);
  const [incDebts, setIncDebts] = useState(true);
  const [incTxns, setIncTxns] = useState(false);

  const cutoff = state.setup.cutoffDay;
  const periods = useMemo(() => listAvailablePeriods(state), [state]);
  const curRange = useMemo(() => getPeriodRange(selectedPeriod, cutoff), [selectedPeriod, cutoff]);
  const prevKey = useMemo(() => getPrevPeriodKey(selectedPeriod), [selectedPeriod]);
  const prevRange = useMemo(() => getPeriodRange(prevKey, cutoff), [prevKey, cutoff]);

  const bsCur = useMemo(() => computeBalanceSheet(state, curRange.selesai), [state, curRange.selesai]);
  const bsPrev = useMemo(() => computeBalanceSheet(state, prevRange.selesai), [state, prevRange.selesai]);
  const cfRows = useMemo(() => computeCashFlowStatement(state, curRange), [state, curRange]);
  const isCur = useMemo(() => computeIncomeStatement(state, curRange), [state, curRange]);
  const isPrev = useMemo(() => computeIncomeStatement(state, prevRange), [state, prevRange]);

  const cfTotals = useMemo(() => {
    const awal = cfRows.reduce((s, r) => s + r.awal, 0);
    const masuk = cfRows.reduce((s, r) => s + r.masuk, 0);
    const keluar = cfRows.reduce((s, r) => s + r.keluar, 0);
    const akhir = cfRows.reduce((s, r) => s + r.akhir, 0);
    return { awal, masuk, keluar, akhir, balanced: Math.abs(awal + masuk - keluar - akhir) < 1 };
  }, [cfRows]);

  // 12-Month Annual Matrix for current selected year
  const selectedYear = parsePeriod(selectedPeriod).year;
  const annualMonths = useMemo(() => {
    return MONTHS_SHORT_ID.map((shortName, mIdx) => {
      const pk = `${selectedYear}-${String(mIdx + 1).padStart(2, '0')}`;
      const rng = getPeriodRange(pk, cutoff);
      const stmt = computeIncomeStatement(state, rng);
      return {
        pk,
        shortName,
        masuk: stmt.masuk,
        keluar: stmt.keluarOperasional + stmt.bungaHutang,
        surplus: stmt.surplusBersih,
      };
    });
  }, [selectedYear, cutoff, state]);

  // Accurate Emergency Fund Milestones (strictly > 0 baseline!)
  const monthlyExpenseRef =
    isCur.keluarOperasional > 0
      ? isCur.keluarOperasional
      : state.setup.penghasilanRencana > 0
      ? state.setup.penghasilanRencana * 0.65
      : 0;

  const milestones = [
    {
      label: '1× Biaya Hidup Bulanan',
      reached: monthlyExpenseRef > 0 && bsCur.totalDarurat >= monthlyExpenseRef,
    },
    {
      label: '3× Biaya Hidup Bulanan',
      reached: monthlyExpenseRef > 0 && bsCur.totalDarurat >= monthlyExpenseRef * 3,
    },
    {
      label: '6× Dana Darurat Penuh',
      reached: monthlyExpenseRef > 0 && bsCur.totalDarurat >= monthlyExpenseRef * 6,
    },
    {
      label: 'Portofolio Investasi > Rp25 Juta',
      reached: bsCur.totalInvestasi >= 25_000_000,
    },
  ];

  const renderDeltaBadge = (cur: number, prev: number, goodWhenUp = true) => {
    const diff = cur - prev;
    if (Math.abs(diff) < 1) {
      return <span className="mm-status-pill neutral">Tetap</span>;
    }
    const isUp = diff > 0;
    const isGood = goodWhenUp ? isUp : !isUp;
    const pct = Math.abs(prev) >= 1 ? ` (${isUp ? '+' : '−'}${Math.round((Math.abs(diff) / Math.abs(prev)) * 100)}%)` : '';
    return (
      <span className={`mm-status-pill tabular ${isGood ? 'ok' : 'err'}`}>
        {fmtSignedRp(diff)}
        {pct}
      </span>
    );
  };

  return (
    <div>
      <div className="mm-header-row">
        <div>
          <div className="mm-eyebrow-meta">
            <span>Neraca, Arus Kas, &amp; Laba-Rugi dengan Pembanding Otomatis</span>
            <span>•</span>
            <select
              aria-label="Pilih periode laporan"
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
          <h1 className="mm-page-h1">Laporan Keuangan</h1>
        </div>

        <div className="mm-cta-group">
          <button
            type="button"
            className="mm-pill-btn primary"
            onClick={async () => {
              const { exportFinancialReportPDF } = await import('../lib/pdfExport');
              exportFinancialReportPDF(state, {
                periodKey: selectedPeriod,
                includeNeraca: incNeraca,
                includeArusKas: incArusKas,
                includeLabaRugi: incLabaRugi,
                includeDebts: incDebts,
                includeTransactions: incTxns,
              });
            }}
          >
            <FileDown size={18} />
            <span>Unduh PDF A4</span>
          </button>
        </div>
      </div>

      {/* PDF SECTION SELECTOR BAR */}
      <div className="mm-card" style={{ marginBottom: 20, padding: '14px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Komponen Cetak PDF &amp; Tampilan:</span>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13, fontWeight: 600 }}>
            {[
              ['Kekayaan Bersih (Neraca)', incNeraca, setIncNeraca],
              ['Arus Kas Kantong', incArusKas, setIncArusKas],
              ['Surplus / Defisit', incLabaRugi, setIncLabaRugi],
              ['Hutang & Piutang', incDebts, setIncDebts],
              ['Lampiran Jurnal Detail', incTxns, setIncTxns],
            ].map(([lbl, checked, setter]) => (
              <label
                key={lbl as string}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={checked as boolean}
                  onChange={(e) => (setter as (v: boolean) => void)(e.target.checked)}
                />
                <span>{lbl as string}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      {/* STATEMENT 1: NERACA & PERBANDINGAN PERIODE */}
      {incNeraca && (
        <div className="mm-card" style={{ marginBottom: 20 }}>
          <div className="mm-card-head">
            <div>
              <h2 className="mm-card-title">1. Laporan Posisi Kekayaan Bersih (Neraca)</h2>
              <p className="mm-card-sub">
                Posisi akhir periode {formatPeriodLabel(selectedPeriod, cutoff, false)} dibanding{' '}
                {formatPeriodLabel(prevKey, cutoff, false)}
              </p>
            </div>
            <span className="mm-status-pill ok tabular">
              Net Worth: {fmtRp(bsCur.kekayaanBersih)}
            </span>
          </div>

          <div className="mm-table-wrap">
            <table className="mm-table">
              <thead>
                <tr>
                  <th>Komponen Neraca</th>
                  <th className="right">{formatPeriodLabel(prevKey, cutoff, false)}</th>
                  <th className="right">{formatPeriodLabel(selectedPeriod, cutoff, false)}</th>
                  <th className="right">Perubahan</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Kas &amp; Setara Kas ({bsCur.kasItems.length} kantong)</td>
                  <td className="right tabular">{fmtRp(bsPrev.totalKas)}</td>
                  <td className="right tabular">{fmtRp(bsCur.totalKas)}</td>
                  <td className="right">{renderDeltaBadge(bsCur.totalKas, bsPrev.totalKas, true)}</td>
                </tr>
                <tr>
                  <td>
                    Portofolio Investasi
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                      {bsCur.investasiItems.map((iv) => `${iv.pocket.nama} (${fmtUnit(iv.unit, iv.pocket)})`).join(' · ') || '—'}
                    </div>
                  </td>
                  <td className="right tabular">{fmtRp(bsPrev.totalInvestasi)}</td>
                  <td className="right tabular">{fmtRp(bsCur.totalInvestasi)}</td>
                  <td className="right">
                    {renderDeltaBadge(bsCur.totalInvestasi, bsPrev.totalInvestasi, true)}
                  </td>
                </tr>
                <tr>
                  <td>Piutang Aktif</td>
                  <td className="right tabular">{fmtRp(bsPrev.totalPiutang)}</td>
                  <td className="right tabular">{fmtRp(bsCur.totalPiutang)}</td>
                  <td className="right">
                    {renderDeltaBadge(bsCur.totalPiutang, bsPrev.totalPiutang, true)}
                  </td>
                </tr>
                <tr style={{ fontWeight: 800 }}>
                  <td>TOTAL ASET</td>
                  <td className="right tabular">{fmtRp(bsPrev.totalAset)}</td>
                  <td className="right tabular">{fmtRp(bsCur.totalAset)}</td>
                  <td className="right">{renderDeltaBadge(bsCur.totalAset, bsPrev.totalAset, true)}</td>
                </tr>
                <tr>
                  <td>Total Kewajiban / Hutang Pokok</td>
                  <td className="right tabular">{fmtRp(bsPrev.totalHutang)}</td>
                  <td className="right tabular">{fmtRp(bsCur.totalHutang)}</td>
                  <td className="right">
                    {renderDeltaBadge(bsCur.totalHutang, bsPrev.totalHutang, false)}
                  </td>
                </tr>
                <tr style={{ fontWeight: 800 }}>
                  <td style={{ color: 'var(--navy)', fontSize: 15 }}>KEKAYAAN BERSIH</td>
                  <td className="right tabular">{fmtRp(bsPrev.kekayaanBersih)}</td>
                  <td className="right tabular" style={{ color: 'var(--navy)', fontSize: 15 }}>
                    {fmtRp(bsCur.kekayaanBersih)}
                  </td>
                  <td className="right">
                    {renderDeltaBadge(bsCur.kekayaanBersih, bsPrev.kekayaanBersih, true)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STATEMENT 2 & 3 SIDE BY SIDE */}
      <div className="mm-two-col">
        {incArusKas && (
          <div className="mm-card">
            <div className="mm-card-head">
              <div>
                <h2 className="mm-card-title">2. Arus Kas per Kantong Likuid</h2>
                <p className="mm-card-sub">Mutasi masuk/keluar termasuk pindah dana &amp; beli aset</p>
              </div>
              {cfTotals.balanced && (
                <span className="mm-status-pill ok">
                  <CheckCircle2 size={13} /> Seimbang
                </span>
              )}
            </div>

            <div className="mm-table-wrap">
              <table className="mm-table">
                <thead>
                  <tr>
                    <th>Kantong</th>
                    <th className="right">Awal</th>
                    <th className="right">Masuk</th>
                    <th className="right">Keluar</th>
                    <th className="right">Akhir</th>
                  </tr>
                </thead>
                <tbody>
                  {cfRows.map((r) => (
                    <tr key={r.pocket.id}>
                      <td>{r.pocket.nama}</td>
                      <td className="right tabular">{fmtCompactRp(r.awal)}</td>
                      <td className="right tabular" style={{ color: 'var(--ok-ink)' }}>
                        {r.masuk > 0 ? `+${fmtCompactRp(r.masuk)}` : '—'}
                      </td>
                      <td className="right tabular" style={{ color: 'var(--err-ink)' }}>
                        {r.keluar > 0 ? `−${fmtCompactRp(r.keluar)}` : '—'}
                      </td>
                      <td className="right tabular" style={{ fontWeight: 800 }}>
                        {fmtRp(r.akhir)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ fontWeight: 800 }}>
                    <td>TOTAL KAS</td>
                    <td className="right tabular">{fmtCompactRp(cfTotals.awal)}</td>
                    <td className="right tabular">+{fmtCompactRp(cfTotals.masuk)}</td>
                    <td className="right tabular">−{fmtCompactRp(cfTotals.keluar)}</td>
                    <td className="right tabular">{fmtRp(cfTotals.akhir)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {incLabaRugi && (
          <div className="mm-card">
            <div className="mm-card-head">
              <div>
                <h2 className="mm-card-title">3. Surplus / Defisit Operasional</h2>
                <p className="mm-card-sub">
                  Pindah dana, beli aset, dan pokok cicilan tidak dihitung sebagai beban hangus
                </p>
              </div>
              <span className={`mm-status-pill tabular ${isCur.surplusBersih >= 0 ? 'ok' : 'err'}`}>
                Rasio Simpan {Math.max(0, isCur.savingsRatePct).toFixed(1)}%
              </span>
            </div>

            <div className="mm-table-wrap">
              <table className="mm-table">
                <thead>
                  <tr>
                    <th>Pos Laba-Rugi</th>
                    <th className="right">Periode Lalu</th>
                    <th className="right">Periode Ini</th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ fontWeight: 800 }}>
                    <td>Total Pemasukan Operasional</td>
                    <td className="right tabular">{fmtRp(isPrev.masuk)}</td>
                    <td className="right tabular" style={{ color: 'var(--ok-ink)' }}>
                      {fmtRp(isCur.masuk)}
                    </td>
                  </tr>
                  {Object.entries(isCur.perKategori)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, val]) => (
                      <tr key={cat}>
                        <td style={{ paddingLeft: 20, color: 'var(--ink-secondary)', fontSize: 12.5 }}>
                          • {cat}
                        </td>
                        <td className="right tabular" style={{ color: 'var(--ink-muted)', fontSize: 12.5 }}>
                          {fmtRp(isPrev.perKategori[cat] || 0)}
                        </td>
                        <td className="right tabular" style={{ fontSize: 12.5 }}>
                          {fmtRp(val)}
                        </td>
                      </tr>
                    ))}
                  <tr>
                    <td>Total Belanja Operasional</td>
                    <td className="right tabular">{fmtRp(isPrev.keluarOperasional)}</td>
                    <td className="right tabular">{fmtRp(isCur.keluarOperasional)}</td>
                  </tr>
                  {(isCur.bungaHutang > 0 || isPrev.bungaHutang > 0) && (
                    <tr>
                      <td>Beban Bunga &amp; Admin Cicilan</td>
                      <td className="right tabular">{fmtRp(isPrev.bungaHutang)}</td>
                      <td className="right tabular">{fmtRp(isCur.bungaHutang)}</td>
                    </tr>
                  )}
                  <tr style={{ fontWeight: 800 }}>
                    <td>{isCur.surplusBersih >= 0 ? 'SURPLUS PERIODE INI' : 'DEFISIT PERIODE INI'}</td>
                    <td className="right tabular">{fmtSignedRp(isPrev.surplusBersih)}</td>
                    <td
                      className="right tabular"
                      style={{ color: isCur.surplusBersih >= 0 ? 'var(--ok-ink)' : 'var(--err-ink)' }}
                    >
                      {fmtSignedRp(isCur.surplusBersih)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 12-MONTH ANNUAL MATRIX + MILESTONES */}
      <div className="mm-two-col">
        <div className="mm-card">
          <div className="mm-card-head">
            <div>
              <h2 className="mm-card-title">Rekapitulasi Tahunan {selectedYear}</h2>
              <p className="mm-card-sub">Klik kartu bulan untuk berpindah ke laporan bulan tersebut</p>
            </div>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(118px, 1fr))',
              gap: 10,
            }}
          >
            {annualMonths.map((m) => {
              const hasData = m.masuk > 0 || m.keluar > 0;
              const isSelected = m.pk === selectedPeriod;
              return (
                <button
                  key={m.pk}
                  type="button"
                  onClick={() => onSelectPeriod(m.pk)}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 14,
                    border: isSelected ? '1.5px solid var(--ocean)' : '1px solid rgba(255,255,255,0.7)',
                    background: 'var(--bg-surface)',
                    boxShadow: 'var(--shadow-badge)',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 800, color: isSelected ? 'var(--ocean)' : 'var(--ink-muted)' }}>
                    {m.shortName} {selectedYear}
                  </div>
                  <div className="tabular" style={{ fontSize: 13.5, fontWeight: 800, marginTop: 4 }}>
                    {hasData ? fmtCompactRp(m.keluar) : 'Rp0'}
                  </div>
                  <div
                    className="tabular"
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      marginTop: 2,
                      color: !hasData ? 'var(--ink-muted)' : m.surplus >= 0 ? 'var(--ok-ink)' : 'var(--err-ink)',
                    }}
                  >
                    {hasData ? fmtSignedRp(m.surplus) : 'Belum tercatat'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mm-card">
          <div className="mm-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="mm-kpi-icon" style={{ width: 38, height: 38 }}>
                <Award size={18} />
              </div>
              <div>
                <h2 className="mm-card-title">Tonggak Ketahanan Finansial</h2>
                <p className="mm-card-sub">
                  Dihitung akurat dari akumulasi Dana Darurat ({fmtRp(bsCur.totalDarurat)})
                </p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {milestones.map((ms) => (
              <div
                key={ms.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '11px 14px',
                  borderRadius: 14,
                  background: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-badge)',
                  opacity: ms.reached ? 1 : 0.65,
                }}
              >
                <span style={{ fontWeight: 700, fontSize: 13.5 }}>{ms.label}</span>
                <span className={`mm-status-pill ${ms.reached ? 'ok' : 'neutral'}`}>
                  {ms.reached ? 'Tercapai' : 'Dalam Proses'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

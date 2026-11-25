import React, { useMemo } from 'react';
import { CalendarClock, Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { AllocationRow, MoneyMapState, ReflectionNote } from '../types';
import {
  computeAllocations,
  computeCategoryVariances,
  computeIncomeStatement,
  fmtRp,
  formatInputThousands,
  formatPeriodLabel,
  getNextPeriodKey,
  getPeriodRange,
  parseNumericInput,
} from '../lib/financeEngine';

interface BudgetViewProps {
  state: MoneyMapState;
  onUpdateSetup: (patch: Partial<MoneyMapState['setup']>) => void;
  onUpdateAllocRows: (target: 'allocIncome' | 'allocPersonal', rows: AllocationRow[], renamedFromTo?: [string, string]) => void;
  onAdvanceNextMonth: () => void;
  onSaveReflection: (periodKey: string, note: ReflectionNote) => void;
}

export const BudgetView: React.FC<BudgetViewProps> = ({
  state,
  onUpdateSetup,
  onUpdateAllocRows,
  onAdvanceNextMonth,
  onSaveReflection,
}) => {
  const { setup } = state;
  const activeRange = useMemo(
    () => getPeriodRange(setup.activePeriod, setup.cutoffDay),
    [setup.activePeriod, setup.cutoffDay]
  );
  const stmt = useMemo(() => computeIncomeStatement(state, activeRange), [state, activeRange]);

  const effectiveIncomeBase =
    setup.penghasilanRencana > 0 ? setup.penghasilanRencana : stmt.masuk;

  const computedIncome = useMemo(
    () => computeAllocations(setup.allocIncome, effectiveIncomeBase),
    [setup.allocIncome, effectiveIncomeBase]
  );

  const computedPersonal = useMemo(
    () => computeAllocations(setup.allocPersonal, setup.budgetPribadi),
    [setup.allocPersonal, setup.budgetPribadi]
  );

  const selfBridgeNominal = useMemo(() => {
    const found = computedIncome.find(
      (c) => c.row.locked || c.row.name.toLowerCase().includes('kebutuhan diri')
    );
    return found ? found.nominal : 0;
  }, [computedIncome]);

  const variances = useMemo(
    () => computeCategoryVariances(state, setup.activePeriod),
    [state, setup.activePeriod]
  );

  const currentReflection: ReflectionNote = state.reflections[setup.activePeriod] || {
    win: '',
    worth: '',
    evaluasi: '',
    sandwichBoundary: '',
    targetDepan: '',
  };

  const renderAllocEditor = (
    title: string,
    subtitle: string,
    target: 'allocIncome' | 'allocPersonal',
    rows: AllocationRow[],
    computed: ReturnType<typeof computeAllocations>,
    base: number
  ) => {
    const totalAllocated = computed.reduce((s, c) => s + c.nominal, 0);
    const diff = base - totalAllocated;

    return (
      <div className="mm-card">
        <div className="mm-card-head">
          <div>
            <h2 className="mm-card-title">{title}</h2>
            <p className="mm-card-sub">{subtitle}</p>
          </div>
          <button
            type="button"
            className="mm-pill-btn compact"
            onClick={() => {
              let idx = rows.length + 1;
              let candidate = `Pos Baru ${idx}`;
              const existing = new Set(rows.map((r) => r.name.toLowerCase()));
              while (existing.has(candidate.toLowerCase())) {
                idx += 1;
                candidate = `Pos Baru ${idx}`;
              }
              onUpdateAllocRows(target, [
                ...rows,
                { id: `al_${Date.now()}`, name: candidate, pct: 0, amt: 0, mode: 'pct' },
              ]);
            }}
          >
            <Plus size={14} />
            <span>Tambah Pos</span>
          </button>
        </div>

        <div className="mm-table-wrap">
          <table className="mm-table">
            <thead>
              <tr>
                <th>Nama Pos Anggaran</th>
                <th>Mode Kunci</th>
                <th className="right">Porsi (%)</th>
                <th className="right">Pagu (Rp)</th>
                <th className="right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {computed.map(({ row, nominal, effectivePct }, idx) => (
                <tr key={row.id}>
                  <td>
                    {row.locked ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 700 }}>
                        <Lock size={13} color="#1C90C2" />
                        <span>{row.name}</span>
                      </div>
                    ) : (
                      <input
                        type="text"
                        className="mm-input"
                        style={{ height: 36, width: '100%', minWidth: 215 }}
                        defaultValue={row.name}
                        onBlur={(e) => {
                          const nextName = e.target.value.trim();
                          if (!nextName || nextName === row.name) {
                            e.target.value = row.name;
                            return;
                          }
                          const next = rows.map((r, i) => (i === idx ? { ...r, name: nextName } : r));
                          onUpdateAllocRows(target, next, [row.name, nextName]);
                        }}
                      />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      className={`mm-status-pill ${row.mode === 'amt' ? 'plan' : 'neutral'}`}
                      style={{ border: 'none', cursor: 'pointer' }}
                      onClick={() => {
                        const nextMode = row.mode === 'pct' ? ('amt' as const) : ('pct' as const);
                        const next = rows.map((r, i) =>
                          i === idx
                            ? {
                                ...r,
                                mode: nextMode,
                                amt: nextMode === 'amt' ? nominal : r.amt,
                                pct: nextMode === 'pct' && base > 0 ? nominal / base : r.pct,
                              }
                            : r
                        );
                        onUpdateAllocRows(target, next);
                      }}
                    >
                      {row.mode === 'amt' ? 'Nominal Tetap' : 'Persentase %'}
                    </button>
                  </td>
                  <td className="right tabular">
                    {row.mode === 'pct' ? (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          step={1}
                          className="mm-input tabular"
                          style={{ height: 36, width: 72, textAlign: 'right' }}
                          value={Math.round(row.pct * 100)}
                          onChange={(e) => {
                            const p = Math.max(0, Math.min(100, Number(e.target.value) || 0)) / 100;
                            const next = rows.map((r, i) =>
                              i === idx ? { ...r, pct: p, mode: 'pct' as const } : r
                            );
                            onUpdateAllocRows(target, next);
                          }}
                        />
                        <span>%</span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--ink-muted)' }}>
                        {(effectivePct * 100).toFixed(1)}%
                      </span>
                    )}
                  </td>
                  <td className="right tabular">
                    {row.mode === 'amt' ? (
                      <input
                        type="text"
                        inputMode="numeric"
                        className="mm-input tabular"
                        style={{ height: 36, width: 132, textAlign: 'right' }}
                        value={formatInputThousands(String(Math.round(row.amt)))}
                        onChange={(e) => {
                          const val = Math.max(0, parseNumericInput(e.target.value, false));
                          const next = rows.map((r, i) =>
                            i === idx ? { ...r, amt: val, mode: 'amt' as const } : r
                          );
                          onUpdateAllocRows(target, next);
                        }}
                      />
                    ) : (
                      <span style={{ fontWeight: 800 }}>{fmtRp(nominal)}</span>
                    )}
                  </td>
                  <td className="right">
                    {row.locked ? (
                      <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>Permanen</span>
                    ) : (
                      <button
                        type="button"
                        className="mm-icon-btn"
                        aria-label="Hapus kategori"
                        disabled={rows.length <= 1}
                        onClick={() => {
                          if (rows.length <= 1) return;
                          onUpdateAllocRows(
                            target,
                            rows.filter((_, i) => i !== idx)
                          );
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div
          className="tabular"
          style={{
            marginTop: 14,
            paddingTop: 12,
            borderTop: '1px solid var(--line-subtle)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 8,
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          <span>
            Total Teralokasi: <strong>{fmtRp(totalAllocated)}</strong> dari {fmtRp(base)}
          </span>
          <span
            className={`mm-status-pill ${
              Math.abs(diff) < 100 ? 'ok' : diff > 0 ? 'plan' : 'err'
            }`}
          >
            {Math.abs(diff) < 100
              ? '100% Pas Teralokasi'
              : diff > 0
              ? `Sisa belum dialokasi ${fmtRp(diff)}`
              : `Melebihi dasar ${fmtRp(Math.abs(diff))}`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mm-header-row">
        <div>
          <div className="mm-eyebrow-meta">
            <span>Periode Aktif: {formatPeriodLabel(setup.activePeriod, setup.cutoffDay, true)}</span>
          </div>
          <h1 className="mm-page-h1">Rencana &amp; Alokasi Anggaran</h1>
        </div>

        <div className="mm-cta-group">
          <button
            type="button"
            className="mm-pill-btn primary"
            onClick={() => {
              const nextLabel = formatPeriodLabel(getNextPeriodKey(setup.activePeriod), setup.cutoffDay, false);
              if (
                window.confirm(
                  `Tutup buku periode ${formatPeriodLabel(
                    setup.activePeriod,
                    setup.cutoffDay,
                    false
                  )} dan lanjut ke ${nextLabel}? Snapshot target periode saat ini akan dibekukan agar laporan historis tetap akurat.`
                )
              ) {
                onAdvanceNextMonth();
              }
            }}
          >
            <CalendarClock size={18} />
            <span>Mulai Periode Berikutnya</span>
          </button>
        </div>
      </div>

      {/* PARAMETER PERIODE & PENGHASILAN */}
      <div className="mm-card" style={{ marginBottom: 20 }}>
        <div className="mm-card-head">
          <div>
            <h2 className="mm-card-title">Parameter Periode &amp; Dasar Penghasilan</h2>
            <p className="mm-card-sub">
              Sesuaikan tanggal gajian (cut-off) dan rencana penghasilan sebagai dasar pembagian pos
            </p>
          </div>
          <span className="mm-status-pill ok tabular">
            Pemasukan Riil Tercatat: {fmtRp(stmt.masuk)}
          </span>
        </div>

        <div className="mm-field-grid">
          <div className="mm-field">
            <label className="mm-label">Nama Panggilan Workspace</label>
            <input
              type="text"
              className="mm-input"
              value={setup.nama}
              onChange={(e) => onUpdateSetup({ nama: e.target.value })}
            />
          </div>

          <div className="mm-field">
            <label className="mm-label">Periode Aktif (YYYY-MM)</label>
            <input
              type="month"
              className="mm-input tabular"
              value={setup.activePeriod}
              onChange={(e) => {
                if (/^\d{4}-\d{2}$/.test(e.target.value)) {
                  onUpdateSetup({ activePeriod: e.target.value });
                }
              }}
            />
          </div>

          <div className="mm-field">
            <label className="mm-label">Tanggal Mulai Periode (Cut-off Gajian)</label>
            <select
              className="mm-select tabular"
              value={setup.cutoffDay}
              onChange={(e) => onUpdateSetup({ cutoffDay: Number(e.target.value) || 1 })}
            >
              <option value={1}>Tanggal 1 (Bulan Kalender)</option>
              {Array.from({ length: 27 }, (_, i) => i + 2).map((day) => (
                <option key={day} value={day}>
                  Tanggal {day} setiap bulan
                </option>
              ))}
            </select>
          </div>

          <div className="mm-field">
            <label className="mm-label">Target Penghasilan Periode (Rp)</label>
            <input
              type="text"
              inputMode="numeric"
              className="mm-input tabular"
              placeholder="18.500.000"
              value={formatInputThousands(String(setup.penghasilanRencana || ''))}
              onChange={(e) =>
                onUpdateSetup({ penghasilanRencana: parseNumericInput(e.target.value, false) })
              }
            />
          </div>

          <div className="mm-field">
            <label className="mm-label">
              Pagu Kebutuhan Pribadi (Rekomendasi: {fmtRp(selfBridgeNominal)})
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text"
                inputMode="numeric"
                className="mm-input tabular"
                style={{ flex: 1 }}
                placeholder="5.550.000"
                value={formatInputThousands(String(setup.budgetPribadi || ''))}
                onChange={(e) =>
                  onUpdateSetup({ budgetPribadi: parseNumericInput(e.target.value, false) })
                }
              />
              {selfBridgeNominal > 0 && setup.budgetPribadi !== selfBridgeNominal && (
                <button
                  type="button"
                  className="mm-pill-btn compact"
                  onClick={() => onUpdateSetup({ budgetPribadi: selfBridgeNominal })}
                >
                  Samakan
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* DUAL HYBRID ALLOCATION EDITORS */}
      <div className="mm-two-col">
        {renderAllocEditor(
          '1. Alokasi Penghasilan Utama & Keluarga',
          `Dasar pembagian: ${fmtRp(effectiveIncomeBase)} (nominal tetap dipotong lebih dulu)`,
          'allocIncome',
          setup.allocIncome,
          computedIncome,
          effectiveIncomeBase
        )}
        {renderAllocEditor(
          '2. Rincian Pagu Kebutuhan Pribadi',
          `Menjabarkan porsi Kebutuhan Diri Sendiri (${fmtRp(setup.budgetPribadi)})`,
          'allocPersonal',
          setup.allocPersonal,
          computedPersonal,
          setup.budgetPribadi
        )}
      </div>

      {/* VARIANCE TABLE + MONTHLY REFLECTION */}
      <div className="mm-two-col">
        <div className="mm-card">
          <div className="mm-card-head">
            <div>
              <h2 className="mm-card-title">Rencana vs Realisasi Aktual</h2>
              <p className="mm-card-sub">Evaluasi sisa pagu setiap kategori pada periode berjalan</p>
            </div>
          </div>

          <div className="mm-table-wrap">
            <table className="mm-table">
              <thead>
                <tr>
                  <th>Pos Anggaran</th>
                  <th className="right">Rencana</th>
                  <th className="right">Aktual</th>
                  <th className="right">Sisa / Selisih</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variances.map((v) => {
                  const over = v.remaining < 0;
                  return (
                    <tr key={v.name}>
                      <td>{v.name}</td>
                      <td className="right tabular">{fmtRp(v.planned)}</td>
                      <td className="right tabular" style={{ fontWeight: 800 }}>
                        {fmtRp(v.actual)}
                      </td>
                      <td
                        className="right tabular"
                        style={{ color: over ? 'var(--err-ink)' : 'var(--ok-ink)', fontWeight: 700 }}
                      >
                        {over ? `−${fmtRp(Math.abs(v.remaining))}` : fmtRp(v.remaining)}
                      </td>
                      <td>
                        <span
                          className={`mm-status-pill ${
                            over ? 'err' : v.usedPct >= 80 ? 'plan' : 'ok'
                          }`}
                        >
                          {over ? 'Evaluasi' : v.usedPct >= 80 ? 'Pantau' : 'Aman'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mm-card">
          <div className="mm-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="mm-kpi-icon" style={{ width: 38, height: 38 }}>
                <Sparkles size={18} />
              </div>
              <div>
                <h2 className="mm-card-title">Catatan Refleksi Periode</h2>
                <p className="mm-card-sub">Tersimpan otomatis per periode ({setup.activePeriod})</p>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(
              [
                ['win', 'Kemenangan finansial bulan ini'],
                ['worth', 'Pengeluaran yang paling terasa bermakna'],
                ['sandwichBoundary', 'Catatan komunikasi & batas sehat keluarga (sandwich)'],
                ['evaluasi', 'Area yang ingin dirapikan bulan depan'],
              ] as const
            ).map(([key, label]) => (
              <div className="mm-field" key={key}>
                <label className="mm-label">{label}</label>
                <textarea
                  className="mm-textarea"
                  style={{ minHeight: 62 }}
                  value={currentReflection[key]}
                  onChange={(e) =>
                    onSaveReflection(setup.activePeriod, {
                      ...currentReflection,
                      [key]: e.target.value,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

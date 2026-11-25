import React, { useMemo, useState } from 'react';
import { Filter, HeartHandshake, Plus, RotateCcw, Search, Trash2 } from 'lucide-react';
import type { MoneyMapState, SpendNature } from '../types';
import {
  fmtRp,
  fmtUnit,
  formatPeriodLabel,
  formatShortDate,
  getPeriodRange,
  isOperationalExpense,
  isOperationalIncome,
  listAvailablePeriods,
} from '../lib/financeEngine';

interface TransactionsViewProps {
  state: MoneyMapState;
  selectedPeriod: string;
  onSelectPeriod: (p: string) => void;
  onOpenNewTxn: () => void;
  onDeleteTxn: (id: string) => void;
  onUpdateTxnReason: (id: string, kenapa: string) => void;
  onResetPeriodTxns: (scope: 'period' | 'all') => void;
}

const NATURE_ORDER: SpendNature[] = [
  'Kebutuhan',
  'Keluarga / Ortu',
  'Self-Reward Sehat',
  'Keinginan',
  'Impulsif',
];

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  state,
  selectedPeriod,
  onSelectPeriod,
  onOpenNewTxn,
  onDeleteTxn,
  onUpdateTxnReason,
  onResetPeriodTxns,
}) => {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'out' | 'in' | 'asset'>('all');
  const [pocketFilter, setPocketFilter] = useState<string>('all');

  const cutoff = state.setup.cutoffDay;
  const range = useMemo(() => getPeriodRange(selectedPeriod, cutoff), [selectedPeriod, cutoff]);
  const periods = useMemo(() => listAvailablePeriods(state), [state]);
  const pocketMap = useMemo(() => new Map(state.pockets.map((p) => [p.id, p])), [state.pockets]);

  const periodTxns = useMemo(
    () =>
      state.transactions
        .filter((t) => t.tgl >= range.mulai && t.tgl <= range.selesai)
        .sort((a, b) => b.tgl.localeCompare(a.tgl)),
    [state.transactions, range]
  );

  const filteredTxns = useMemo(() => {
    const q = query.trim().toLowerCase();
    return periodTxns.filter((t) => {
      if (typeFilter === 'out' && !isOperationalExpense(t) && t.tipe !== 'bayar_hutang') return false;
      if (typeFilter === 'in' && !isOperationalIncome(t) && t.tipe !== 'jual_aset') return false;
      if (
        typeFilter === 'asset' &&
        t.tipe !== 'transfer' &&
        t.tipe !== 'beli_aset' &&
        t.tipe !== 'jual_aset'
      ) {
        return false;
      }
      if (pocketFilter !== 'all' && t.kantongId !== pocketFilter && t.kantongTujuanId !== pocketFilter) {
        return false;
      }
      if (!q) return true;
      return (
        (t.ket || '').toLowerCase().includes(q) ||
        (t.kat || '').toLowerCase().includes(q) ||
        (t.mood || '').toLowerCase().includes(q)
      );
    });
  }, [periodTxns, query, typeFilter, pocketFilter]);

  // Mindful / Emotional Spending breakdown
  const mindfulStats = useMemo(() => {
    const expenses = periodTxns.filter(isOperationalExpense);
    const totalOut = expenses.reduce((s, t) => s + t.nominal, 0);
    const byNature: Record<string, number> = {};
    const byMood: Record<string, number> = {};

    expenses.forEach((t) => {
      const nat = t.jenis || 'Kebutuhan';
      byNature[nat] = (byNature[nat] || 0) + t.nominal;
      if (t.mood) {
        byMood[t.mood] = (byMood[t.mood] || 0) + t.nominal;
      }
    });

    return {
      totalOut,
      natureRows: NATURE_ORDER.map((n) => ({
        name: n,
        amount: byNature[n] || 0,
        pct: totalOut > 0 ? ((byNature[n] || 0) / totalOut) * 100 : 0,
      })).filter((r) => r.amount > 0),
      moodRows: Object.entries(byMood)
        .map(([mood, amount]) => ({
          mood,
          amount,
          pct: totalOut > 0 ? (amount / totalOut) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }, [periodTxns]);

  return (
    <div>
      <div className="mm-header-row">
        <div>
          <div className="mm-eyebrow-meta">
            <span>Jurnal Arus Kas &amp; Mindful Spending</span>
            <span>•</span>
            <select
              aria-label="Pilih periode transaksi"
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
          <h1 className="mm-page-h1">Jurnal Transaksi</h1>
        </div>

        <div className="mm-cta-group">
          <button type="button" className="mm-pill-btn primary" onClick={onOpenNewTxn}>
            <Plus size={18} strokeWidth={2.4} />
            <span>Tambah Transaksi</span>
          </button>
          {periodTxns.length > 0 && (
            <button
              type="button"
              className="mm-pill-btn"
              onClick={() => {
                if (
                  window.confirm(
                    `Hapus ${periodTxns.length} transaksi di periode ${formatPeriodLabel(
                      selectedPeriod,
                      cutoff,
                      false
                    )}? Efek cicilan pokok dan modal aset akan dipulihkan otomatis.`
                  )
                ) {
                  onResetPeriodTxns('period');
                }
              }}
            >
              <RotateCcw size={16} />
              <span>Reset Periode</span>
            </button>
          )}
        </div>
      </div>

      {/* MINDFUL SPENDING & MOOD INSIGHTS */}
      <div className="mm-two-col">
        <div className="mm-card">
          <div className="mm-card-head">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div className="mm-kpi-icon" style={{ width: 38, height: 38 }}>
                <HeartHandshake size={18} />
              </div>
              <div>
                <h2 className="mm-card-title"> Kualitas Pengeluaran (Mindful Check)</h2>
                <p className="mm-card-sub">Proporsi kebutuhan inti, dukungan keluarga, dan keinginan</p>
              </div>
            </div>
          </div>

          {mindfulStats.natureRows.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
              Belum ada pengeluaran tercatat di periode ini.
            </p>
          ) : (
            <div className="mm-prog-list">
              {mindfulStats.natureRows.map((row) => {
                const color =
                  row.name === 'Impulsif'
                    ? '#882D2D'
                    : row.name === 'Keinginan'
                    ? '#7A2D88'
                    : row.name === 'Keluarga / Ortu'
                    ? '#1A4673'
                    : '#1C90C2';
                return (
                  <div key={row.name}>
                    <div className="mm-prog-row-top">
                      <span className="mm-prog-name">{row.name}</span>
                      <span className="mm-prog-pct tabular">
                        {fmtRp(row.amount)} ({Math.round(row.pct)}%)
                      </span>
                    </div>
                    <div className="mm-prog-track">
                      <div
                        className="mm-prog-fill"
                        style={{ width: `${Math.min(100, row.pct)}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="mm-card">
          <div className="mm-card-head">
            <div>
              <h2 className="mm-card-title">Pemicu Suasana Hati (Mood Tracker)</h2>
              <p className="mm-card-sub">Mengenali pola belanja saat lelah, stres, atau terencana</p>
            </div>
          </div>

          {mindfulStats.moodRows.length === 0 ? (
            <p style={{ color: 'var(--ink-muted)', fontSize: 13 }}>
              Tambahkan label mood saat mencatat pengeluaran untuk melihat pola emosional.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {mindfulStats.moodRows.map((m) => (
                <div
                  key={m.mood}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                    borderRadius: 14,
                    background: 'var(--bg-surface)',
                    boxShadow: 'var(--shadow-badge)',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.mood}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                      {m.pct.toFixed(1)}% dari total pengeluaran periode ini
                    </div>
                  </div>
                  <div className="tabular" style={{ fontWeight: 800, fontSize: 14.5 }}>
                    {fmtRp(m.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* FILTER BAR + FULL TRANSACTION LEDGER */}
      <div className="mm-card">
        <div className="mm-card-head" style={{ marginBottom: 18 }}>
          <div className="mm-segmented">
            {(
              [
                ['all', `Semua (${periodTxns.length})`],
                ['out', 'Pengeluaran'],
                ['in', 'Pemasukan'],
                ['asset', 'Transfer & Aset'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`mm-seg-btn ${typeFilter === id ? 'active' : ''}`}
                onClick={() => setTypeFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search
                size={15}
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--ink-muted)',
                }}
              />
              <input
                type="text"
                className="mm-input"
                style={{ paddingLeft: 34, height: 38, width: 220 }}
                placeholder="Cari kategori / catatan..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <Filter size={14} color="#717171" />
              <select
                aria-label="Filter kantong"
                className="mm-select"
                style={{ height: 38 }}
                value={pocketFilter}
                onChange={(e) => setPocketFilter(e.target.value)}
              >
                <option value="all">Semua Kantong</option>
                {state.pockets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {filteredTxns.length === 0 ? (
          <div style={{ padding: '28px 8px', textAlign: 'center', color: 'var(--ink-muted)' }}>
            Tidak ada transaksi yang cocok dengan filter saat ini.
          </div>
        ) : (
          <div className="mm-table-wrap">
            <table className="mm-table">
              <thead>
                <tr>
                  <th>Tanggal</th>
                  <th>Tipe</th>
                  <th>Kategori &amp; Rincian</th>
                  <th>Kantong</th>
                  <th>Catatan Refleksi</th>
                  <th className="right">Nominal</th>
                  <th className="right">Hapus</th>
                </tr>
              </thead>
              <tbody>
                {filteredTxns.map((tx) => {
                  const src = pocketMap.get(tx.kantongId);
                  const dst = tx.kantongTujuanId ? pocketMap.get(tx.kantongTujuanId) : null;
                  const isIn = isOperationalIncome(tx) || tx.tipe === 'jual_aset' || tx.tipe === 'terima_piutang';
                  const isMove = tx.tipe === 'transfer' || tx.tipe === 'beli_aset';

                  return (
                    <tr key={tx.id}>
                      <td className="tabular" style={{ whiteSpace: 'nowrap', color: 'var(--ink-muted)' }}>
                        {formatShortDate(tx.tgl)}
                      </td>
                      <td>
                        <span className={`mm-status-pill ${isMove ? 'plan' : isIn ? 'ok' : 'err'}`}>
                          {tx.tipe === 'beli_aset'
                            ? 'Beli Aset'
                            : tx.tipe === 'jual_aset'
                            ? 'Jual Aset'
                            : tx.tipe === 'transfer'
                            ? 'Pindah'
                            : tx.tipe === 'bayar_hutang'
                            ? `Cicilan ${tx.porsi || ''}`
                            : tx.tipe === 'penyesuaian'
                            ? 'Rekonsiliasi'
                            : isIn
                            ? 'Masuk'
                            : 'Keluar'}
                        </span>
                      </td>
                      <td>
                        <div style={{ fontWeight: 700 }}>{tx.ket || tx.kat || 'Transaksi'}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--ink-muted)', marginTop: 2 }}>
                          {tx.kat || 'Non-kategori'}
                          {dst && tx.unit ? ` · ${fmtUnit(tx.unit, dst)}` : ''}
                          {tx.mood ? ` · ${tx.mood}` : ''}
                          {tx.jenis ? ` · ${tx.jenis}` : ''}
                        </div>
                      </td>
                      <td style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
                        {dst ? `${src?.nama || '—'} → ${dst.nama}` : src?.nama || '—'}
                      </td>
                      <td>
                        {isOperationalExpense(tx) ? (
                          <input
                            type="text"
                            className="mm-input"
                            style={{ height: 32, fontSize: 12, minWidth: 165 }}
                            placeholder="Alasan beli (opsional)..."
                            defaultValue={tx.kenapa || ''}
                            onBlur={(e) => onUpdateTxnReason(tx.id, e.target.value)}
                          />
                        ) : (
                          <span style={{ color: 'var(--ink-muted)', fontSize: 12 }}>—</span>
                        )}
                      </td>
                      <td
                        className="right tabular"
                        style={{
                          fontWeight: 800,
                          whiteSpace: 'nowrap',
                          color: isMove ? 'var(--navy)' : isIn ? 'var(--ok-ink)' : 'var(--ink-primary)',
                        }}
                      >
                        {isMove ? '' : isIn ? '+' : '−'}
                        {fmtRp(tx.nominal)}
                        {tx.tipe === 'jual_aset' && tx.untungRugi !== null && tx.untungRugi !== undefined && (
                          <div
                            style={{
                              fontSize: 11,
                              color: tx.untungRugi >= 0 ? 'var(--ok-ink)' : 'var(--err-ink)',
                            }}
                          >
                            {tx.untungRugi >= 0 ? 'Untung ' : 'Rugi '}
                            {fmtRp(Math.abs(tx.untungRugi))}
                          </div>
                        )}
                      </td>
                      <td className="right">
                        <button
                          type="button"
                          className="mm-icon-btn"
                          aria-label="Hapus baris"
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
  );
};

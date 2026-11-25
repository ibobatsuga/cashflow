import React, { useMemo, useState } from 'react';
import { Bell, Download, Lock, Search, Upload, X } from 'lucide-react';
import type {
  MoneyMapState,
  MoodTag,
  NavTabId,
  SpendNature,
  Transaction,
} from '../types';
import {
  type SmartAlert,
  computeAverageBookPrice,
  computePocketBalance,
  fmtRp,
  fmtUnit,
  formatInputThousands,
  formatShortDate,
  getPocketUnitLabel,
  parseNumericInput,
  todayISO,
} from '../lib/financeEngine';

const MOOD_OPTIONS: MoodTag[] = [
  'Tenang & Terencana',
  'Lelah / Butuh Rehat',
  'Stres Kerja',
  'FOMO / Promo',
  'Apresiasi Diri',
  'Sosial & Keluarga',
  'Darurat Mendadak',
];

const NATURE_OPTIONS: SpendNature[] = [
  'Kebutuhan',
  'Keluarga / Ortu',
  'Self-Reward Sehat',
  'Keinginan',
  'Impulsif',
];

const INCOME_CATEGORIES = [
  'Gaji & Penghasilan Utama',
  'Freelance & Proyek',
  'Bonus & Tunjangan',
  'Hasil Investasi',
  'Pemasukan Lainnya',
];

// ================= 1. QUICK TRANSACTION COMPOSER MODAL =================
export const TransactionModal: React.FC<{
  state: MoneyMapState;
  onClose: () => void;
  onSaveTxn: (txn: Transaction, assetModalDelta?: { pocketId: string; deltaRp: number }) => void;
}> = ({ state, onClose, onSaveTxn }) => {
  const cashPockets = useMemo(
    () => state.pockets.filter((p) => !p.arsip && p.satuan === 'rp' && p.isKas),
    [state.pockets]
  );
  const allActivePockets = useMemo(() => state.pockets.filter((p) => !p.arsip), [state.pockets]);
  const assetPockets = useMemo(
    () => state.pockets.filter((p) => !p.arsip && !p.isKas),
    [state.pockets]
  );

  const [mode, setMode] = useState<'pengeluaran' | 'pemasukan' | 'transfer' | 'jual_aset'>('pengeluaran');
  const [tgl, setTgl] = useState(todayISO());
  const [nominalRaw, setNominalRaw] = useState('');
  const [kantongId, setKantongId] = useState(cashPockets[0]?.id || '');
  const [tujuanId, setTujuanId] = useState('');
  const [unitRaw, setUnitRaw] = useState('');
  const [kat, setKat] = useState('');
  const [ket, setKet] = useState('');
  const [mood, setMood] = useState<MoodTag | ''>('Tenang & Terencana');
  const [jenis, setJenis] = useState<SpendNature | ''>('Kebutuhan');
  const [refAssetId, setRefAssetId] = useState('');
  const [errMsg, setErrMsg] = useState('');

  const expenseCategories = useMemo(() => {
    const names = new Set<string>();
    state.setup.allocPersonal.forEach((r) => names.add(r.name));
    state.setup.allocIncome.forEach((r) => {
      if (!r.locked && !r.name.toLowerCase().includes('kebutuhan diri')) names.add(r.name);
    });
    return Array.from(names);
  }, [state.setup]);

  const targetPocket = useMemo(
    () => state.pockets.find((p) => p.id === tujuanId) || null,
    [state.pockets, tujuanId]
  );

  const needsUnitInput =
    (mode === 'transfer' && targetPocket !== null && targetPocket.satuan !== 'rp') ||
    mode === 'jual_aset';

  const nominalVal = parseNumericInput(nominalRaw, false);
  const unitVal = parseNumericInput(unitRaw, true);

  return (
    <div className="mm-modal-backdrop" onClick={onClose}>
      <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-card-head">
          <h2 className="mm-card-title">Catat Transaksi Baru</h2>
          <button type="button" className="mm-icon-btn" onClick={onClose} aria-label="Tutup">
            <X size={16} />
          </button>
        </div>

        <div className="mm-segmented" style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
          {(
            [
              ['pengeluaran', 'Pengeluaran'],
              ['pemasukan', 'Pemasukan'],
              ['transfer', 'Pindah / Beli Aset'],
              ['jual_aset', 'Jual Aset'],
            ] as const
          ).map(([id, lbl]) => (
            <button
              key={id}
              type="button"
              className={`mm-seg-btn ${mode === id ? 'active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => {
                setMode(id);
                setErrMsg('');
              }}
            >
              {lbl}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (nominalVal <= 0) {
              setErrMsg('Masukkan nominal Rupiah yang valid.');
              return;
            }
            if (!kantongId) {
              setErrMsg('Pilih kantong kas terlebih dahulu.');
              return;
            }

            if (mode === 'pengeluaran' || mode === 'pemasukan') {
              const chosenKat =
                kat || (mode === 'pemasukan' ? INCOME_CATEGORIES[0] : expenseCategories[0] || 'Lainnya');
              onSaveTxn({
                id: `tx_${Date.now()}`,
                tgl,
                nominal: nominalVal,
                ket: ket.trim() || chosenKat,
                kat: chosenKat,
                mood: mode === 'pengeluaran' ? mood : '',
                jenis: mode === 'pengeluaran' ? jenis : '',
                tipe: mode,
                kantongId,
                refKantongId: mode === 'pemasukan' && refAssetId ? refAssetId : null,
              });
              onClose();
              return;
            }

            if (mode === 'transfer') {
              if (!tujuanId || tujuanId === kantongId) {
                setErrMsg('Pilih kantong tujuan yang berbeda dari kantong asal.');
                return;
              }
              if (targetPocket && targetPocket.satuan !== 'rp') {
                if (unitVal <= 0) {
                  setErrMsg(`Masukkan jumlah ${getPocketUnitLabel(targetPocket)} yang dibeli.`);
                  return;
                }
                onSaveTxn(
                  {
                    id: `tx_${Date.now()}`,
                    tgl,
                    nominal: nominalVal,
                    ket: ket.trim() || `Beli ${targetPocket.nama}`,
                    kat: 'Investasi Masa Depan',
                    tipe: 'beli_aset',
                    kantongId,
                    kantongTujuanId: tujuanId,
                    unit: unitVal,
                    hargaSatuan: nominalVal / unitVal,
                  },
                  { pocketId: tujuanId, deltaRp: nominalVal }
                );
              } else {
                onSaveTxn({
                  id: `tx_${Date.now()}`,
                  tgl,
                  nominal: nominalVal,
                  ket: ket.trim() || 'Pindah dana antar kantong',
                  kat: '',
                  tipe: 'transfer',
                  kantongId,
                  kantongTujuanId: tujuanId,
                });
              }
              onClose();
              return;
            }

            if (mode === 'jual_aset') {
              if (!targetPocket) {
                setErrMsg('Pilih kantong aset yang dijual.');
                return;
              }
              const availableUnits = computePocketBalance(
                targetPocket,
                state.transactions,
                state.setup.cutoffDay
              );
              if (unitVal <= 0 || unitVal - availableUnits > 1e-8) {
                setErrMsg(`Saldo aset tersedia hanya ${fmtUnit(availableUnits, targetPocket)}.`);
                return;
              }
              const avgBook = computeAverageBookPrice(
                targetPocket,
                state.transactions,
                state.setup.cutoffDay
              );
              const nilaiBuku = Math.round(unitVal * avgBook);
              const untungRugi = nominalVal - nilaiBuku;

              onSaveTxn(
                {
                  id: `tx_${Date.now()}`,
                  tgl,
                  nominal: nominalVal,
                  ket: ket.trim() || `Jual ${targetPocket.nama}`,
                  kat: 'Realisasi Aset',
                  tipe: 'jual_aset',
                  kantongId,
                  kantongTujuanId: targetPocket.id,
                  unit: unitVal,
                  hargaSatuan: nominalVal / unitVal,
                  nilaiBuku,
                  untungRugi,
                },
                { pocketId: targetPocket.id, deltaRp: -nilaiBuku }
              );
              onClose();
            }
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          {errMsg && (
            <div className="mm-status-pill err" style={{ alignSelf: 'flex-start' }}>
              {errMsg}
            </div>
          )}

          <div className="mm-field-grid">
            <div className="mm-field">
              <label className="mm-label">Tanggal</label>
              <input
                type="date"
                className="mm-input tabular"
                value={tgl}
                onChange={(e) => setTgl(e.target.value)}
                required
              />
            </div>

            <div className="mm-field">
              <label className="mm-label">
                {mode === 'jual_aset' ? 'Uang Bersih Diterima (Rp)' : 'Nominal (Rp)'}
              </label>
              <input
                type="text"
                inputMode="numeric"
                className="mm-input tabular"
                placeholder="250.000"
                value={nominalRaw}
                onChange={(e) => setNominalRaw(formatInputThousands(e.target.value))}
                autoFocus
                required
              />
            </div>
          </div>

          <div className="mm-field-grid">
            <div className="mm-field">
              <label className="mm-label">
                {mode === 'pemasukan' || mode === 'jual_aset' ? 'Masuk ke Kantong Kas' : 'Dari Kantong Kas'}
              </label>
              <select
                className="mm-select"
                value={kantongId}
                onChange={(e) => setKantongId(e.target.value)}
              >
                {cashPockets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama} ({fmtRp(computePocketBalance(p, state.transactions, state.setup.cutoffDay))})
                  </option>
                ))}
              </select>
            </div>

            {(mode === 'pengeluaran' || mode === 'pemasukan') && (
              <div className="mm-field">
                <label className="mm-label">Pos Kategori</label>
                <select
                  className="mm-select"
                  value={kat}
                  onChange={(e) => setKat(e.target.value)}
                >
                  {(mode === 'pemasukan' ? INCOME_CATEGORIES : expenseCategories).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(mode === 'transfer' || mode === 'jual_aset') && (
              <div className="mm-field">
                <label className="mm-label">
                  {mode === 'jual_aset' ? 'Kantong Aset yang Dijual' : 'Ke Kantong Tujuan'}
                </label>
                <select
                  className="mm-select"
                  value={tujuanId}
                  onChange={(e) => setTujuanId(e.target.value)}
                  required
                >
                  <option value="">-- Pilih Kantong --</option>
                  {(mode === 'jual_aset' ? assetPockets : allActivePockets.filter((p) => p.id !== kantongId)).map(
                    (p) => (
                      <option key={p.id} value={p.id}>
                        {p.nama} ({fmtUnit(computePocketBalance(p, state.transactions, state.setup.cutoffDay), p)})
                      </option>
                    )
                  )}
                </select>
              </div>
            )}
          </div>

          {needsUnitInput && targetPocket && (
            <div className="mm-field">
              <label className="mm-label">
                Jumlah Unit ({getPocketUnitLabel(targetPocket)})
              </label>
              <input
                type="text"
                inputMode="decimal"
                className="mm-input tabular"
                placeholder="Mis. 1,25"
                value={unitRaw}
                onChange={(e) => setUnitRaw(e.target.value)}
                required
              />
            </div>
          )}

          {mode === 'pengeluaran' && (
            <div className="mm-field-grid">
              <div className="mm-field">
                <label className="mm-label">Sifat Pengeluaran</label>
                <select
                  className="mm-select"
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value as SpendNature)}
                >
                  {NATURE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>

              <div className="mm-field">
                <label className="mm-label">Suasana Hati Saat Transaksi</label>
                <select
                  className="mm-select"
                  value={mood}
                  onChange={(e) => setMood(e.target.value as MoodTag)}
                >
                  {MOOD_OPTIONS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {mode === 'pemasukan' && assetPockets.length > 0 && (
            <div className="mm-field">
              <label className="mm-label">Sumber Dividen / Kupon Aset (Opsional)</label>
              <select
                className="mm-select"
                value={refAssetId}
                onChange={(e) => setRefAssetId(e.target.value)}
              >
                <option value="">-- Bukan hasil instrumen aset --</option>
                {assetPockets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nama}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="mm-field">
            <label className="mm-label">Keterangan Singkat</label>
            <input
              type="text"
              className="mm-input"
              placeholder="Mis. Belanja dapur mingguan / Gaji November"
              value={ket}
              onChange={(e) => setKet(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button type="button" className="mm-pill-btn compact" onClick={onClose}>
              Batal
            </button>
            <button type="submit" className="mm-pill-btn compact primary">
              Simpan ke Jurnal
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ================= 2. GLOBAL QUICK SEARCH MODAL =================
export const QuickSearchModal: React.FC<{
  state: MoneyMapState;
  onClose: () => void;
  onNavigate: (tab: NavTabId) => void;
}> = ({ state, onClose, onNavigate }) => {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();

  const matchedTxns = useMemo(() => {
    if (!term) return state.transactions.slice(-6).reverse();
    return state.transactions
      .filter(
        (t) =>
          (t.ket || '').toLowerCase().includes(term) ||
          (t.kat || '').toLowerCase().includes(term)
      )
      .slice(0, 8);
  }, [state.transactions, term]);

  return (
    <div className="mm-modal-backdrop" onClick={onClose}>
      <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Search size={18} color="#1C90C2" />
          <input
            type="text"
            className="mm-input"
            style={{ flex: 1 }}
            placeholder="Cari transaksi, kategori, atau keterangan..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            autoFocus
          />
          <button type="button" className="mm-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {matchedTxns.length === 0 ? (
            <div style={{ padding: 16, color: 'var(--ink-muted)', textAlign: 'center' }}>
              Tidak ditemukan transaksi dengan kata kunci "{q}".
            </div>
          ) : (
            matchedTxns.map((tx) => (
              <button
                key={tx.id}
                type="button"
                onClick={() => {
                  onNavigate('transactions');
                  onClose();
                }}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '10px 14px',
                  borderRadius: 14,
                  border: 'none',
                  background: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-badge)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13.5 }}>{tx.ket || tx.kat}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                    {formatShortDate(tx.tgl)} · {tx.kat || tx.tipe}
                  </div>
                </div>
                <span className="tabular" style={{ fontWeight: 800 }}>
                  {fmtRp(tx.nominal)}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// ================= 3. SMART ALERTS MODAL =================
export const AlertsModal: React.FC<{
  alerts: SmartAlert[];
  onClose: () => void;
  onNavigate: (tab: NavTabId) => void;
}> = ({ alerts, onClose, onNavigate }) => (
  <div className="mm-modal-backdrop" onClick={onClose}>
    <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
      <div className="mm-card-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Bell size={18} color="#1C90C2" />
          <h2 className="mm-card-title">Radar &amp; Pengingat Arus Kas</h2>
        </div>
        <button type="button" className="mm-icon-btn" onClick={onClose}>
          <X size={16} />
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {alerts.map((al) => (
          <div
            key={al.id}
            style={{
              padding: 14,
              borderRadius: 16,
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-badge)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{al.title}</div>
              <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>{al.detail}</div>
            </div>
            <button
              type="button"
              className="mm-pill-btn compact"
              onClick={() => {
                onNavigate(al.targetTab);
                onClose();
              }}
            >
              Buka
            </button>
          </div>
        ))}
      </div>
    </div>
  </div>
);

// ================= 4. WORKSPACE VAULT, BACKUP & PASSCODE MODAL =================
export const VaultSettingsModal: React.FC<{
  state: MoneyMapState;
  onClose: () => void;
  onExportJSON: () => void;
  onImportJSON: (file: File) => void;
  onLoadSampleData: () => void;
  onResetBlankData: () => void;
  onUpdatePasscode: (code: string | null) => void;
}> = ({
  state,
  onClose,
  onExportJSON,
  onImportJSON,
  onLoadSampleData,
  onResetBlankData,
  onUpdatePasscode,
}) => {
  const [pinInput, setPinInput] = useState(state.setup.passcode || '');

  return (
    <div className="mm-modal-backdrop" onClick={onClose}>
      <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="mm-card-head">
          <h2 className="mm-card-title">Data Vault, Backup &amp; Keamanan</h2>
          <button type="button" className="mm-icon-btn" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <p className="mm-card-sub" style={{ marginBottom: 16 }}>
          Seluruh data MoneyMap tersimpan lokal secara ganda di perangkatmu (<code>localStorage</code> +{' '}
          <code>IndexedDB</code>) tanpa dikirim ke server pihak ketiga.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-badge)',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 4 }}>Sinkronisasi &amp; Cadangan Antar Perangkat</div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 12 }}>
              Unduh file JSON tervalidasi untuk backup rutin atau pindahkan ke laptop/HP lain.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" className="mm-pill-btn compact primary" onClick={onExportJSON}>
                <Download size={14} />
                <span>Export Backup (.json)</span>
              </button>

              <label className="mm-pill-btn compact" style={{ cursor: 'pointer' }}>
                <Upload size={14} />
                <span>Import Backup (.json)</span>
                <input
                  type="file"
                  accept=".json,application/json"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) onImportJSON(f);
                    e.target.value = '';
                  }}
                />
              </label>
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-badge)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 800, marginBottom: 4 }}>
              <Lock size={15} color="#1C90C2" />
              <span>Kunci Layar Lokal (Opsional)</span>
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-muted)', marginBottom: 10 }}>
              Pasang kode akses lokal apabila perangkat digunakan bersama orang lain. Kosongkan untuk menonaktifkan.
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                className="mm-input"
                style={{ height: 38, flex: 1 }}
                placeholder="Tanpa kode akses"
                value={pinInput}
                onChange={(e) => setPinInput(e.target.value)}
              />
              <button
                type="button"
                className="mm-pill-btn compact"
                onClick={() => onUpdatePasscode(pinInput.trim() || null)}
              >
                Simpan Kunci
              </button>
            </div>
          </div>

          <div
            style={{
              padding: 16,
              borderRadius: 16,
              background: 'var(--bg-surface)',
              boxShadow: 'var(--shadow-badge)',
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Mode Dataset Workspace</div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="mm-pill-btn compact"
                onClick={() => {
                  if (window.confirm('Muat ulang dataset contoh Nadia Kusuma? Data saat ini akan digantikan.')) {
                    onLoadSampleData();
                    onClose();
                  }
                }}
              >
                Muat Data Contoh
              </button>
              <button
                type="button"
                className="mm-pill-btn compact"
                style={{ color: 'var(--err-ink)' }}
                onClick={() => {
                  if (window.confirm('Kosongkan seluruh transaksi dan mulai dari Rp0?')) {
                    onResetBlankData();
                    onClose();
                  }
                }}
              >
                Reset Workspace Kosong (Rp0)
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

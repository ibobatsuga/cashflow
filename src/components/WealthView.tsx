import React, { useMemo, useState } from 'react';
import {
  Archive,
  CheckCircle2,
  Coins,
  Plus,
  RefreshCw,
  Scale,
  Trash2,
} from 'lucide-react';
import type { DebtItem, MoneyMapState, Pocket, PocketKind, PocketUnit } from '../types';
import {
  computeAverageBookPrice,
  computeBalanceSheet,
  computePocketBalance,
  computePocketRupiah,
  DEFAULT_DECIMALS,
  fmtRp,
  fmtSignedRp,
  fmtUnit,
  formatInputThousands,
  getPocketUnitLabel,
  parseNumericInput,
  todayISO,
} from '../lib/financeEngine';

interface WealthViewProps {
  state: MoneyMapState;
  onAddPocket: (pocket: Pocket) => void;
  onUpdatePocketPrice: (id: string, price: number) => void;
  onToggleArchivePocket: (id: string, arsip: boolean) => void;
  onDeleteUnusedPocket: (id: string) => void;
  onReconcilePocket: (id: string, actualBalance: number) => void;
  onAddDebt: (debt: DebtItem, createInitialCashTxn: boolean) => void;
  onPayDebtInstallment: (
    debtId: string,
    kantongId: string,
    tgl: string,
    totalNominal: number,
    bungaNominal: number
  ) => void;
  onDeleteDebt: (id: string) => void;
}

const KIND_LABELS: Record<PocketKind, string> = {
  rekening: 'Rekening Bank',
  ewallet: 'Dompet Digital',
  tabungan: 'Tabungan',
  darurat: 'Dana Darurat',
  investasi: 'Investasi & Aset',
  lainnya: 'Kantong Lainnya',
};

export const WealthView: React.FC<WealthViewProps> = ({
  state,
  onAddPocket,
  onUpdatePocketPrice,
  onToggleArchivePocket,
  onDeleteUnusedPocket,
  onReconcilePocket,
  onAddDebt,
  onPayDebtInstallment,
  onDeleteDebt,
}) => {
  const [showAddPocket, setShowAddPocket] = useState(false);
  const [rekonTarget, setRekonTarget] = useState<Pocket | null>(null);
  const [rekonInput, setRekonInput] = useState('');
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});

  // New Pocket form
  const [pNama, setPNama] = useState('');
  const [pJenis, setPJenis] = useState<PocketKind>('rekening');
  const [pSatuan, setPSatuan] = useState<PocketUnit>('rp');
  const [pSatuanCustom, setPSatuanCustom] = useState('');
  const [pAwal, setPAwal] = useState('');
  const [pHarga, setPHarga] = useState('');
  const [pCatatan, setPCatatan] = useState('');

  // Debt & Receivable state
  const [hpTab, setHpTab] = useState<'hutang' | 'piutang'>('hutang');
  const [showAddDebt, setShowAddDebt] = useState(false);
  const [dNama, setDNama] = useState('');
  const [dNominal, setDNominal] = useState('');
  const [dTgl, setDTgl] = useState(todayISO());
  const [dCair, setDCair] = useState(true);
  const [dKantongId, setDKantongId] = useState(state.pockets.find((p) => p.isKas && !p.arsip)?.id || '');
  const [dCatatan, setDCatatan] = useState('');

  // Installment modal
  const [cicilanTarget, setCicilanTarget] = useState<DebtItem | null>(null);
  const [cTotal, setCTotal] = useState('');
  const [cBunga, setCBunga] = useState('');
  const [cTgl, setCTgl] = useState(todayISO());
  const [cKantongId, setCKantongId] = useState(state.pockets.find((p) => p.isKas && !p.arsip)?.id || '');

  const cutoff = state.setup.cutoffDay;
  const bs = useMemo(() => computeBalanceSheet(state), [state]);
  const cashPockets = useMemo(
    () => state.pockets.filter((p) => !p.arsip && p.satuan === 'rp' && p.isKas),
    [state.pockets]
  );

  const activePockets = state.pockets.filter((p) => !p.arsip);
  const archivedPockets = state.pockets.filter((p) => p.arsip);

  const countPocketTxns = (id: string) =>
    state.transactions.filter((t) => t.kantongId === id || t.kantongTujuanId === id).length;

  return (
    <div>
      <div className="mm-header-row">
        <div>
          <div className="mm-eyebrow-meta">
            <span>Multi-Aset, Rekonsiliasi Kas, &amp; Kewajiban</span>
          </div>
          <h1 className="mm-page-h1">Kantong, Aset &amp; Kewajiban</h1>
        </div>

        <div className="mm-cta-group">
          <button
            type="button"
            className="mm-pill-btn primary"
            onClick={() => setShowAddPocket(true)}
          >
            <Plus size={18} strokeWidth={2.4} />
            <span>Kantong Baru</span>
          </button>
          <button type="button" className="mm-pill-btn" onClick={() => setShowAddDebt(true)}>
            <Plus size={18} />
            <span>Catat Hutang / Piutang</span>
          </button>
        </div>
      </div>

      {/* NET WORTH SUMMARY STRIP */}
      <div className="mm-kpi-grid" style={{ marginBottom: 22 }}>
        <div className="mm-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-muted)' }}>Kas &amp; Dana Darurat</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
            {fmtRp(bs.totalKas)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
            Termasuk Dana Darurat {fmtRp(bs.totalDarurat)}
          </div>
        </div>

        <div className="mm-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-muted)' }}>Nilai Pasar Investasi</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: 'var(--ocean)' }}>
            {fmtRp(bs.totalInvestasi)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
            Emas, obligasi, saham, &amp; valas
          </div>
        </div>

        <div className="mm-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-muted)' }}>Piutang vs Kewajiban</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>
            {bs.totalHutang > 0 ? `−${fmtRp(bs.totalHutang)}` : fmtRp(bs.totalPiutang)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 4 }}>
            Piutang aktif: {fmtRp(bs.totalPiutang)}
          </div>
        </div>

        <div className="mm-card" style={{ padding: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-muted)' }}>Estimasi Kekayaan Bersih</div>
          <div className="tabular" style={{ fontSize: 24, fontWeight: 800, marginTop: 6, color: 'var(--navy)' }}>
            {fmtRp(bs.kekayaanBersih)}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ok-ink)', fontWeight: 700, marginTop: 4 }}>
            Aset − Kewajiban ({activePockets.length} kantong aktif)
          </div>
        </div>
      </div>

      {/* ACTIVE POCKETS GRID */}
      <div className="mm-card" style={{ marginBottom: 22 }}>
        <div className="mm-card-head">
          <div>
            <h2 className="mm-card-title">Daftar Kantong Kas &amp; Portofolio Aset</h2>
            <p className="mm-card-sub">
              Saldo dihitung otomatis dari saldo awal dan mutasi jurnal transaksi
            </p>
          </div>
        </div>

        <div className="mm-two-col" style={{ marginBottom: 0 }}>
          {activePockets.map((p) => {
            const unitBal = computePocketBalance(p, state.transactions, cutoff);
            const rpVal = computePocketRupiah(p, state.transactions, cutoff);
            const isRp = p.satuan === 'rp';
            const avgBook = !isRp ? computeAverageBookPrice(p, state.transactions, cutoff) : 0;
            const unrealized =
              !isRp && rpVal !== null && p.totalModal > 0 ? rpVal - p.totalModal : null;
            const txCount = countPocketTxns(p.id);

            return (
              <div
                key={p.id}
                style={{
                  background: 'var(--bg-surface)',
                  boxShadow: 'var(--shadow-badge)',
                  borderRadius: 18,
                  padding: 18,
                  border: '1px solid rgba(255,255,255,0.75)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  gap: 12,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 800, fontSize: 15.5 }}>{p.nama}</span>
                      <span className={`mm-status-pill ${isRp ? 'neutral' : 'plan'}`}>
                        {KIND_LABELS[p.jenis]}
                      </span>
                    </div>
                    {p.catatan && (
                      <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 3 }}>
                        {p.catatan}
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div className="tabular" style={{ fontSize: 20, fontWeight: 800 }}>
                      {fmtUnit(unitBal, p)}
                    </div>
                    {!isRp && (
                      <div className="tabular" style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {rpVal !== null ? `≈ ${fmtRp(rpVal)}` : 'Harga pasar belum diisi'}
                      </div>
                    )}
                  </div>
                </div>

                {!isRp && (
                  <div
                    className="tabular"
                    style={{
                      fontSize: 12,
                      padding: '8px 12px',
                      borderRadius: 12,
                      background: 'rgba(255,255,255,0.45)',
                      display: 'flex',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: 8,
                    }}
                  >
                    <span>
                      Modal: <strong>{fmtRp(p.totalModal)}</strong> (Buku {fmtRp(avgBook)}/
                      {getPocketUnitLabel(p)})
                    </span>
                    {unrealized !== null && (
                      <span
                        style={{
                          fontWeight: 800,
                          color: unrealized >= 0 ? 'var(--ok-ink)' : 'var(--err-ink)',
                        }}
                      >
                        Unrealized {fmtSignedRp(unrealized)}
                      </span>
                    )}
                  </div>
                )}

                {!isRp && (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mm-input tabular"
                      style={{ height: 36, flex: 1, fontSize: 12.5 }}
                      placeholder={`Harga pasar / ${getPocketUnitLabel(p)} (kini ${fmtRp(p.hargaPerSatuan)})`}
                      value={priceInputs[p.id] || ''}
                      onChange={(e) =>
                        setPriceInputs((prev) => ({
                          ...prev,
                          [p.id]: formatInputThousands(e.target.value),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="mm-pill-btn compact"
                      onClick={() => {
                        const val = parseNumericInput(priceInputs[p.id] || '', false);
                        if (val > 0) {
                          onUpdatePocketPrice(p.id, val);
                          setPriceInputs((prev) => ({ ...prev, [p.id]: '' }));
                        }
                      }}
                    >
                      <RefreshCw size={13} />
                      <span>Update Harga</span>
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11.5, color: 'var(--ink-muted)' }}>
                    {txCount} mutasi tercatat
                    {p.hargaUpdatedAt ? ` · Update ${p.hargaUpdatedAt}` : ''}
                  </span>

                  <div style={{ display: 'flex', gap: 8 }}>
                    {isRp && p.isKas && (
                      <button
                        type="button"
                        className="mm-pill-btn compact"
                        onClick={() => {
                          setRekonTarget(p);
                          setRekonInput(formatInputThousands(String(Math.round(unitBal))));
                        }}
                      >
                        <Scale size={13} />
                        <span>Cocokkan Saldo</span>
                      </button>
                    )}

                    {txCount > 0 ? (
                      <button
                        type="button"
                        className="mm-icon-btn"
                        title="Arsipkan kantong"
                        onClick={() => onToggleArchivePocket(p.id, true)}
                      >
                        <Archive size={14} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="mm-icon-btn"
                        title="Hapus kantong kosong"
                        onClick={() => onDeleteUnusedPocket(p.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {archivedPockets.length > 0 && (
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line-subtle)' }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink-muted)', marginBottom: 10 }}>
              Kantong Diarsipkan ({archivedPockets.length})
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {archivedPockets.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="mm-pill-btn compact"
                  onClick={() => onToggleArchivePocket(p.id, false)}
                >
                  <span>Aktifkan kembali: {p.nama}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* HUTANG & PIUTANG TRACKER */}
      <div className="mm-card">
        <div className="mm-card-head">
          <div>
            <h2 className="mm-card-title">Kontrak Hutang &amp; Piutang</h2>
            <p className="mm-card-sub">
              Pembayaran cicilan otomatis memisahkan pengurang pokok (neraca) dari beban bunga (operasional)
            </p>
          </div>

          <div className="mm-segmented">
            <button
              type="button"
              className={`mm-seg-btn ${hpTab === 'hutang' ? 'active' : ''}`}
              onClick={() => setHpTab('hutang')}
            >
              Hutang ({state.debts.filter((d) => d.tipe === 'hutang').length})
            </button>
            <button
              type="button"
              className={`mm-seg-btn ${hpTab === 'piutang' ? 'active' : ''}`}
              onClick={() => setHpTab('piutang')}
            >
              Piutang ({state.debts.filter((d) => d.tipe === 'piutang').length})
            </button>
          </div>
        </div>

        {state.debts.filter((d) => d.tipe === hpTab).length === 0 ? (
          <div style={{ padding: '20px 4px', color: 'var(--ink-muted)' }}>
            Tidak ada catatan {hpTab} saat ini.
          </div>
        ) : (
          <div className="mm-two-col" style={{ marginBottom: 0 }}>
            {state.debts
              .filter((d) => d.tipe === hpTab)
              .map((item) => {
                const paidPct =
                  item.nominal > 0 ? Math.min(100, Math.round(((item.nominal - item.sisa) / item.nominal) * 100)) : 100;
                const isLunas = item.sisa <= 0 || item.status === 'lunas';

                return (
                  <div
                    key={item.id}
                    style={{
                      padding: 18,
                      borderRadius: 18,
                      background: 'var(--bg-surface)',
                      boxShadow: 'var(--shadow-badge)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{item.nama}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-muted)', marginTop: 2 }}>
                          Mulai {item.tgl}
                          {item.catatan ? ` · ${item.catatan}` : ''}
                        </div>
                      </div>
                      <span className={`mm-status-pill ${isLunas ? 'ok' : hpTab === 'hutang' ? 'err' : 'plan'}`}>
                        {isLunas ? 'Lunas' : `Sisa ${fmtRp(item.sisa)}`}
                      </span>
                    </div>

                    <div style={{ margin: '14px 0' }}>
                      <div className="mm-prog-row-top">
                        <span style={{ fontSize: 12.5, color: 'var(--ink-muted)', fontWeight: 700 }}>
                          Progres Pelunasan Pokok ({paidPct}%)
                        </span>
                        <span className="tabular" style={{ fontSize: 12.5, fontWeight: 700 }}>
                          Total {fmtRp(item.nominal)}
                        </span>
                      </div>
                      <div className="mm-prog-track">
                        <div
                          className="mm-prog-fill"
                          style={{
                            width: `${paidPct}%`,
                            background: isLunas ? '#2D8847' : '#1C90C2',
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: 12, color: 'var(--ink-muted)' }}>
                        {item.riwayat.length} kali pembayaran tercatat
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {!isLunas && (
                          <button
                            type="button"
                            className="mm-pill-btn compact primary"
                            onClick={() => {
                              setCicilanTarget(item);
                              setCTotal('');
                              setCBunga('');
                              setCTgl(todayISO());
                            }}
                          >
                            <CheckCircle2 size={14} />
                            <span>{hpTab === 'hutang' ? 'Bayar Cicilan' : 'Terima Cicilan'}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="mm-icon-btn"
                          aria-label="Hapus kontrak"
                          onClick={() => {
                            if (window.confirm(`Hapus catatan "${item.nama}" beserta mutasi kas terkait?`)) {
                              onDeleteDebt(item.id);
                            }
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* MODAL: TAMBAH KANTONG */}
      {showAddPocket && (
        <div className="mm-modal-backdrop" onClick={() => setShowAddPocket(false)}>
          <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="mm-card-head">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <Coins size={20} color="#1C90C2" />
                <h2 className="mm-card-title">Tambah Kantong Kas / Aset Baru</h2>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!pNama.trim()) return;
                const isRp = pSatuan === 'rp';
                const awalVal = parseNumericInput(pAwal, !isRp);
                const hargaVal = isRp ? 0 : parseNumericInput(pHarga, false);
                const today = todayISO();

                onAddPocket({
                  id: `p_${Date.now()}`,
                  nama: pNama.trim(),
                  jenis: pJenis,
                  satuan: pSatuan,
                  satuanCustom: pSatuanCustom.trim(),
                  hargaPerSatuan: hargaVal,
                  hargaUpdatedAt: !isRp && hargaVal > 0 ? today : null,
                  catatan: pCatatan.trim(),
                  isKas: isRp && pJenis !== 'investasi',
                  arsip: false,
                  desimal: DEFAULT_DECIMALS[pSatuan],
                  totalModal: !isRp && hargaVal > 0 ? awalVal * hargaVal : 0,
                  saldoAwal: { [today]: awalVal },
                });
                setPNama('');
                setPAwal('');
                setPHarga('');
                setPCatatan('');
                setShowAddPocket(false);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="mm-field">
                <label className="mm-label">Nama Kantong / Instrumen</label>
                <input
                  type="text"
                  className="mm-input"
                  placeholder="Mis. Mandiri Tabungan, Emas Antam, Saham BBCA"
                  value={pNama}
                  onChange={(e) => setPNama(e.target.value)}
                  required
                />
              </div>

              <div className="mm-field-grid">
                <div className="mm-field">
                  <label className="mm-label">Kategori Kantong</label>
                  <select
                    className="mm-select"
                    value={pJenis}
                    onChange={(e) => setPJenis(e.target.value as PocketKind)}
                  >
                    {Object.entries(KIND_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mm-field">
                  <label className="mm-label">Satuan Unit</label>
                  <select
                    className="mm-select"
                    value={pSatuan}
                    onChange={(e) => setPSatuan(e.target.value as PocketUnit)}
                  >
                    <option value="rp">Rupiah (Rp)</option>
                    <option value="gram">Emas (gram)</option>
                    <option value="lot">Saham (lot)</option>
                    <option value="lembar">Reksa Dana / Lembar</option>
                    <option value="valas">Mata Uang Asing (Valas)</option>
                    <option value="custom">Satuan Kustom</option>
                  </select>
                </div>
              </div>

              {(pSatuan === 'valas' || pSatuan === 'custom') && (
                <div className="mm-field">
                  <label className="mm-label">Kode Satuan (mis. USD, SGD, koin, unit)</label>
                  <input
                    type="text"
                    className="mm-input"
                    value={pSatuanCustom}
                    onChange={(e) => setPSatuanCustom(e.target.value)}
                  />
                </div>
              )}

              <div className="mm-field-grid">
                <div className="mm-field">
                  <label className="mm-label">
                    Saldo Awal ({pSatuan === 'rp' ? 'Rp' : pSatuanCustom || pSatuan})
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="mm-input tabular"
                    placeholder={pSatuan === 'rp' ? '2.500.000' : '5,25'}
                    value={pAwal}
                    onChange={(e) =>
                      setPAwal(pSatuan === 'rp' ? formatInputThousands(e.target.value) : e.target.value)
                    }
                  />
                </div>

                {pSatuan !== 'rp' && (
                  <div className="mm-field">
                    <label className="mm-label">Harga Pasar per Satuan (Rp)</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mm-input tabular"
                      placeholder="1.560.000"
                      value={pHarga}
                      onChange={(e) => setPHarga(formatInputThousands(e.target.value))}
                    />
                  </div>
                )}
              </div>

              <div className="mm-field">
                <label className="mm-label">Catatan Singkat (Opsional)</label>
                <input
                  type="text"
                  className="mm-input"
                  value={pCatatan}
                  onChange={(e) => setPCatatan(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
                <button type="button" className="mm-pill-btn compact" onClick={() => setShowAddPocket(false)}>
                  Batal
                </button>
                <button type="submit" className="mm-pill-btn compact primary">
                  Simpan Kantong
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REKONSILIASI SALDO (COCOKKAN SALDO) */}
      {rekonTarget && (
        <div className="mm-modal-backdrop" onClick={() => setRekonTarget(null)}>
          <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mm-card-title" style={{ marginBottom: 6 }}>
              Cocokkan Saldo: {rekonTarget.nama}
            </h2>
            <p className="mm-card-sub" style={{ marginBottom: 16 }}>
              Masukkan saldo riil di aplikasi bank/dompetmu. MoneyMap otomatis membuat jurnal penyesuaian tanpa merusak laporan pengeluaran.
            </p>

            {(() => {
              const sysBal = Math.round(computePocketBalance(rekonTarget, state.transactions, cutoff));
              const actualBal = parseNumericInput(rekonInput, false);
              const delta = actualBal - sysBal;

              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="mm-field">
                    <label className="mm-label">Saldo Tercatat di MoneyMap: {fmtRp(sysBal)}</label>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="mm-input tabular"
                      placeholder="Masukkan saldo riil..."
                      value={rekonInput}
                      onChange={(e) => setRekonInput(formatInputThousands(e.target.value))}
                    />
                  </div>

                  <div
                    className="tabular"
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.55)',
                      fontSize: 13,
                      fontWeight: 700,
                    }}
                  >
                    Selisih Penyesuaian: <strong>{fmtSignedRp(delta)}</strong>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="mm-pill-btn compact" onClick={() => setRekonTarget(null)}>
                      Batal
                    </button>
                    <button
                      type="button"
                      className="mm-pill-btn compact primary"
                      onClick={() => {
                        onReconcilePocket(rekonTarget.id, actualBal);
                        setRekonTarget(null);
                      }}
                    >
                      Simpan Penyesuaian
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH HUTANG / PIUTANG */}
      {showAddDebt && (
        <div className="mm-modal-backdrop" onClick={() => setShowAddDebt(false)}>
          <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mm-card-title" style={{ marginBottom: 14 }}>
              Catat Kontrak Hutang / Piutang Baru
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const nom = parseNumericInput(dNominal, false);
                if (!dNama.trim() || nom <= 0) return;
                onAddDebt(
                  {
                    id: `hp_${Date.now()}`,
                    tipe: hpTab,
                    nama: dNama.trim(),
                    nominal: nom,
                    sisa: nom,
                    tgl: dTgl,
                    catatan: dCatatan.trim(),
                    status: 'aktif',
                    cair: dCair,
                    kantongId: dCair ? dKantongId : null,
                    riwayat: [],
                  },
                  dCair
                );
                setDNama('');
                setDNominal('');
                setDCatatan('');
                setShowAddDebt(false);
              }}
              style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
            >
              <div className="mm-segmented">
                <button
                  type="button"
                  className={`mm-seg-btn ${hpTab === 'hutang' ? 'active' : ''}`}
                  onClick={() => setHpTab('hutang')}
                >
                  Hutang (Kita Meminjam)
                </button>
                <button
                  type="button"
                  className={`mm-seg-btn ${hpTab === 'piutang' ? 'active' : ''}`}
                  onClick={() => setHpTab('piutang')}
                >
                  Piutang (Kita Meminjamkan)
                </button>
              </div>

              <div className="mm-field">
                <label className="mm-label">Nama Kontrak / Pihak</label>
                <input
                  type="text"
                  className="mm-input"
                  placeholder="Mis. KPR Rumah, Cicilan Alat Kerja, Pinjaman Adik"
                  value={dNama}
                  onChange={(e) => setDNama(e.target.value)}
                  required
                />
              </div>

              <div className="mm-field-grid">
                <div className="mm-field">
                  <label className="mm-label">Total Pokok (Rp)</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="mm-input tabular"
                    placeholder="5.000.000"
                    value={dNominal}
                    onChange={(e) => setDNominal(formatInputThousands(e.target.value))}
                    required
                  />
                </div>
                <div className="mm-field">
                  <label className="mm-label">Tanggal Mulai</label>
                  <input
                    type="date"
                    className="mm-input tabular"
                    value={dTgl}
                    onChange={(e) => setDTgl(e.target.value)}
                  />
                </div>
              </div>

              <div className="mm-field-grid">
                <div className="mm-field">
                  <label className="mm-label">Mutasikan ke Saldo Kas Sekarang?</label>
                  <select
                    className="mm-select"
                    value={dCair ? 'ya' : 'tidak'}
                    onChange={(e) => setDCair(e.target.value === 'ya')}
                  >
                    <option value="tidak">Tidak (Pinjaman lama / komitmen barang)</option>
                    <option value="ya">Ya, sesuaikan saldo kantong kas</option>
                  </select>
                </div>

                {dCair && (
                  <div className="mm-field">
                    <label className="mm-label">Kantong Kas</label>
                    <select
                      className="mm-select"
                      value={dKantongId}
                      onChange={(e) => setDKantongId(e.target.value)}
                    >
                      {cashPockets.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.nama}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="mm-field">
                <label className="mm-label">Catatan (Opsional)</label>
                <input
                  type="text"
                  className="mm-input"
                  value={dCatatan}
                  onChange={(e) => setDCatatan(e.target.value)}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                <button type="button" className="mm-pill-btn compact" onClick={() => setShowAddDebt(false)}>
                  Batal
                </button>
                <button type="submit" className="mm-pill-btn compact primary">
                  Simpan Kontrak
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: BAYAR / TERIMA CICILAN (POKOK VS BUNGA) */}
      {cicilanTarget && (
        <div className="mm-modal-backdrop" onClick={() => setCicilanTarget(null)}>
          <div className="mm-modal" onClick={(e) => e.stopPropagation()}>
            <h2 className="mm-card-title" style={{ marginBottom: 4 }}>
              {cicilanTarget.tipe === 'hutang' ? 'Bayar Cicilan: ' : 'Terima Cicilan: '}
              {cicilanTarget.nama}
            </h2>
            <p className="mm-card-sub" style={{ marginBottom: 16 }}>
              Sisa pokok saat ini: <strong>{fmtRp(cicilanTarget.sisa)}</strong>
            </p>

            {(() => {
              const totalVal = parseNumericInput(cTotal, false);
              const bungaVal = Math.min(totalVal, parseNumericInput(cBunga, false));
              const pokokVal = Math.max(0, totalVal - bungaVal);

              return (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (totalVal <= 0 || !cKantongId) return;
                    onPayDebtInstallment(cicilanTarget.id, cKantongId, cTgl, totalVal, bungaVal);
                    setCicilanTarget(null);
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
                >
                  <div className="mm-field-grid">
                    <div className="mm-field">
                      <label className="mm-label">Total Uang Dibayar / Diterima (Rp)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="mm-input tabular"
                        placeholder="1.595.000"
                        value={cTotal}
                        onChange={(e) => setCTotal(formatInputThousands(e.target.value))}
                        required
                      />
                    </div>
                    <div className="mm-field">
                      <label className="mm-label">Porsi Bunga / Biaya Admin (Rp)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        className="mm-input tabular"
                        placeholder="0"
                        value={cBunga}
                        onChange={(e) => setCBunga(formatInputThousands(e.target.value))}
                      />
                    </div>
                  </div>

                  <div className="mm-field-grid">
                    <div className="mm-field">
                      <label className="mm-label">Kantong Kas</label>
                      <select
                        className="mm-select"
                        value={cKantongId}
                        onChange={(e) => setCKantongId(e.target.value)}
                      >
                        {cashPockets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.nama}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mm-field">
                      <label className="mm-label">Tanggal Pembayaran</label>
                      <input
                        type="date"
                        className="mm-input tabular"
                        value={cTgl}
                        onChange={(e) => setCTgl(e.target.value)}
                      />
                    </div>
                  </div>

                  <div
                    className="tabular"
                    style={{
                      padding: 12,
                      borderRadius: 14,
                      background: 'rgba(255,255,255,0.55)',
                      fontSize: 12.5,
                      lineHeight: 1.5,
                    }}
                  >
                    <div>
                      Pengurang Pokok Neraca: <strong>{fmtRp(pokokVal)}</strong>
                    </div>
                    <div>
                      Porsi Bunga Operasional: <strong>{fmtRp(bungaVal)}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                    <button type="button" className="mm-pill-btn compact" onClick={() => setCicilanTarget(null)}>
                      Batal
                    </button>
                    <button type="submit" className="mm-pill-btn compact primary">
                      Konfirmasi Pembayaran
                    </button>
                  </div>
                </form>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

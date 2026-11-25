import React, { useEffect, useMemo, useState } from 'react';
import {
  Bell,
  FileBarChart2,
  LayoutDashboard,
  Lock,
  PieChart,
  ReceiptText,
  Search,
  Settings,
  WalletCards,
} from 'lucide-react';
import type {
  AllocationRow,
  DebtItem,
  MoneyMapState,
  NavTabId,
  Pocket,
  ReflectionNote,
  Transaction,
} from './types';
import { createBlankState, createSampleState } from './lib/sampleData';
import {
  hydrateFromIndexedDB,
  loadInitialStateSync,
  persistStateDual,
  validateAndSanitizeState,
} from './lib/storage';
import {
  computePocketBalance,
  computeSmartAlerts,
  getNextPeriodKey,
  getPeriodRange,
  todayISO,
} from './lib/financeEngine';
import { OverviewView } from './components/OverviewView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetView } from './components/BudgetView';
import { WealthView } from './components/WealthView';
import { ReportsView } from './components/ReportsView';
import {
  AlertsModal,
  QuickSearchModal,
  TransactionModal,
  VaultSettingsModal,
} from './components/WorkspaceModals';

const NAV_ITEMS: Array<{ id: NavTabId; label: string; shortLabel: string; icon: React.ReactNode }> = [
  { id: 'dashboard', label: 'Dashboard', shortLabel: 'Home', icon: <LayoutDashboard size={18} /> },
  { id: 'transactions', label: 'Transaksi', shortLabel: 'Jurnal', icon: <ReceiptText size={18} /> },
  { id: 'budget', label: 'Anggaran', shortLabel: 'Alokasi', icon: <PieChart size={18} /> },
  { id: 'wealth', label: 'Kantong & Aset', shortLabel: 'Kantong', icon: <WalletCards size={18} /> },
  { id: 'reports', label: 'Laporan', shortLabel: 'Laporan', icon: <FileBarChart2 size={18} /> },
];

export const App: React.FC = () => {
  const [state, setState] = useState<MoneyMapState>(() => loadInitialStateSync(createSampleState));
  const [activeTab, setActiveTab] = useState<NavTabId>('dashboard');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(() => state.setup.activePeriod);

  const [showNewTxnModal, setShowNewTxnModal] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [showAlertsModal, setShowAlertsModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Optional local screen lock
  const [unlocked, setUnlocked] = useState<boolean>(() => !state.setup.passcode);
  const [unlockInput, setUnlockInput] = useState('');
  const [unlockErr, setUnlockErr] = useState(false);

  const notify = (msg: string) => {
    setToastMsg(msg);
  };

  useEffect(() => {
    if (!toastMsg) return;
    const timer = window.setTimeout(() => setToastMsg(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toastMsg]);

  // Hydrate from IndexedDB on startup if localStorage was evicted (e.g. iOS WebKit ITP)
  useEffect(() => {
    let cancelled = false;
    void hydrateFromIndexedDB(createSampleState).then((hydrated) => {
      if (!cancelled && hydrated) {
        setState((cur) => {
          if (cur.isSampleData && !hydrated.isSampleData) {
            setSelectedPeriod(hydrated.setup.activePeriod);
            setUnlocked(!hydrated.setup.passcode);
            return hydrated;
          }
          return cur;
        });
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Dual-write persistence + keep current period snapshot synced
  const commitState = (updater: (prev: MoneyMapState) => MoneyMapState) => {
    setState((prev) => {
      const next = updater(prev);
      const ap = next.setup.activePeriod;
      const withSnapshot: MoneyMapState = {
        ...next,
        monthSnapshots: {
          ...next.monthSnapshots,
          [ap]: {
            penghasilanRencana: next.setup.penghasilanRencana,
            budgetPribadi: next.setup.budgetPribadi,
            allocIncome: next.setup.allocIncome,
            allocPersonal: next.setup.allocPersonal,
          },
        },
      };
      persistStateDual(withSnapshot);
      return withSnapshot;
    });
  };

  // Keyboard shortcut Cmd/Ctrl + K for quick search
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setShowSearchModal((v) => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const alerts = useMemo(
    () => computeSmartAlerts(state, selectedPeriod),
    [state, selectedPeriod]
  );
  const hasActionableAlert = alerts.some((a) => a.level === 'danger' || a.level === 'warn');

  // ===== HANDLERS =====
  const handleSaveTxn = (
    txn: Transaction,
    assetModalDelta?: { pocketId: string; deltaRp: number }
  ) => {
    commitState((prev) => {
      let pockets = prev.pockets;
      if (assetModalDelta) {
        pockets = prev.pockets.map((p) =>
          p.id === assetModalDelta.pocketId
            ? { ...p, totalModal: Math.max(0, (p.totalModal || 0) + assetModalDelta.deltaRp) }
            : p
        );
      }
      return {
        ...prev,
        isSampleData: false,
        pockets,
        transactions: [...prev.transactions, txn],
      };
    });
    notify('Transaksi berhasil disimpan ke jurnal.');
  };

  const handleDeleteTxn = (id: string) => {
    commitState((prev) => {
      const target = prev.transactions.find((t) => t.id === id);
      if (!target) return prev;

      let debts = prev.debts;
      if (target.refId && target.porsi === 'pokok') {
        debts = prev.debts.map((d) =>
          d.id === target.refId
            ? { ...d, sisa: d.sisa + target.nominal, status: 'aktif' }
            : d
        );
      }

      let pockets = prev.pockets;
      if (target.tipe === 'beli_aset' && target.kantongTujuanId) {
        pockets = prev.pockets.map((p) =>
          p.id === target.kantongTujuanId
            ? { ...p, totalModal: Math.max(0, p.totalModal - target.nominal) }
            : p
        );
      } else if (target.tipe === 'jual_aset' && target.kantongTujuanId && target.nilaiBuku) {
        pockets = prev.pockets.map((p) =>
          p.id === target.kantongTujuanId
            ? { ...p, totalModal: p.totalModal + (target.nilaiBuku || 0) }
            : p
        );
      }

      return {
        ...prev,
        isSampleData: false,
        debts,
        pockets,
        transactions: prev.transactions.filter((t) => t.id !== id),
      };
    });
    notify('Transaksi dihapus dan saldo telah disesuaikan.');
  };

  const handleResetPeriodTxns = (scope: 'period' | 'all') => {
    commitState((prev) => {
      const rng = getPeriodRange(selectedPeriod, prev.setup.cutoffDay);
      const removed = prev.transactions.filter((t) =>
        scope === 'all' ? true : t.tgl >= rng.mulai && t.tgl <= rng.selesai
      );
      const removedIds = new Set(removed.map((t) => t.id));

      let debts = [...prev.debts];
      let pockets = [...prev.pockets];

      removed.forEach((t) => {
        if (t.refId && t.porsi === 'pokok') {
          debts = debts.map((d) =>
            d.id === t.refId ? { ...d, sisa: d.sisa + t.nominal, status: 'aktif' } : d
          );
        }
        if (t.tipe === 'beli_aset' && t.kantongTujuanId) {
          pockets = pockets.map((p) =>
            p.id === t.kantongTujuanId
              ? { ...p, totalModal: Math.max(0, p.totalModal - t.nominal) }
              : p
          );
        } else if (t.tipe === 'jual_aset' && t.kantongTujuanId && t.nilaiBuku) {
          pockets = pockets.map((p) =>
            p.id === t.kantongTujuanId ? { ...p, totalModal: p.totalModal + (t.nilaiBuku || 0) } : p
          );
        }
      });

      return {
        ...prev,
        isSampleData: false,
        debts,
        pockets,
        transactions: prev.transactions.filter((t) => !removedIds.has(t.id)),
      };
    });
    notify('Jurnal periode berhasil direset dengan aman.');
  };

  const handleUpdateSetup = (patch: Partial<MoneyMapState['setup']>) => {
    commitState((prev) => {
      const nextSetup = { ...prev.setup, ...patch };
      if (patch.activePeriod) {
        setSelectedPeriod(patch.activePeriod);
      }
      return {
        ...prev,
        isSampleData: false,
        setup: nextSetup,
      };
    });
  };

  const handleUpdateAllocRows = (
    target: 'allocIncome' | 'allocPersonal',
    rows: AllocationRow[],
    renamedFromTo?: [string, string]
  ) => {
    commitState((prev) => {
      let transactions = prev.transactions;
      if (renamedFromTo) {
        const [oldName, newName] = renamedFromTo;
        transactions = prev.transactions.map((t) =>
          t.kat === oldName ? { ...t, kat: newName } : t
        );
      }
      return {
        ...prev,
        isSampleData: false,
        transactions,
        setup: {
          ...prev.setup,
          [target]: rows,
        },
      };
    });
  };

  const handleAdvanceNextMonth = () => {
    const nextPeriod = getNextPeriodKey(state.setup.activePeriod);
    commitState((prev) => ({
      ...prev,
      isSampleData: false,
      setup: {
        ...prev.setup,
        activePeriod: nextPeriod,
      },
    }));
    setSelectedPeriod(nextPeriod);
    notify(`Periode baru ${nextPeriod} siap digunakan.`);
  };

  const handleSaveReflection = (periodKey: string, note: ReflectionNote) => {
    commitState((prev) => ({
      ...prev,
      isSampleData: false,
      reflections: {
        ...prev.reflections,
        [periodKey]: note,
      },
    }));
  };

  const handleAddPocket = (pocket: Pocket) => {
    commitState((prev) => ({
      ...prev,
      isSampleData: false,
      pockets: [...prev.pockets, pocket],
    }));
    notify(`Kantong "${pocket.nama}" berhasil ditambahkan.`);
  };

  const handleUpdatePocketPrice = (id: string, price: number) => {
    const today = todayISO();
    commitState((prev) => ({
      ...prev,
      isSampleData: false,
      pockets: prev.pockets.map((p) =>
        p.id === id ? { ...p, hargaPerSatuan: price, hargaUpdatedAt: today } : p
      ),
    }));
    notify('Harga pasar aset diperbarui.');
  };

  const handleReconcilePocket = (id: string, actualBalance: number) => {
    commitState((prev) => {
      const p = prev.pockets.find((x) => x.id === id);
      if (!p) return prev;
      const sysBal = Math.round(computePocketBalance(p, prev.transactions, prev.setup.cutoffDay));
      const diff = actualBalance - sysBal;
      if (Math.abs(diff) < 1) return prev;
      return {
        ...prev,
        isSampleData: false,
        transactions: [
          ...prev.transactions,
          {
            id: `tx_rekon_${Date.now()}`,
            tgl: todayISO(),
            nominal: diff,
            ket: `Rekonsiliasi saldo ${p.nama}`,
            kat: 'Penyesuaian Saldo',
            tipe: 'penyesuaian',
            kantongId: id,
          },
        ],
      };
    });
    notify('Saldo kantong berhasil dicocokkan.');
  };

  const handleAddDebt = (debt: DebtItem, createCashTxn: boolean) => {
    commitState((prev) => {
      const nextTxns = [...prev.transactions];
      if (createCashTxn && debt.kantongId) {
        nextTxns.push({
          id: `tx_hp_${Date.now()}`,
          tgl: debt.tgl,
          nominal: debt.nominal,
          ket: `${debt.tipe === 'hutang' ? 'Pencairan pinjaman' : 'Pemberian piutang'}: ${debt.nama}`,
          kat: 'Cicilan & Kewajiban',
          tipe: debt.tipe === 'hutang' ? 'terima_hutang' : 'beri_piutang',
          kantongId: debt.kantongId,
          refType: debt.tipe,
          refId: debt.id,
        });
      }
      return {
        ...prev,
        isSampleData: false,
        debts: [...prev.debts, debt],
        transactions: nextTxns,
      };
    });
    notify('Catatan kontrak berhasil disimpan.');
  };

  const handlePayInstallment = (
    debtId: string,
    kantongId: string,
    tgl: string,
    totalNominal: number,
    bungaNominal: number
  ) => {
    commitState((prev) => {
      const target = prev.debts.find((d) => d.id === debtId);
      if (!target) return prev;
      const pokokRaw = Math.max(0, totalNominal - bungaNominal);
      const pokokEfektif = Math.min(target.sisa, pokokRaw);
      const sisaBaru = Math.max(0, target.sisa - pokokEfektif);

      const nextTxns = [...prev.transactions];
      if (pokokEfektif > 0) {
        nextTxns.push({
          id: `tx_pokok_${Date.now()}`,
          tgl,
          nominal: pokokEfektif,
          ket: `${target.tipe === 'hutang' ? 'Cicilan pokok' : 'Penerimaan pokok'} ${target.nama}`,
          kat: 'Cicilan & Kewajiban',
          tipe: target.tipe === 'hutang' ? 'bayar_hutang' : 'terima_piutang',
          kantongId,
          refType: target.tipe,
          refId: target.id,
          porsi: 'pokok',
        });
      }
      if (bungaNominal > 0) {
        nextTxns.push({
          id: `tx_bunga_${Date.now() + 1}`,
          tgl,
          nominal: bungaNominal,
          ket: `${target.tipe === 'hutang' ? 'Bunga cicilan' : 'Bagi hasil piutang'} ${target.nama}`,
          kat: target.tipe === 'hutang' ? 'Cicilan & Kewajiban' : 'Hasil Investasi',
          tipe: target.tipe === 'hutang' ? 'bayar_hutang' : 'pemasukan',
          kantongId,
          refType: target.tipe,
          refId: target.id,
          porsi: 'bunga',
        });
      }

      return {
        ...prev,
        isSampleData: false,
        transactions: nextTxns,
        debts: prev.debts.map((d) =>
          d.id === debtId
            ? {
                ...d,
                sisa: sisaBaru,
                status: sisaBaru <= 0 ? 'lunas' : 'aktif',
                riwayat: [
                  ...d.riwayat,
                  {
                    id: `inst_${Date.now()}`,
                    tgl,
                    nominal: totalNominal,
                    pokok: pokokEfektif,
                    bunga: bungaNominal,
                  },
                ],
              }
            : d
        ),
      };
    });
    notify('Pembayaran cicilan tercatat dan neraca diperbarui.');
  };

  const handleExportJSON = () => {
    const payload = {
      ...state,
      _exportedAt: new Date().toISOString(),
      _app: 'MoneyMap',
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `moneymap_backup_${state.setup.activePeriod}.json`;
    a.click();
    URL.revokeObjectURL(url);
    notify('File backup JSON berhasil diunduh.');
  };

  const handleImportJSON = (file: File) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ''));
        const clean = validateAndSanitizeState(parsed, createBlankState());
        persistStateDual(clean);
        setState(clean);
        setSelectedPeriod(clean.setup.activePeriod);
        setShowVaultModal(false);
        notify(`Backup berhasil dipulihkan (${clean.transactions.length} transaksi).`);
      } catch (err) {
        notify(err instanceof Error ? err.message : 'Gagal membaca file backup JSON.');
      }
    };
    reader.readAsText(file);
  };

  // Optional Soft-Neumorphic Lock Screen
  if (!unlocked && state.setup.passcode) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
          background: 'var(--bg-canvas)',
        }}
      >
        <div className="mm-card" style={{ maxWidth: 400, width: '100%', padding: 32, textAlign: 'center' }}>
          <div className="mm-orb" style={{ margin: '0 auto 16px' }}>
            <Lock size={20} color="#1C90C2" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 6 }}>MoneyMap Terkunci</h1>
          <p className="mm-card-sub" style={{ marginBottom: 20 }}>
            Masukkan kode akses lokal untuk membuka workspace {state.setup.nama}.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (unlockInput === state.setup.passcode) {
                setUnlocked(true);
                setUnlockErr(false);
              } else {
                setUnlockErr(true);
                setUnlockInput('');
              }
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
          >
            <input
              type="password"
              className="mm-input"
              style={{ textAlign: 'center' }}
              placeholder="Masukkan kode akses..."
              value={unlockInput}
              onChange={(e) => setUnlockInput(e.target.value)}
              autoFocus
            />
            {unlockErr && (
              <span className="mm-status-pill err" style={{ alignSelf: 'center' }}>
                Kode akses tidak sesuai
              </span>
            )}
            <button type="submit" className="mm-pill-btn primary" style={{ justifyContent: 'center' }}>
              Buka Workspace
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="mm-shell">
      {/* TOP NAVIGATION BAR matching SAAS Business Admin Dashboard.fig */}
      <header className="mm-topbar">
        <button
          type="button"
          className="mm-brand"
          onClick={() => setActiveTab('dashboard')}
        >
          <span className="mm-orb" aria-hidden="true">
            <svg width="25" height="25" viewBox="0 0 64 64" fill="none">
              <circle
                cx="32"
                cy="32"
                r="23"
                stroke="#1C90C2"
                strokeWidth="6"
                strokeDasharray="108 36"
                strokeLinecap="round"
              />
              <path
                d="M20 37L28 28L35 34L44 23"
                stroke="#1A4673"
                strokeWidth="5.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <circle cx="44" cy="23" r="4.5" fill="#5BD9EF" />
            </svg>
          </span>
          <span className="mm-brand-title">
            <span>MoneyMap</span>
            <span className="mm-brand-sub">Cashflow &amp; Wealth OS</span>
          </span>
        </button>

        {/* Center Floating Soft-Neumorphic Pill Tabs */}
        <nav className="mm-nav-pills" aria-label="Navigasi utama">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`mm-nav-pill ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="mm-nav-icon-wrap">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        {/* Right 3 Circular Soft-Neumorphic Utility Orbs */}
        <div className="mm-topbar-actions">
          <button
            type="button"
            className="mm-orb"
            title="Pencarian cepat (⌘K)"
            aria-label="Pencarian cepat"
            onClick={() => setShowSearchModal(true)}
          >
            <Search size={19} strokeWidth={2.1} />
          </button>

          <button
            type="button"
            className="mm-orb"
            title="Radar & pengingat"
            aria-label="Pengingat keuangan"
            onClick={() => setShowAlertsModal(true)}
          >
            <Bell size={19} strokeWidth={2.1} />
            {hasActionableAlert && <span className="mm-notif-dot" />}
          </button>

          <button
            type="button"
            className="mm-orb"
            title="Data Vault, Backup & Pengaturan"
            aria-label="Data Vault dan Pengaturan"
            onClick={() => setShowVaultModal(true)}
          >
            <Settings size={19} strokeWidth={2.1} />
          </button>
        </div>
      </header>

      {/* MAIN VIEWPORT */}
      <main>
        {activeTab === 'dashboard' && (
          <OverviewView
            state={state}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
            onNavigate={setActiveTab}
            onOpenNewTxn={() => setShowNewTxnModal(true)}
            onExportQuickPDF={async () => {
              const { exportFinancialReportPDF } = await import('./lib/pdfExport');
              exportFinancialReportPDF(state, {
                periodKey: selectedPeriod,
                includeNeraca: true,
                includeArusKas: true,
                includeLabaRugi: true,
                includeDebts: true,
                includeTransactions: false,
              });
              notify('Laporan PDF berhasil diunduh.');
            }}
            onDeleteTxn={handleDeleteTxn}
            onClearSampleData={() => {
              const blank = createBlankState(state.setup.nama === 'Nadia Kusuma' ? 'Pemilik Workspace' : state.setup.nama);
              persistStateDual(blank);
              setState(blank);
              setSelectedPeriod(blank.setup.activePeriod);
              notify('Workspace dikosongkan ke Rp0. Siap mencatat data pribadimu!');
            }}
          />
        )}

        {activeTab === 'transactions' && (
          <TransactionsView
            state={state}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
            onOpenNewTxn={() => setShowNewTxnModal(true)}
            onDeleteTxn={handleDeleteTxn}
            onUpdateTxnReason={(id, kenapa) => {
              commitState((prev) => ({
                ...prev,
                isSampleData: false,
                transactions: prev.transactions.map((t) => (t.id === id ? { ...t, kenapa } : t)),
              }));
            }}
            onResetPeriodTxns={handleResetPeriodTxns}
          />
        )}

        {activeTab === 'budget' && (
          <BudgetView
            state={state}
            onUpdateSetup={handleUpdateSetup}
            onUpdateAllocRows={handleUpdateAllocRows}
            onAdvanceNextMonth={handleAdvanceNextMonth}
            onSaveReflection={handleSaveReflection}
          />
        )}

        {activeTab === 'wealth' && (
          <WealthView
            state={state}
            onAddPocket={handleAddPocket}
            onUpdatePocketPrice={handleUpdatePocketPrice}
            onToggleArchivePocket={(id, arsip) => {
              commitState((prev) => ({
                ...prev,
                isSampleData: false,
                pockets: prev.pockets.map((p) => (p.id === id ? { ...p, arsip } : p)),
              }));
              notify(arsip ? 'Kantong diarsipkan.' : 'Kantong diaktifkan kembali.');
            }}
            onDeleteUnusedPocket={(id) => {
              commitState((prev) => ({
                ...prev,
                isSampleData: false,
                pockets: prev.pockets.filter((p) => p.id !== id),
              }));
              notify('Kantong kosong dihapus.');
            }}
            onReconcilePocket={handleReconcilePocket}
            onAddDebt={handleAddDebt}
            onPayDebtInstallment={handlePayInstallment}
            onDeleteDebt={(id) => {
              commitState((prev) => ({
                ...prev,
                isSampleData: false,
                debts: prev.debts.filter((d) => d.id !== id),
                transactions: prev.transactions.filter((t) => t.refId !== id),
              }));
              notify('Kontrak dihapus beserta mutasi terkait.');
            }}
          />
        )}

        {activeTab === 'reports' && (
          <ReportsView
            state={state}
            selectedPeriod={selectedPeriod}
            onSelectPeriod={setSelectedPeriod}
          />
        )}
      </main>

      {/* MOBILE FLOATING NAVIGATION BAR */}
      <nav className="mm-mobile-bar" aria-label="Navigasi seluler">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`mm-mobile-tab ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            {item.icon}
            <span>{item.shortLabel}</span>
          </button>
        ))}
      </nav>

      {/* MODALS */}
      {showNewTxnModal && (
        <TransactionModal
          state={state}
          onClose={() => setShowNewTxnModal(false)}
          onSaveTxn={handleSaveTxn}
        />
      )}

      {showSearchModal && (
        <QuickSearchModal
          state={state}
          onClose={() => setShowSearchModal(false)}
          onNavigate={setActiveTab}
        />
      )}

      {showAlertsModal && (
        <AlertsModal
          alerts={alerts}
          onClose={() => setShowAlertsModal(false)}
          onNavigate={setActiveTab}
        />
      )}

      {showVaultModal && (
        <VaultSettingsModal
          state={state}
          onClose={() => setShowVaultModal(false)}
          onExportJSON={handleExportJSON}
          onImportJSON={handleImportJSON}
          onLoadSampleData={() => {
            const sample = createSampleState();
            persistStateDual(sample);
            setState(sample);
            setSelectedPeriod(sample.setup.activePeriod);
            notify('Data contoh berhasil dimuat ulang.');
          }}
          onResetBlankData={() => {
            const blank = createBlankState();
            persistStateDual(blank);
            setState(blank);
            setSelectedPeriod(blank.setup.activePeriod);
            notify('Workspace direset ke kosong (Rp0).');
          }}
          onUpdatePasscode={(code) => {
            handleUpdateSetup({ passcode: code });
            notify(code ? 'Kunci layar lokal diaktifkan.' : 'Kunci layar lokal dinonaktifkan.');
          }}
        />
      )}

      {toastMsg && <div className="mm-toast">{toastMsg}</div>}
    </div>
  );
};

export default App;

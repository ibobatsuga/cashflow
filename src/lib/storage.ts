import type {
  AllocationRow,
  DebtItem,
  MoneyMapState,
  Pocket,
  Transaction,
} from '../types';

const LS_KEY = 'moneymap_state_v1';
const IDB_NAME = 'moneymap_db';
const IDB_STORE = 'kv';

let idbPromise: Promise<IDBDatabase | null> | null = null;

function openDatabase(): Promise<IDBDatabase | null> {
  if (idbPromise) return idbPromise;
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.resolve(null);
  }
  idbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = (ev) => {
        const db = (ev.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return idbPromise;
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDatabase();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet<T>(key: string, value: T): Promise<void> {
  const db = await openDatabase();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

function cleanString(v: unknown, fallback = '', maxLen = 500): string {
  if (typeof v !== 'string') return fallback;
  return v.slice(0, maxLen);
}

function cleanNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function sanitizeAllocRow(raw: unknown, idx: number): AllocationRow | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = cleanString(r.name, `Kategori ${idx + 1}`, 80).trim();
  if (!name) return null;
  return {
    id: cleanString(r.id, `alloc_${idx}_${Date.now()}`, 64),
    name,
    pct: Math.max(0, Math.min(10, cleanNumber(r.pct, 0))),
    amt: Math.max(0, cleanNumber(r.amt, 0)),
    mode: r.mode === 'amt' ? 'amt' : 'pct',
    locked: Boolean(r.locked),
  };
}

export function validateAndSanitizeState(raw: unknown, fallback: MoneyMapState): MoneyMapState {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Format file backup tidak valid (bukan objek JSON).');
  }
  const obj = raw as Record<string, unknown>;
  if (!obj.setup || typeof obj.setup !== 'object' || !Array.isArray(obj.pockets) || !Array.isArray(obj.transactions)) {
    throw new Error('Struktur data MoneyMap tidak lengkap (setup, pockets, atau transactions hilang).');
  }

  const s = obj.setup as Record<string, unknown>;
  const cutoffRaw = Math.round(cleanNumber(s.cutoffDay, 1));
  const cutoffDay = Math.max(1, Math.min(28, cutoffRaw));
  const periodRaw = cleanString(s.activePeriod, fallback.setup.activePeriod, 7);
  const activePeriod = /^\d{4}-\d{2}$/.test(periodRaw) ? periodRaw : fallback.setup.activePeriod;

  const allocIncome = Array.isArray(s.allocIncome)
    ? (s.allocIncome.map(sanitizeAllocRow).filter(Boolean) as AllocationRow[])
    : fallback.setup.allocIncome;
  const allocPersonal = Array.isArray(s.allocPersonal)
    ? (s.allocPersonal.map(sanitizeAllocRow).filter(Boolean) as AllocationRow[])
    : fallback.setup.allocPersonal;

  const validUnits = new Set(['rp', 'gram', 'lot', 'lembar', 'valas', 'custom']);
  const validKinds = new Set(['rekening', 'ewallet', 'tabungan', 'darurat', 'investasi', 'lainnya']);

  const pockets: Pocket[] = obj.pockets
    .filter((p): p is Record<string, unknown> => Boolean(p && typeof p === 'object'))
    .map((p, i) => {
      const satuan = validUnits.has(String(p.satuan)) ? (p.satuan as Pocket['satuan']) : 'rp';
      const jenis = validKinds.has(String(p.jenis)) ? (p.jenis as Pocket['jenis']) : 'rekening';
      const rawSA = p.saldoAwal && typeof p.saldoAwal === 'object' ? (p.saldoAwal as Record<string, unknown>) : {};
      const saldoAwal: Record<string, number> = {};
      Object.keys(rawSA).forEach((k) => {
        if (/^\d{4}-\d{2}(-\d{2})?$/.test(k)) {
          saldoAwal[k.length === 7 ? `${k}-01` : k] = cleanNumber(rawSA[k], 0);
        }
      });
      return {
        id: cleanString(p.id, `p_${i}_${Date.now()}`, 64),
        nama: cleanString(p.nama, `Kantong ${i + 1}`, 80),
        jenis,
        satuan,
        satuanCustom: cleanString(p.satuanCustom, '', 24),
        hargaPerSatuan: Math.max(0, cleanNumber(p.hargaPerSatuan, 0)),
        hargaUpdatedAt: p.hargaUpdatedAt ? cleanString(p.hargaUpdatedAt, '', 16) : null,
        catatan: cleanString(p.catatan, '', 200),
        isKas: typeof p.isKas === 'boolean' ? p.isKas : satuan === 'rp',
        arsip: Boolean(p.arsip),
        desimal: Math.max(0, Math.min(8, Math.round(cleanNumber(p.desimal, satuan === 'rp' ? 0 : 3)))),
        totalModal: Math.max(0, cleanNumber(p.totalModal, 0)),
        saldoAwal,
      };
    });

  const validTxnTypes = new Set([
    'pengeluaran',
    'pemasukan',
    'transfer',
    'beli_aset',
    'jual_aset',
    'terima_hutang',
    'bayar_hutang',
    'beri_piutang',
    'terima_piutang',
    'penyesuaian',
  ]);

  const transactions: Transaction[] = obj.transactions
    .filter((t): t is Record<string, unknown> => Boolean(t && typeof t === 'object'))
    .map((t, i) => {
      const tipe = validTxnTypes.has(String(t.tipe)) ? (t.tipe as Transaction['tipe']) : 'pengeluaran';
      const tglRaw = cleanString(t.tgl, '', 10);
      const tgl = /^\d{4}-\d{2}-\d{2}$/.test(tglRaw) ? tglRaw : `${activePeriod}-01`;
      return {
        id: cleanString(t.id, `tx_${i}_${Date.now()}`, 64),
        tgl,
        nominal: tipe === 'penyesuaian' ? cleanNumber(t.nominal, 0) : Math.abs(cleanNumber(t.nominal, 0)),
        ket: cleanString(t.ket, '', 200),
        kat: cleanString(t.kat, '', 80),
        mood: cleanString(t.mood, '', 50) as Transaction['mood'],
        jenis: cleanString(t.jenis, '', 50) as Transaction['jenis'],
        kenapa: cleanString(t.kenapa, '', 240),
        tipe,
        kantongId: cleanString(t.kantongId, pockets[0]?.id ?? 'default_kas', 64),
        kantongTujuanId: t.kantongTujuanId ? cleanString(t.kantongTujuanId, '', 64) : null,
        refType: t.refType === 'hutang' || t.refType === 'piutang' ? t.refType : null,
        refId: t.refId ? cleanString(t.refId, '', 64) : null,
        porsi: t.porsi === 'pokok' || t.porsi === 'bunga' ? t.porsi : null,
        unit: t.unit !== null && t.unit !== undefined ? cleanNumber(t.unit, 0) : null,
        hargaSatuan: t.hargaSatuan !== null && t.hargaSatuan !== undefined ? cleanNumber(t.hargaSatuan, 0) : null,
        nilaiBuku: t.nilaiBuku !== null && t.nilaiBuku !== undefined ? cleanNumber(t.nilaiBuku, 0) : null,
        untungRugi: t.untungRugi !== null && t.untungRugi !== undefined ? cleanNumber(t.untungRugi, 0) : null,
        refKantongId: t.refKantongId ? cleanString(t.refKantongId, '', 64) : null,
      };
    });

  const debts: DebtItem[] = Array.isArray(obj.debts)
    ? obj.debts
        .filter((d): d is Record<string, unknown> => Boolean(d && typeof d === 'object'))
        .map((d, i) => ({
          id: cleanString(d.id, `hp_${i}_${Date.now()}`, 64),
          tipe: d.tipe === 'piutang' ? 'piutang' : 'hutang',
          nama: cleanString(d.nama, `Kontrak ${i + 1}`, 100),
          nominal: Math.max(0, cleanNumber(d.nominal, 0)),
          sisa: Math.max(0, cleanNumber(d.sisa, 0)),
          tgl: /^\d{4}-\d{2}-\d{2}$/.test(cleanString(d.tgl, '', 10))
            ? cleanString(d.tgl, '', 10)
            : `${activePeriod}-01`,
          jatuhTempo: d.jatuhTempo ? cleanString(d.jatuhTempo, '', 10) : undefined,
          catatan: cleanString(d.catatan, '', 200),
          status: d.status === 'lunas' || cleanNumber(d.sisa, 0) <= 0 ? 'lunas' : 'aktif',
          cair: typeof d.cair === 'boolean' ? d.cair : true,
          kantongId: d.kantongId ? cleanString(d.kantongId, '', 64) : null,
          riwayat: Array.isArray(d.riwayat)
            ? d.riwayat
                .filter((r): r is Record<string, unknown> => Boolean(r && typeof r === 'object'))
                .map((r, ri) => ({
                  id: cleanString(r.id, `ri_${ri}`, 64),
                  tgl: cleanString(r.tgl, `${activePeriod}-01`, 10),
                  nominal: Math.max(0, cleanNumber(r.nominal, 0)),
                  pokok: Math.max(0, cleanNumber(r.pokok, 0)),
                  bunga: Math.max(0, cleanNumber(r.bunga, 0)),
                }))
            : [],
        }))
    : [];

  return {
    version: 1,
    isSampleData: Boolean(obj.isSampleData),
    setup: {
      nama: cleanString(s.nama, 'Sahabat MoneyMap', 60),
      workspaceLabel: cleanString(s.workspaceLabel, 'Personal & Family Cashflow', 80),
      activePeriod,
      cutoffDay,
      penghasilanRencana: Math.max(0, cleanNumber(s.penghasilanRencana, 0)),
      budgetPribadi: Math.max(0, cleanNumber(s.budgetPribadi, 0)),
      allocIncome: allocIncome.length ? allocIncome : fallback.setup.allocIncome,
      allocPersonal: allocPersonal.length ? allocPersonal : fallback.setup.allocPersonal,
      passcode: s.passcode ? cleanString(s.passcode, '', 32) : null,
    },
    pockets: pockets.length ? pockets : fallback.pockets,
    transactions,
    debts,
    monthSnapshots:
      obj.monthSnapshots && typeof obj.monthSnapshots === 'object'
        ? (obj.monthSnapshots as MoneyMapState['monthSnapshots'])
        : {},
    reflections:
      obj.reflections && typeof obj.reflections === 'object'
        ? (obj.reflections as MoneyMapState['reflections'])
        : {},
  };
}

export function loadInitialStateSync(defaultFactory: () => MoneyMapState): MoneyMapState {
  if (typeof window === 'undefined') return defaultFactory();
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return defaultFactory();
    const parsed = JSON.parse(raw);
    return validateAndSanitizeState(parsed, defaultFactory());
  } catch {
    return defaultFactory();
  }
}

export async function hydrateFromIndexedDB(defaultFactory: () => MoneyMapState): Promise<MoneyMapState | null> {
  try {
    const idbVal = await idbGet<unknown>(LS_KEY);
    if (!idbVal) return null;
    return validateAndSanitizeState(idbVal, defaultFactory());
  } catch {
    return null;
  }
}

export function persistStateDual(state: MoneyMapState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors on localStorage; IndexedDB still persists
  }
  void idbSet(LS_KEY, state);
}

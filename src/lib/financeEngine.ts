import type {
  AllocationRow,
  DebtItem,
  MoneyMapState,
  Pocket,
  PocketUnit,
  Transaction,
} from '../types';

export const MONTHS_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export const MONTHS_SHORT_ID = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

export const DEFAULT_DECIMALS: Record<PocketUnit, number> = {
  rp: 0,
  lot: 0,
  lembar: 0,
  gram: 3,
  valas: 2,
  custom: 4,
};

export function fmtRp(value: number): string {
  const rounded = Math.round(Math.abs(value || 0));
  return 'Rp' + rounded.toLocaleString('id-ID');
}

export function fmtSignedRp(value: number): string {
  const rounded = Math.round(value || 0);
  if (rounded === 0) return 'Rp0';
  return rounded > 0 ? `+${fmtRp(rounded)}` : `−${fmtRp(Math.abs(rounded))}`;
}

export function fmtCompactRp(value: number): string {
  const abs = Math.abs(value || 0);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) {
    return `${sign}Rp${(abs / 1_000_000_000).toLocaleString('id-ID', { maximumFractionDigits: 2 })} M`;
  }
  if (abs >= 1_000_000) {
    return `${sign}Rp${(abs / 1_000_000).toLocaleString('id-ID', { maximumFractionDigits: 1 })} jt`;
  }
  if (abs >= 1_000) {
    return `${sign}Rp${Math.round(abs / 1_000).toLocaleString('id-ID')} rb`;
  }
  return `${sign}${fmtRp(abs)}`;
}

export function getPocketUnitLabel(p: Pocket): string {
  if (p.satuan === 'rp') return 'Rp';
  if (p.satuan === 'valas') return p.satuanCustom || 'USD';
  if (p.satuan === 'custom') return p.satuanCustom || 'unit';
  return p.satuan;
}

export function fmtUnit(value: number, p: Pocket): string {
  if (p.satuan === 'rp') return fmtRp(value);
  const dec = p.desimal ?? DEFAULT_DECIMALS[p.satuan] ?? 2;
  return `${(value || 0).toLocaleString('id-ID', {
    minimumFractionDigits: 0,
    maximumFractionDigits: dec,
  })} ${getPocketUnitLabel(p)}`;
}

export function parseNumericInput(raw: string, allowDecimals = false): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[^0-9.,-]/g, '').trim();
  if (!cleaned) return 0;
  const neg = cleaned.startsWith('-');
  const unsigned = cleaned.replace(/-/g, '');
  if (!allowDecimals) {
    const digits = unsigned.replace(/\D/g, '');
    const v = Number(digits || '0');
    return neg ? -v : v;
  }
  // Indonesian style: '.' thousands, ',' decimal OR single '.' decimal
  const lastComma = unsigned.lastIndexOf(',');
  const lastDot = unsigned.lastIndexOf('.');
  const lastSep = Math.max(lastComma, lastDot);
  if (lastSep < 0) {
    const v = Number(unsigned);
    return neg ? -v : v;
  }
  const sepChar = unsigned[lastSep];
  const head = unsigned.slice(0, lastSep).replace(/[.,]/g, '');
  const tail = unsigned.slice(lastSep + 1).replace(/[.,]/g, '');
  const isThousands = sepChar === '.' && tail.length === 3 && !unsigned.slice(0, lastSep).includes(',');
  const numStr = isThousands ? `${head}${tail}` : `${head || '0'}.${tail}`;
  const v = Number(numStr) || 0;
  return neg ? -v : v;
}

export function formatInputThousands(raw: string): string {
  const digits = raw.replace(/\D/g, '').replace(/^0+(?=\d)/, '');
  if (!digits) return '';
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function todayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parsePeriod(periodKey: string): { year: number; month: number } {
  const [yStr, mStr] = (periodKey || '2026-11').split('-');
  const year = Number(yStr) || 2026;
  const month = Math.max(0, Math.min(11, (Number(mStr) || 11) - 1));
  return { year, month };
}

export function toPeriodKey(year: number, monthZeroIndexed: number): string {
  return `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}`;
}

export function getPrevPeriodKey(periodKey: string): string {
  const { year, month } = parsePeriod(periodKey);
  if (month === 0) return toPeriodKey(year - 1, 11);
  return toPeriodKey(year, month - 1);
}

export function getNextPeriodKey(periodKey: string): string {
  const { year, month } = parsePeriod(periodKey);
  if (month === 11) return toPeriodKey(year + 1, 0);
  return toPeriodKey(year, month + 1);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function getPeriodRange(periodKey: string, cutoffDay: number): { mulai: string; selesai: string } {
  const { year, month } = parsePeriod(periodKey);
  const c = Math.max(1, Math.min(28, cutoffDay || 1));
  if (c === 1) {
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
      mulai: `${year}-${pad2(month + 1)}-01`,
      selesai: `${year}-${pad2(month + 1)}-${pad2(lastDay)}`,
    };
  }
  const nextYear = month === 11 ? year + 1 : year;
  const nextMonth = month === 11 ? 0 : month + 1;
  const endDt = new Date(nextYear, nextMonth, c);
  endDt.setDate(endDt.getDate() - 1);
  return {
    mulai: `${year}-${pad2(month + 1)}-${pad2(c)}`,
    selesai: `${endDt.getFullYear()}-${pad2(endDt.getMonth() + 1)}-${pad2(endDt.getDate())}`,
  };
}

export function getPeriodOfDate(tglISO: string, cutoffDay: number): string {
  const parts = (tglISO || '').split('-');
  const y = Number(parts[0]);
  const m = Number(parts[1]) - 1;
  const d = Number(parts[2]);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return '2026-11';
  const c = Math.max(1, Math.min(28, cutoffDay || 1));
  if (c === 1 || d >= c) return toPeriodKey(y, m);
  return m === 0 ? toPeriodKey(y - 1, 11) : toPeriodKey(y, m - 1);
}

export function formatShortDate(tglISO: string): string {
  const parts = (tglISO || '').split('-');
  if (parts.length < 3) return tglISO;
  const m = Math.max(0, Math.min(11, Number(parts[1]) - 1));
  return `${Number(parts[2])} ${MONTHS_SHORT_ID[m]}`;
}

export function formatPeriodLabel(periodKey: string, cutoffDay: number, includeRange = false): string {
  const { year, month } = parsePeriod(periodKey);
  const base = `${MONTHS_ID[month]} ${year}`;
  if (!includeRange || cutoffDay === 1) return base;
  const r = getPeriodRange(periodKey, cutoffDay);
  return `${base} (${formatShortDate(r.mulai)} – ${formatShortDate(r.selesai)})`;
}

export function dayBefore(tglISO: string): string {
  const dt = new Date(`${tglISO}T00:00:00`);
  dt.setDate(dt.getDate() - 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

export function listAvailablePeriods(state: MoneyMapState): string[] {
  const set = new Set<string>();
  set.add(state.setup.activePeriod);
  set.add(getPrevPeriodKey(state.setup.activePeriod));
  state.transactions.forEach((t) => {
    set.add(getPeriodOfDate(t.tgl, state.setup.cutoffDay));
  });
  Object.keys(state.monthSnapshots).forEach((k) => {
    if (/^\d{4}-\d{2}$/.test(k)) set.add(k);
  });
  return Array.from(set).sort((a, b) => b.localeCompare(a));
}

// ===== OPERATIONAL CLASSIFICATION =====
export function isOperationalIncome(t: Transaction): boolean {
  return t.tipe === 'pemasukan';
}

export function isOperationalExpense(t: Transaction): boolean {
  if (t.tipe === 'pengeluaran') return true;
  if (t.tipe === 'bayar_hutang' && t.porsi === 'bunga') return true;
  return false;
}

// ===== ALLOCATION ENGINE =====
export interface ComputedAllocRow {
  row: AllocationRow;
  nominal: number;
  effectivePct: number; // 0..1
}

export function computeAllocations(rows: AllocationRow[], base: number): ComputedAllocRow[] {
  const safeBase = Math.max(0, base || 0);
  const lockedAmtTotal = rows.reduce(
    (acc, r) => acc + (r.mode === 'amt' ? Math.max(0, r.amt || 0) : 0),
    0
  );
  const remainingBase = Math.max(0, safeBase - lockedAmtTotal);

  return rows.map((row) => {
    if (row.mode === 'amt') {
      const nom = Math.max(0, row.amt || 0);
      return {
        row,
        nominal: Math.round(nom),
        effectivePct: safeBase > 0 ? nom / safeBase : 0,
      };
    }
    const pct = Math.max(0, row.pct || 0);
    const nom = Math.round(remainingBase * pct);
    return {
      row,
      nominal: nom,
      effectivePct: safeBase > 0 ? nom / safeBase : pct,
    };
  });
}

// ===== POCKET BALANCE & COST BASIS ENGINE =====
function getOpeningBoundary(pocket: Pocket, cutoffDay: number): { effectiveStart: string; amount: number } | null {
  const keys = Object.keys(pocket.saldoAwal || {}).sort();
  if (!keys.length) return null;
  const firstKey = keys[0];
  const rawDate = firstKey.length === 7 ? `${firstKey}-01` : firstKey;
  const per = getPeriodOfDate(rawDate, cutoffDay);
  const perStart = getPeriodRange(per, cutoffDay).mulai;
  const effectiveStart = perStart < rawDate ? perStart : rawDate;
  return {
    effectiveStart,
    amount: pocket.saldoAwal[firstKey] || 0,
  };
}

export function computePocketBalance(
  pocket: Pocket,
  transactions: Transaction[],
  cutoffDay: number,
  upToDate?: string
): number {
  const bound = getOpeningBoundary(pocket, cutoffDay);
  let balance = bound ? bound.amount : 0;
  const minDate = bound ? bound.effectiveStart : '0000-01-01';

  for (const t of transactions) {
    if (t.tgl < minDate) continue;
    if (upToDate && t.tgl > upToDate) continue;

    const nom = t.nominal || 0;
    const unitDelta = t.unit !== null && t.unit !== undefined ? t.unit : nom;

    switch (t.tipe) {
      case 'pemasukan':
      case 'terima_hutang':
      case 'terima_piutang':
        if (t.kantongId === pocket.id) balance += nom;
        break;
      case 'pengeluaran':
      case 'bayar_hutang':
      case 'beri_piutang':
        if (t.kantongId === pocket.id) balance -= nom;
        break;
      case 'transfer':
      case 'beli_aset':
        if (t.kantongId === pocket.id) balance -= nom;
        if (t.kantongTujuanId === pocket.id) balance += unitDelta;
        break;
      case 'jual_aset':
        if (t.kantongId === pocket.id) balance += nom;
        if (t.kantongTujuanId === pocket.id) balance -= unitDelta;
        break;
      case 'penyesuaian':
        if (t.kantongId === pocket.id) balance += nom;
        break;
    }
  }
  return Math.abs(balance) < 1e-8 ? 0 : balance;
}

export function computePocketRupiah(
  pocket: Pocket,
  transactions: Transaction[],
  cutoffDay: number,
  upToDate?: string
): number | null {
  const bal = computePocketBalance(pocket, transactions, cutoffDay, upToDate);
  if (pocket.satuan === 'rp') return Math.round(bal);
  if (!pocket.hargaPerSatuan || pocket.hargaPerSatuan <= 0) return null;
  return Math.round(bal * pocket.hargaPerSatuan);
}

export function computeAverageBookPrice(
  pocket: Pocket,
  transactions: Transaction[],
  cutoffDay: number
): number {
  const units = computePocketBalance(pocket, transactions, cutoffDay);
  if (units <= 1e-8) return 0;
  return (pocket.totalModal || 0) / units;
}

// Historical remaining debt/receivable at `upToDate` reconstructed backward
export function computeDebtRemainingAt(
  debt: DebtItem,
  transactions: Transaction[],
  upToDate?: string
): number {
  if (!upToDate) return Math.max(0, debt.sisa || 0);
  if (debt.tgl > upToDate) return 0;
  let paidAfter = 0;
  for (const t of transactions) {
    if (t.refId === debt.id && t.porsi === 'pokok' && t.tgl > upToDate) {
      paidAfter += t.nominal || 0;
    }
  }
  const reconstructed = (debt.sisa || 0) + paidAfter;
  return Math.max(0, Math.min(debt.nominal || reconstructed, reconstructed));
}

// ===== 3-STATEMENT FINANCIAL ENGINE =====
export interface BalanceSheetSummary {
  kasItems: Array<{ pocket: Pocket; unit: number; rp: number }>;
  investasiItems: Array<{ pocket: Pocket; unit: number; rp: number | null; modal: number }>;
  piutangItems: Array<{ debt: DebtItem; sisa: number }>;
  hutangItems: Array<{ debt: DebtItem; sisa: number }>;
  totalKas: number;
  totalDarurat: number;
  totalInvestasi: number;
  totalPiutang: number;
  totalAset: number;
  totalHutang: number;
  kekayaanBersih: number;
  hasUnpricedAsset: boolean;
}

export function computeBalanceSheet(state: MoneyMapState, upToDate?: string): BalanceSheetSummary {
  const activePockets = state.pockets.filter((p) => !p.arsip);
  const kasItems: BalanceSheetSummary['kasItems'] = [];
  const investasiItems: BalanceSheetSummary['investasiItems'] = [];
  let totalKas = 0;
  let totalDarurat = 0;
  let totalInvestasi = 0;
  let hasUnpricedAsset = false;

  for (const p of activePockets) {
    const unit = computePocketBalance(p, state.transactions, state.setup.cutoffDay, upToDate);
    const rp = computePocketRupiah(p, state.transactions, state.setup.cutoffDay, upToDate);
    if (p.satuan === 'rp' && p.isKas) {
      const val = rp ?? 0;
      kasItems.push({ pocket: p, unit, rp: val });
      totalKas += val;
      if (p.jenis === 'darurat') totalDarurat += val;
    } else {
      investasiItems.push({ pocket: p, unit, rp, modal: p.totalModal || 0 });
      if (rp === null) hasUnpricedAsset = true;
      else {
        totalInvestasi += rp;
        if (p.jenis === 'darurat') totalDarurat += rp;
      }
    }
  }

  const piutangItems: BalanceSheetSummary['piutangItems'] = [];
  const hutangItems: BalanceSheetSummary['hutangItems'] = [];
  let totalPiutang = 0;
  let totalHutang = 0;

  for (const d of state.debts) {
    if (!d.cair) continue;
    const sisa = computeDebtRemainingAt(d, state.transactions, upToDate);
    if (sisa <= 0) continue;
    if (d.tipe === 'piutang') {
      piutangItems.push({ debt: d, sisa });
      totalPiutang += sisa;
    } else {
      hutangItems.push({ debt: d, sisa });
      totalHutang += sisa;
    }
  }

  const totalAset = totalKas + totalInvestasi + totalPiutang;
  return {
    kasItems,
    investasiItems,
    piutangItems,
    hutangItems,
    totalKas,
    totalDarurat,
    totalInvestasi,
    totalPiutang,
    totalAset,
    totalHutang,
    kekayaanBersih: totalAset - totalHutang,
    hasUnpricedAsset,
  };
}

export interface CashFlowRow {
  pocket: Pocket;
  awal: number;
  masuk: number;
  keluar: number;
  akhir: number;
}

export function computeCashFlowStatement(
  state: MoneyMapState,
  range: { mulai: string; selesai: string }
): CashFlowRow[] {
  const prevDate = dayBefore(range.mulai);
  const periodTxns = state.transactions.filter((t) => t.tgl >= range.mulai && t.tgl <= range.selesai);
  const cashPockets = state.pockets.filter((p) => !p.arsip && p.satuan === 'rp' && p.isKas);

  return cashPockets.map((p) => {
    const awal = Math.round(computePocketBalance(p, state.transactions, state.setup.cutoffDay, prevDate));
    let masuk = 0;
    let keluar = 0;
    for (const t of periodTxns) {
      const n = t.nominal || 0;
      switch (t.tipe) {
        case 'pemasukan':
        case 'terima_hutang':
        case 'terima_piutang':
          if (t.kantongId === p.id) masuk += n;
          break;
        case 'pengeluaran':
        case 'bayar_hutang':
        case 'beri_piutang':
          if (t.kantongId === p.id) keluar += n;
          break;
        case 'transfer':
        case 'beli_aset':
          if (t.kantongId === p.id) keluar += n;
          if (t.kantongTujuanId === p.id) masuk += n;
          break;
        case 'jual_aset':
          if (t.kantongId === p.id) masuk += n;
          break;
        case 'penyesuaian':
          if (t.kantongId === p.id) {
            if (n >= 0) masuk += n;
            else keluar += Math.abs(n);
          }
          break;
      }
    }
    return {
      pocket: p,
      awal,
      masuk: Math.round(masuk),
      keluar: Math.round(keluar),
      akhir: Math.round(awal + masuk - keluar),
    };
  });
}

export interface IncomeStatementSummary {
  masuk: number;
  keluarOperasional: number;
  bungaHutang: number;
  untungRealisasiAset: number;
  perKategori: Record<string, number>;
  surplusBersih: number;
  savingsRatePct: number;
}

export function computeIncomeStatement(
  state: MoneyMapState,
  range: { mulai: string; selesai: string }
): IncomeStatementSummary {
  const periodTxns = state.transactions.filter((t) => t.tgl >= range.mulai && t.tgl <= range.selesai);
  let masuk = 0;
  let keluarOperasional = 0;
  let bungaHutang = 0;
  let untungRealisasiAset = 0;
  const perKategori: Record<string, number> = {};

  for (const t of periodTxns) {
    const n = t.nominal || 0;
    if (isOperationalIncome(t)) {
      masuk += n;
    } else if (isOperationalExpense(t)) {
      if (t.porsi === 'bunga') {
        bungaHutang += n;
      } else {
        keluarOperasional += n;
        const cat = t.kat || 'Lainnya';
        perKategori[cat] = (perKategori[cat] || 0) + n;
      }
    }
    if (t.tipe === 'jual_aset') {
      untungRealisasiAset += t.untungRugi || 0;
    }
  }

  const surplusBersih = Math.round(masuk - keluarOperasional - bungaHutang + untungRealisasiAset);
  const savingsRatePct = masuk > 0 ? ((masuk - keluarOperasional - bungaHutang) / masuk) * 100 : 0;

  return {
    masuk: Math.round(masuk),
    keluarOperasional: Math.round(keluarOperasional),
    bungaHutang: Math.round(bungaHutang),
    untungRealisasiAset: Math.round(untungRealisasiAset),
    perKategori,
    surplusBersih,
    savingsRatePct,
  };
}

// ===== CATEGORY PLAN VS ACTUAL RECONCILIATION =====
export interface CategoryVarianceRow {
  name: string;
  group: 'income' | 'personal';
  planned: number;
  actual: number;
  remaining: number;
  usedPct: number;
}

export function computeCategoryVariances(
  state: MoneyMapState,
  periodKey: string
): CategoryVarianceRow[] {
  const snap = state.monthSnapshots[periodKey];
  const range = getPeriodRange(periodKey, state.setup.cutoffDay);
  const stmt = computeIncomeStatement(state, range);

  const allocIncome = snap ? snap.allocIncome : state.setup.allocIncome;
  const allocPersonal = snap ? snap.allocPersonal : state.setup.allocPersonal;
  const plannedIncome = snap ? snap.penghasilanRencana : state.setup.penghasilanRencana;
  const incomeBase = plannedIncome > 0 ? plannedIncome : stmt.masuk;
  const personalBase = snap ? snap.budgetPribadi : state.setup.budgetPribadi;

  const compInc = computeAllocations(allocIncome, incomeBase);
  const compPers = computeAllocations(allocPersonal, personalBase);

  const rows: CategoryVarianceRow[] = [];
  const consumedCats = new Set<string>();

  // Personal sub-categories first, then non-bridge income categories
  compInc.forEach((item) => {
    if (item.row.locked || item.row.name.toLowerCase().includes('kebutuhan diri')) return;
    const act = stmt.perKategori[item.row.name] || 0;
    consumedCats.add(item.row.name);
    rows.push({
      name: item.row.name,
      group: 'income',
      planned: item.nominal,
      actual: act,
      remaining: item.nominal - act,
      usedPct: item.nominal > 0 ? (act / item.nominal) * 100 : act > 0 ? 100 : 0,
    });
  });

  compPers.forEach((item) => {
    const act = stmt.perKategori[item.row.name] || 0;
    consumedCats.add(item.row.name);
    rows.push({
      name: item.row.name,
      group: 'personal',
      planned: item.nominal,
      actual: act,
      remaining: item.nominal - act,
      usedPct: item.nominal > 0 ? (act / item.nominal) * 100 : act > 0 ? 100 : 0,
    });
  });

  // Include any unbudgeted categories with actual spend
  Object.entries(stmt.perKategori).forEach(([cat, act]) => {
    if (!consumedCats.has(cat) && act > 0) {
      rows.push({
        name: cat,
        group: 'personal',
        planned: 0,
        actual: act,
        remaining: -act,
        usedPct: 100,
      });
    }
  });

  return rows;
}

export interface SmartAlert {
  id: string;
  level: 'warn' | 'danger' | 'info' | 'ok';
  title: string;
  detail: string;
  targetTab: 'dashboard' | 'transactions' | 'budget' | 'wealth' | 'reports';
}

export function computeSmartAlerts(state: MoneyMapState, periodKey: string): SmartAlert[] {
  const alerts: SmartAlert[] = [];
  const variances = computeCategoryVariances(state, periodKey);
  const overRows = variances.filter((v) => v.planned > 0 && v.actual > v.planned);
  if (overRows.length > 0) {
    const worst = overRows.sort((a, b) => b.actual - b.planned - (a.actual - a.planned))[0];
    alerts.push({
      id: 'over-budget',
      level: 'danger',
      title: `${overRows.length} pos melampaui target anggaran`,
      detail: `${worst.name} melewati rencana sebesar ${fmtRp(worst.actual - worst.planned)}.`,
      targetTab: 'budget',
    });
  }

  const nearRows = variances.filter((v) => v.planned > 0 && v.usedPct >= 80 && v.actual <= v.planned);
  if (nearRows.length > 0) {
    alerts.push({
      id: 'near-budget',
      level: 'warn',
      title: `${nearRows[0].name} sudah terpakai ${Math.round(nearRows[0].usedPct)}%`,
      detail: `Sisa ruang anggaran tinggal ${fmtRp(nearRows[0].remaining)} di periode ini.`,
      targetTab: 'budget',
    });
  }

  const nowMs = new Date(`${todayISO()}T00:00:00`).getTime();
  state.pockets
    .filter((p) => !p.arsip && p.satuan !== 'rp')
    .forEach((p) => {
      if (!p.hargaUpdatedAt) {
        alerts.push({
          id: `stale-${p.id}`,
          level: 'info',
          title: `Harga pasar ${p.nama} belum diisi`,
          detail: 'Perbarui harga pasar agar estimasi Kekayaan Bersih akurat.',
          targetTab: 'wealth',
        });
      } else {
        const diffDays = Math.floor((nowMs - new Date(`${p.hargaUpdatedAt}T00:00:00`).getTime()) / 86_400_000);
        if (diffDays >= 7) {
          alerts.push({
            id: `stale-${p.id}`,
            level: 'info',
            title: `Harga ${p.nama} diperbarui ${diffDays} hari lalu`,
            detail: `Kurs terakhir ${fmtRp(p.hargaPerSatuan)} / ${getPocketUnitLabel(p)}.`,
            targetTab: 'wealth',
          });
        }
      }
    });

  const activeDebts = state.debts.filter((d) => d.status === 'aktif' && d.sisa > 0);
  if (activeDebts.length > 0) {
    const totalHutang = activeDebts
      .filter((d) => d.tipe === 'hutang')
      .reduce((s, d) => s + d.sisa, 0);
    if (totalHutang > 0) {
      alerts.push({
        id: 'active-debt',
        level: 'warn',
        title: `Kewajiban aktif tersisa ${fmtRp(totalHutang)}`,
        detail: 'Catat pembayaran cicilan dengan pemisahan pokok & bunga di menu Kantong & Aset.',
        targetTab: 'wealth',
      });
    }
  }

  if (alerts.length === 0) {
    alerts.push({
      id: 'all-healthy',
      level: 'ok',
      title: 'Seluruh pos arus kas berjalan sesuai rencana',
      detail: 'Tidak ada pembengkakan kategori maupun kewajiban tertunda.',
      targetTab: 'reports',
    });
  }

  return alerts;
}

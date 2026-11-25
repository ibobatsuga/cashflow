export type AllocationMode = 'pct' | 'amt';

export interface AllocationRow {
  id: string;
  name: string;
  pct: number; // 0..1 (e.g. 0.30 = 30%)
  amt: number; // fixed Rupiah when mode === 'amt'
  mode: AllocationMode;
  locked?: boolean; // e.g. 'Kebutuhan Diri Sendiri' bridge row
}

export type PocketUnit = 'rp' | 'gram' | 'lot' | 'lembar' | 'valas' | 'custom';
export type PocketKind = 'rekening' | 'ewallet' | 'tabungan' | 'darurat' | 'investasi' | 'lainnya';

export interface Pocket {
  id: string;
  nama: string;
  jenis: PocketKind;
  satuan: PocketUnit;
  satuanCustom: string;
  hargaPerSatuan: number;
  hargaUpdatedAt: string | null;
  catatan: string;
  isKas: boolean;
  arsip: boolean;
  desimal: number;
  totalModal: number;
  saldoAwal: Record<string, number>; // ISO date -> opening unit/Rp amount
}

export type TxnType =
  | 'pengeluaran'
  | 'pemasukan'
  | 'transfer'
  | 'beli_aset'
  | 'jual_aset'
  | 'terima_hutang'
  | 'bayar_hutang'
  | 'beri_piutang'
  | 'terima_piutang'
  | 'penyesuaian';

export type MoodTag =
  | 'Tenang & Terencana'
  | 'Lelah / Butuh Rehat'
  | 'Stres Kerja'
  | 'FOMO / Promo'
  | 'Apresiasi Diri'
  | 'Sosial & Keluarga'
  | 'Darurat Mendadak';

export type SpendNature =
  | 'Kebutuhan'
  | 'Keluarga / Ortu'
  | 'Self-Reward Sehat'
  | 'Keinginan'
  | 'Impulsif';

export interface Transaction {
  id: string;
  tgl: string; // YYYY-MM-DD
  nominal: number; // Always positive Rupiah (except 'penyesuaian' which can be signed)
  ket: string;
  kat: string;
  mood?: MoodTag | '';
  jenis?: SpendNature | '';
  kenapa?: string;
  tipe: TxnType;
  kantongId: string;
  kantongTujuanId?: string | null;
  refType?: 'hutang' | 'piutang' | null;
  refId?: string | null;
  porsi?: 'pokok' | 'bunga' | null;
  unit?: number | null;
  hargaSatuan?: number | null;
  nilaiBuku?: number | null;
  untungRugi?: number | null;
  refKantongId?: string | null;
}

export interface DebtInstallment {
  id: string;
  tgl: string;
  nominal: number;
  pokok: number;
  bunga: number;
}

export interface DebtItem {
  id: string;
  tipe: 'hutang' | 'piutang';
  nama: string;
  nominal: number;
  sisa: number;
  tgl: string;
  jatuhTempo?: string;
  catatan: string;
  status: 'aktif' | 'lunas';
  cair: boolean;
  kantongId: string | null;
  riwayat: DebtInstallment[];
}

export interface MonthSnapshot {
  penghasilanRencana: number;
  budgetPribadi: number;
  allocIncome: AllocationRow[];
  allocPersonal: AllocationRow[];
}

export interface ReflectionNote {
  win: string;
  worth: string;
  evaluasi: string;
  sandwichBoundary: string;
  targetDepan: string;
}

export interface WorkspaceSetup {
  nama: string;
  workspaceLabel: string;
  activePeriod: string; // "YYYY-MM", e.g. "2026-11"
  cutoffDay: number; // 1..28
  penghasilanRencana: number;
  budgetPribadi: number;
  allocIncome: AllocationRow[];
  allocPersonal: AllocationRow[];
  passcode?: string | null;
}

export interface MoneyMapState {
  version: number;
  isSampleData: boolean;
  setup: WorkspaceSetup;
  pockets: Pocket[];
  transactions: Transaction[];
  debts: DebtItem[];
  monthSnapshots: Record<string, MonthSnapshot>;
  reflections: Record<string, ReflectionNote>;
}

export type NavTabId = 'dashboard' | 'transactions' | 'budget' | 'wealth' | 'reports';

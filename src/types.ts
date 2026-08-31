export type IncomeCategory = {
  id: string;
  name: string;
  remittanceRate: number;
  appliesToRemittance: boolean;
};

export type Parish = {
  id: string;
  name: string;
};

export type ChurchProfile = {
  id: string;
  churchName: string;
  parishes: Parish[];
  createdAt: string;
};

export type MonthlyRecord = {
  id: string;
  profileId?: string;
  heading: string;
  status: 'active' | 'completed';
  createdAt: string;
  manualParishTotals?: Record<string, Record<string, number>>;
};

export type WeeklyIncome = {
  id: string;
  profileId?: string;
  monthId: string;
  parishId?: string;
  date: string;
  amounts: Record<string, number>;
};

export type TransferRecord = {
  id: string;
  profileId?: string;
  monthId: string;
  parishId?: string;
  name: string;
  date: string;
  amountReceived: number;
  allocations: Record<string, number>;
};

export type ExpenditureRecord = {
  id: string;
  profileId?: string;
  date: string;
  beneficiary: string;
  purpose: string;
  amount: number;
};

export type ImpressRecord = {
  id: string;
  profileId?: string;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
};

export type AppSettings = {
  churchName: string;
  parishes: Parish[];
  activeProfileId: string;
  profiles: ChurchProfile[];
  categories: IncomeCategory[];
};

export type BackupPayload = {
  version: 1;
  exportedAt: string;
  settings: AppSettings;
  months: MonthlyRecord[];
  incomes: WeeklyIncome[];
  transfers: TransferRecord[];
  expenditures: ExpenditureRecord[];
  impress: ImpressRecord[];
};

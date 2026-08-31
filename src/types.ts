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

export type MonthlyRecord = {
  id: string;
  heading: string;
  status: 'active' | 'completed';
  createdAt: string;
};

export type WeeklyIncome = {
  id: string;
  monthId: string;
  parishId?: string;
  date: string;
  amounts: Record<string, number>;
};

export type TransferRecord = {
  id: string;
  monthId: string;
  parishId?: string;
  name: string;
  date: string;
  amountReceived: number;
  allocations: Record<string, number>;
};

export type ExpenditureRecord = {
  id: string;
  date: string;
  beneficiary: string;
  purpose: string;
  amount: number;
};

export type ImpressRecord = {
  id: string;
  date: string;
  particulars: string;
  debit: number;
  credit: number;
};

export type AppSettings = {
  churchName: string;
  parishes: Parish[];
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

import type { AppSettings, ImpressRecord, Parish, TransferRecord, WeeklyIncome } from '../types';

export const MAIN_PARISH_ID = 'main';

export const currency = new Intl.NumberFormat('en-NG', {
  style: 'currency',
  currency: 'NGN',
  maximumFractionDigits: 0,
});

export function toAmount(value: FormDataEntryValue | null): number {
  const parsed = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

export function formatCurrency(amount: number): string {
  return currency.format(amount || 0);
}

export function sumAmounts(amounts: Record<string, number>): number {
  return Object.values(amounts).reduce((total, amount) => total + (Number(amount) || 0), 0);
}

function getCategoryAmount(amounts: Record<string, number>, categoryId: string): number {
  const amount = amounts[categoryId] || 0;
  if (categoryId === 'specialThanksgiving') return amount + (amounts.thanksgivingSpecial || 0);
  if (categoryId === 'crm') return amount + (amounts.crmTuesday || 0) + (amounts.crmThursday || 0);
  return amount;
}

export function calculateCategoryTotals(
  incomes: WeeklyIncome[],
  transfers: TransferRecord[],
  settings: AppSettings,
  parishId?: string,
) {
  const scopedIncomes = parishId ? incomes.filter((row) => (row.parishId ?? MAIN_PARISH_ID) === parishId) : incomes;
  const scopedTransfers = parishId ? transfers.filter((row) => (row.parishId ?? MAIN_PARISH_ID) === parishId) : transfers;
  return settings.categories.reduce<Record<string, number>>((totals, category) => {
    const cashTotal = scopedIncomes.reduce((sum, row) => sum + getCategoryAmount(row.amounts, category.id), 0);
    const transferTotal = scopedTransfers.reduce((sum, row) => sum + getCategoryAmount(row.allocations, category.id), 0);
    totals[category.id] = cashTotal + transferTotal;
    return totals;
  }, {});
}

export function calculateRemittance(totals: Record<string, number>, settings: AppSettings) {
  return settings.categories.map((category) => {
    const total = totals[category.id] || 0;
    const amount = category.appliesToRemittance ? (total * category.remittanceRate) / 100 : 0;
    return { category, total, amount };
  });
}

export function calculateTransferDifference(transfer: TransferRecord): number {
  return transfer.amountReceived - sumAmounts(transfer.allocations);
}

export function getAllParishes(settings: AppSettings): Parish[] {
  return [{ id: MAIN_PARISH_ID, name: `${settings.churchName} PARISH` }, ...(settings.parishes ?? [])];
}

export function getParishName(settings: AppSettings, parishId?: string): string {
  return getAllParishes(settings).find((parish) => parish.id === (parishId ?? MAIN_PARISH_ID))?.name ?? `${settings.churchName} PARISH`;
}

export function calculateRedFormRows(totals: Record<string, number>) {
  const rows = [
    { label: 'GENERAL TITHE (48%)', total: totals.generalTithe || 0, rate: 48 },
    { label: 'MINISTERS TITHE 48%', total: totals.ministersTithe || 0, rate: 48 },
    { label: 'THANKSGIVING (40%)', total: totals.thanksgiving || 0, rate: 40 },
    { label: 'THANKSGIVING (1%)', total: totals.thanksgiving || 0, rate: 1 },
    { label: 'SPECIAL THANKSGIVING (100%)', total: totals.specialThanksgiving || 0, rate: 100 },
    { label: 'SLO (30%)', total: totals.slo || 0, rate: 30 },
    { label: 'CRM (40%)', total: totals.crm || 0, rate: 40 },
    { label: 'GOSPEL FUND (25%)', total: totals.gospelFund || 0, rate: 25 },
    { label: 'FIRST FRUIT', total: totals.firstFruit || 0, rate: 90 },
    { label: '1ST BORN REDEMPTION', total: totals.firstBornRedemption || 0, rate: 100 },
    { label: 'CONGRESS T/G', total: totals.annualThanksgiving || 0, rate: 50 },
  ];

  return rows.map((row) => ({ ...row, amount: (row.total * row.rate) / 100 }));
}

export function calculateImpressLedger(records: ImpressRecord[]) {
  return [...records]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((record) => ({ ...record, balance: record.credit - record.debit }));
}

export function calculateImpressBalance(records: ImpressRecord[]) {
  return records.reduce((balance, record) => balance + record.credit - record.debit, 0);
}

export function makeId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

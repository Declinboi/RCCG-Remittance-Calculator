import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Banknote,
  Calculator,
  CheckCircle2,
  Database,
  Download,
  FileDown,
  LayoutDashboard,
  Lock,
  Plus,
  ReceiptText,
  Save,
  Settings,
  Trash2,
  Upload,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  createBackup,
  deleteExpenditure,
  deleteImpress,
  deleteIncome,
  deleteMonth,
  deleteTransfer,
  getAllData,
  restoreBackup,
  saveSettings,
  upsertExpenditure,
  upsertImpress,
  upsertIncome,
  upsertMonth,
  upsertTransfer,
} from './db';
import type {
  AppSettings,
  ExpenditureRecord,
  ImpressRecord,
  MonthlyRecord,
  Parish,
  TransferRecord,
  WeeklyIncome,
} from './types';
import {
  MAIN_PARISH_ID,
  calculateCategoryTotals,
  calculateImpressLedger,
  calculateRedFormRows,
  calculateRemittance,
  calculateTransferDifference,
  formatCurrency,
  getAllParishes,
  getParishName,
  makeId,
  sumAmounts,
  toAmount,
} from './utils/calculations';
import { exportMonthPdf } from './utils/pdf';

type View = 'dashboard' | 'month' | 'expenditure' | 'impress' | 'settings';
type Toast = { message: string; tone: 'success' | 'error' };

type AppData = {
  settings: AppSettings;
  months: MonthlyRecord[];
  incomes: WeeklyIncome[];
  transfers: TransferRecord[];
  expenditures: ExpenditureRecord[];
  impress: ImpressRecord[];
};

type ParishSummary = {
  parish: Parish;
  totals: Record<string, number>;
  redFormRows: ReturnType<typeof calculateRedFormRows>;
  remittanceRows: ReturnType<typeof calculateRemittance>;
  totalIncome: number;
  totalTransfers: number;
  totalCashIncome: number;
  totalRemittance: number;
  redFormTotal: number;
};

const emptyData: AppData = {
  settings: { churchName: 'HOUSE OF TESTIMONY', parishes: [], categories: [] },
  months: [],
  incomes: [],
  transfers: [],
  expenditures: [],
  impress: [],
};

function App() {
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>('dashboard');
  const [selectedMonthId, setSelectedMonthId] = useState<string>('');
  const [editingIncome, setEditingIncome] = useState<WeeklyIncome | null>(null);
  const [editingTransfer, setEditingTransfer] = useState<TransferRecord | null>(null);
  const [editingExpense, setEditingExpense] = useState<ExpenditureRecord | null>(null);
  const [editingImpress, setEditingImpress] = useState<ImpressRecord | null>(null);
  const [editingParish, setEditingParish] = useState<Parish | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  function notify(message: string, tone: Toast['tone'] = 'success') {
    setToast({ message, tone });
    window.setTimeout(() => {
      setToast((current) => (current?.message === message ? null : current));
    }, 3200);
  }

  function reportError(error: unknown) {
    console.error(error);
    notify('Action failed. Please try again.', 'error');
  }

  async function refresh() {
    const next = await getAllData();
    next.months.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    setData(next);
    if (!selectedMonthId && next.months[0]) setSelectedMonthId(next.months[0].id);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
  }, []);

  const selectedMonth = data.months.find((month) => month.id === selectedMonthId) ?? data.months[0];
  const allParishes = useMemo(() => getAllParishes(data.settings), [data.settings]);
  const monthIncomes = useMemo(
    () => data.incomes.filter((row) => row.monthId === selectedMonth?.id).sort((a, b) => a.date.localeCompare(b.date)),
    [data.incomes, selectedMonth?.id],
  );
  const monthTransfers = useMemo(
    () => data.transfers.filter((row) => row.monthId === selectedMonth?.id).sort((a, b) => a.date.localeCompare(b.date)),
    [data.transfers, selectedMonth?.id],
  );
  const categoryTotals = useMemo(
    () => calculateCategoryTotals(monthIncomes, monthTransfers, data.settings),
    [data.settings, monthIncomes, monthTransfers],
  );
  const remittanceRows = useMemo(
    () => calculateRemittance(categoryTotals, data.settings),
    [categoryTotals, data.settings],
  );
  const parishSummaries = useMemo(
    () =>
      allParishes.map((parish) => {
        const totals = calculateCategoryTotals(monthIncomes, monthTransfers, data.settings, parish.id);
        const redFormRows = calculateRedFormRows(totals);
        const remittanceRows = calculateRemittance(totals, data.settings);
        const totalIncome = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
        const totalTransfers = monthTransfers
          .filter((row) => (row.parishId ?? MAIN_PARISH_ID) === parish.id)
          .reduce((sum, row) => sum + row.amountReceived, 0);
        return {
          parish,
          totals,
          redFormRows,
          remittanceRows,
          totalIncome,
          totalTransfers,
          totalCashIncome: totalIncome - totalTransfers,
          totalRemittance: remittanceRows.reduce((sum, row) => sum + row.amount, 0),
          redFormTotal: redFormRows.reduce((sum, row) => sum + row.amount, 0),
        };
      }),
    [allParishes, data.settings, monthIncomes, monthTransfers],
  );
  const totalIncome = Object.values(categoryTotals).reduce((sum, amount) => sum + amount, 0);
  const totalTransfers = monthTransfers.reduce((sum, row) => sum + row.amountReceived, 0);
  const totalCashIncome = totalIncome - totalTransfers;
  const totalRemittance = remittanceRows.reduce((sum, row) => sum + row.amount, 0);
  const totalExpenditure = data.expenditures.reduce((sum, row) => sum + row.amount, 0);
  const impressLedger = calculateImpressLedger(data.impress);
  const impressBalance = impressLedger.at(-1)?.balance ?? 0;

  async function handleCreateMonth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const heading = String(form.get('heading') ?? '').trim();
    if (!heading) return;
    const month: MonthlyRecord = {
      id: makeId('month'),
      heading,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    try {
      await upsertMonth(month);
      setSelectedMonthId(month.id);
      setView('month');
      formElement.reset();
      await refresh();
      notify('Monthly record created.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleToggleMonthStatus(month: MonthlyRecord) {
    try {
      await upsertMonth({ ...month, status: month.status === 'active' ? 'completed' : 'active' });
      await refresh();
      notify('Month status updated.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleDeleteMonth(month: MonthlyRecord) {
    if (!confirm(`Delete monthly record?\n\n${month.heading}\n\nThis will remove its income and transfer records.`)) return;
    try {
      await deleteMonth(month.id);
      if (selectedMonthId === month.id) setSelectedMonthId('');
      setView('dashboard');
      await refresh();
      notify('Monthly record deleted.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSaveIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMonth) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const record: WeeklyIncome = {
      id: editingIncome?.id ?? makeId('income'),
      monthId: selectedMonth.id,
      parishId: String(form.get('parishId') ?? MAIN_PARISH_ID),
      date: String(form.get('date') ?? ''),
      amounts: Object.fromEntries(data.settings.categories.map((category) => [category.id, toAmount(form.get(category.id))])),
    };
    try {
      await upsertIncome(record);
      setEditingIncome(null);
      formElement.reset();
      await refresh();
      notify(editingIncome ? 'Income record updated.' : 'Income record added.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSaveTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedMonth) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const record: TransferRecord = {
      id: editingTransfer?.id ?? makeId('transfer'),
      monthId: selectedMonth.id,
      parishId: String(form.get('parishId') ?? MAIN_PARISH_ID),
      name: String(form.get('name') ?? '').trim(),
      date: String(form.get('date') ?? ''),
      amountReceived: toAmount(form.get('amountReceived')),
      allocations: Object.fromEntries(data.settings.categories.map((category) => [category.id, toAmount(form.get(category.id))])),
    };
    try {
      await upsertTransfer(record);
      setEditingTransfer(null);
      formElement.reset();
      await refresh();
      notify(editingTransfer ? 'Transfer updated.' : 'Transfer added.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSaveExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const record: ExpenditureRecord = {
      id: editingExpense?.id ?? makeId('expense'),
      date: String(form.get('date') ?? ''),
      beneficiary: String(form.get('beneficiary') ?? '').trim(),
      purpose: String(form.get('purpose') ?? '').trim(),
      amount: toAmount(form.get('amount')),
    };
    try {
      await upsertExpenditure(record);
      setEditingExpense(null);
      formElement.reset();
      await refresh();
      notify(editingExpense ? 'Expenditure updated.' : 'Expenditure added.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSaveImpress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const record: ImpressRecord = {
      id: editingImpress?.id ?? makeId('impress'),
      date: String(form.get('date') ?? ''),
      particulars: String(form.get('particulars') ?? '').trim(),
      debit: toAmount(form.get('debit')),
      credit: toAmount(form.get('credit')),
    };
    try {
      await upsertImpress(record);
      setEditingImpress(null);
      formElement.reset();
      await refresh();
      notify(editingImpress ? 'Impress record updated.' : 'Impress record added.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSaveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    try {
      await saveSettings({
        churchName: String(form.get('churchName') ?? '').trim() || data.settings.churchName,
        parishes: data.settings.parishes ?? [],
        categories: data.settings.categories.map((category) => ({
          ...category,
          remittanceRate: Number(form.get(`${category.id}.rate`) ?? category.remittanceRate),
          appliesToRemittance: form.get(`${category.id}.enabled`) === 'on',
        })),
      });
      await refresh();
      notify('Calculation rules saved.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleSaveParish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const name = String(form.get('parishName') ?? '').trim();
    if (!name) return;
    const parish: Parish = {
      id: editingParish?.id ?? makeId('parish'),
      name,
    };
    try {
      await saveSettings({
        ...data.settings,
        parishes: editingParish
          ? data.settings.parishes.map((item) => (item.id === editingParish.id ? parish : item))
          : [...(data.settings.parishes ?? []), parish],
      });
      setEditingParish(null);
      formElement.reset();
      await refresh();
      notify(editingParish ? 'Parish updated.' : 'Parish added.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleDeleteParish(parish: Parish) {
    if (!confirm(`Delete parish?\n\n${parish.name}\n\nExisting records will stay saved but will no longer appear under this parish.`)) return;
    try {
      await saveSettings({
        ...data.settings,
        parishes: data.settings.parishes.filter((item) => item.id !== parish.id),
      });
      if (editingParish?.id === parish.id) setEditingParish(null);
      await refresh();
      notify('Parish deleted.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleBackup() {
    try {
      const payload = await createBackup();
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cash-remittance-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify('Backup file created.');
    } catch (error) {
      reportError(error);
    }
  }

  async function handleRestore(file: File | undefined) {
    if (!file) return;
    try {
      const payload = JSON.parse(await file.text());
      await restoreBackup(payload);
      await refresh();
      notify('Backup restored.');
    } catch (error) {
      reportError(error);
    }
  }

  if (loading) {
    return <main className="flex min-h-screen items-center justify-center bg-paper text-ink">Loading records...</main>;
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <aside className="fixed inset-y-0 left-0 hidden w-72 border-r border-stone-200 bg-white lg:block">
        <div className="border-b border-stone-200 p-5">
          <p className="text-sm font-bold uppercase text-palm">{data.settings.churchName}</p>
          <h1 className="mt-1 text-xl font-bold">Cash & Remittance</h1>
        </div>
        <nav className="space-y-1 p-3">
          <NavButton icon={<LayoutDashboard size={18} />} label="Dashboard" active={view === 'dashboard'} onClick={() => setView('dashboard')} />
          <NavButton icon={<Banknote size={18} />} label="Monthly Records" active={view === 'month'} onClick={() => setView('month')} />
          <NavButton icon={<ReceiptText size={18} />} label="Church Expenditure" active={view === 'expenditure'} onClick={() => setView('expenditure')} />
          <NavButton icon={<WalletCards size={18} />} label="Church Impress" active={view === 'impress'} onClick={() => setView('impress')} />
          <NavButton icon={<Settings size={18} />} label="Settings" active={view === 'settings'} onClick={() => setView('settings')} />
        </nav>
        <div className="px-3">
          <p className="mb-2 px-3 text-xs font-bold uppercase text-stone-500">Monthly Records</p>
          <div className="max-h-[42vh] space-y-1 overflow-auto">
            {data.months.map((month) => (
              <button
                key={month.id}
                onClick={() => {
                  setSelectedMonthId(month.id);
                  setView('month');
                }}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-semibold ${
                  selectedMonth?.id === month.id ? 'bg-palm text-white' : 'hover:bg-stone-100'
                }`}
              >
                {month.heading}
              </button>
            ))}
          </div>
        </div>
      </aside>

      <main className="lg:pl-72">
        <header className="sticky top-0 z-10 border-b border-stone-200 bg-paper/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between">
            <strong>Cash & Remittance</strong>
            <select className="input max-w-44" value={view} onChange={(event) => setView(event.target.value as View)}>
              <option value="dashboard">Dashboard</option>
              <option value="month">Monthly Records</option>
              <option value="expenditure">Expenditure</option>
              <option value="impress">Impress</option>
              <option value="settings">Settings</option>
            </select>
          </div>
        </header>

        <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          {view === 'dashboard' && (
            <Dashboard
              data={data}
              selectedMonth={selectedMonth}
              totals={{ totalCashIncome, totalTransfers, totalIncome, totalRemittance, totalExpenditure, impressBalance }}
              onCreateMonth={handleCreateMonth}
              onOpenMonth={(month) => {
                setSelectedMonthId(month.id);
                setView('month');
              }}
            />
          )}

          {view === 'month' && selectedMonth && (
            <MonthView
              settings={data.settings}
              month={selectedMonth}
              incomes={monthIncomes}
              transfers={monthTransfers}
              totals={categoryTotals}
              remittanceRows={remittanceRows}
              parishes={allParishes}
              parishSummaries={parishSummaries}
              editingIncome={editingIncome}
              editingTransfer={editingTransfer}
              summary={{ totalCashIncome, totalTransfers, totalIncome, totalRemittance }}
              onSaveIncome={handleSaveIncome}
              onSaveTransfer={handleSaveTransfer}
              onEditIncome={setEditingIncome}
              onEditTransfer={setEditingTransfer}
              onCancelIncome={() => setEditingIncome(null)}
              onCancelTransfer={() => setEditingTransfer(null)}
              onDeleteIncome={async (row) => {
                if (!confirm(`Delete income record for ${row.date}?`)) return;
                try {
                  await deleteIncome(row.id);
                  await refresh();
                  notify('Income record deleted.');
                } catch (error) {
                  reportError(error);
                }
              }}
              onDeleteTransfer={async (row) => {
                if (!confirm(`Delete this transfer?\n\n${row.name}\n${formatCurrency(row.amountReceived)}\n${row.date}`)) return;
                try {
                  await deleteTransfer(row.id);
                  await refresh();
                  notify('Transfer deleted.');
                } catch (error) {
                  reportError(error);
                }
              }}
              onToggleStatus={() => handleToggleMonthStatus(selectedMonth)}
              onDeleteMonth={() => handleDeleteMonth(selectedMonth)}
              onExportPdf={() =>
                exportMonthPdf({
                  settings: data.settings,
                  month: selectedMonth,
                  incomes: monthIncomes,
                  transfers: monthTransfers,
                  expenditures: data.expenditures,
                  impress: data.impress,
                })
              }
            />
          )}

          {view === 'month' && !selectedMonth && (
            <EmptyMonth onCreateMonth={handleCreateMonth} />
          )}

          {view === 'expenditure' && (
            <ExpenditureView
              records={data.expenditures}
              editing={editingExpense}
              onSave={handleSaveExpense}
              onEdit={setEditingExpense}
              onCancel={() => setEditingExpense(null)}
              onDelete={async (row) => {
                if (!confirm(`Delete expenditure?\n\n${row.beneficiary}\n${row.purpose}\n${formatCurrency(row.amount)}`)) return;
                try {
                  await deleteExpenditure(row.id);
                  await refresh();
                  notify('Expenditure deleted.');
                } catch (error) {
                  reportError(error);
                }
              }}
            />
          )}

          {view === 'impress' && (
            <ImpressView
              records={impressLedger}
              editing={editingImpress}
              onSave={handleSaveImpress}
              onEdit={setEditingImpress}
              onCancel={() => setEditingImpress(null)}
              onDelete={async (row) => {
                if (!confirm(`Delete impress record?\n\n${row.particulars}`)) return;
                try {
                  await deleteImpress(row.id);
                  await refresh();
                  notify('Impress record deleted.');
                } catch (error) {
                  reportError(error);
                }
              }}
            />
          )}

          {view === 'settings' && (
            <SettingsView
              data={data}
              editingParish={editingParish}
              onSave={handleSaveSettings}
              onSaveParish={handleSaveParish}
              onEditParish={setEditingParish}
              onCancelParish={() => setEditingParish(null)}
              onDeleteParish={handleDeleteParish}
              onBackup={handleBackup}
              onRestore={handleRestore}
            />
          )}
        </div>
      </main>
      <ToastMessage toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}

function NavButton({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-semibold ${
        active ? 'bg-ink text-white' : 'text-stone-700 hover:bg-stone-100'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ToastMessage({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  if (!toast) return null;

  const isError = toast.tone === 'error';
  return (
    <div className="fixed right-4 top-4 z-50 max-w-sm rounded-md border border-stone-200 bg-white p-4 shadow-panel">
      <div className="flex items-start gap-3">
        <span className={isError ? 'text-brick' : 'text-emerald-700'}>
          {isError ? <AlertCircle size={20} /> : <CheckCircle2 size={20} />}
        </span>
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{toast.message}</p>
        <button className="text-sm font-bold text-stone-500 hover:text-ink" type="button" onClick={onClose} aria-label="Close notification">
          x
        </button>
      </div>
    </div>
  );
}

function Dashboard({
  data,
  selectedMonth,
  totals,
  onCreateMonth,
  onOpenMonth,
}: {
  data: AppData;
  selectedMonth?: MonthlyRecord;
  totals: Record<string, number>;
  onCreateMonth: (event: FormEvent<HTMLFormElement>) => void;
  onOpenMonth: (month: MonthlyRecord) => void;
}) {
  return (
    <>
      <section>
        <p className="text-sm font-bold uppercase text-palm">{data.settings.churchName}</p>
        <h2 className="mt-1 text-3xl font-bold">Dashboard</h2>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Cash Income" value={totals.totalCashIncome} />
        <Metric label="Transfers" value={totals.totalTransfers} />
        <Metric label="Total Income" value={totals.totalIncome} />
        <Metric label="Remittance" value={totals.totalRemittance} />
        <Metric label="Expenditure" value={totals.totalExpenditure} />
        <Metric label="Impress Balance" value={totals.impressBalance} />
      </section>
      <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <div className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-stone-200 p-4">
            <h3 className="text-lg font-bold">Monthly Records</h3>
            {selectedMonth && <span className="text-sm text-stone-500">Selected: {selectedMonth.heading}</span>}
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.months.map((month) => (
              <button key={month.id} onClick={() => onOpenMonth(month)} className="rounded-lg border border-stone-200 bg-stone-50 p-4 text-left hover:border-palm">
                <div className="flex items-start justify-between gap-3">
                  <strong>{month.heading}</strong>
                  <span className={`rounded-full px-2 py-1 text-xs font-bold ${month.status === 'completed' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                    {month.status}
                  </span>
                </div>
                <p className="mt-3 text-sm text-stone-500">Heading locked after creation</p>
              </button>
            ))}
            {!data.months.length && <p className="text-sm text-stone-500">No monthly records yet.</p>}
          </div>
        </div>
        <CreateMonthPanel onCreateMonth={onCreateMonth} />
      </section>
    </>
  );
}

function EmptyMonth({ onCreateMonth }: { onCreateMonth: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <div className="mx-auto max-w-lg pt-10">
      <CreateMonthPanel onCreateMonth={onCreateMonth} />
    </div>
  );
}

function CreateMonthPanel({ onCreateMonth }: { onCreateMonth: (event: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={onCreateMonth} className="panel p-4">
      <div className="mb-4 flex items-center gap-2">
        <Plus size={18} />
        <h3 className="text-lg font-bold">Create Monthly Record</h3>
      </div>
      <label className="text-sm font-semibold" htmlFor="heading">Month Heading</label>
      <input id="heading" name="heading" className="input mt-2 uppercase" placeholder="JULY 2026" required />
      <p className="mt-3 flex items-center gap-2 text-sm text-stone-500"><Lock size={15} /> Heading becomes locked permanently.</p>
      <button className="btn-primary mt-4 w-full" type="submit"><Plus size={17} /> Create Month</button>
    </form>
  );
}

function MonthView(props: {
  settings: AppSettings;
  month: MonthlyRecord;
  incomes: WeeklyIncome[];
  transfers: TransferRecord[];
  totals: Record<string, number>;
  remittanceRows: ReturnType<typeof calculateRemittance>;
  parishes: Parish[];
  parishSummaries: ParishSummary[];
  editingIncome: WeeklyIncome | null;
  editingTransfer: TransferRecord | null;
  summary: Record<string, number>;
  onSaveIncome: (event: FormEvent<HTMLFormElement>) => void;
  onSaveTransfer: (event: FormEvent<HTMLFormElement>) => void;
  onEditIncome: (record: WeeklyIncome) => void;
  onEditTransfer: (record: TransferRecord) => void;
  onCancelIncome: () => void;
  onCancelTransfer: () => void;
  onDeleteIncome: (record: WeeklyIncome) => void;
  onDeleteTransfer: (record: TransferRecord) => void;
  onToggleStatus: () => void;
  onDeleteMonth: () => void;
  onExportPdf: () => void;
}) {
  return (
    <>
      <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold uppercase text-palm"><Lock size={16} /> Locked Month Heading</p>
          <h2 className="mt-1 text-3xl font-bold uppercase">{props.month.heading}</h2>
          <p className="mt-1 text-sm text-stone-500">Status: {props.month.status}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-secondary" onClick={props.onToggleStatus}><CheckCircle2 size={17} /> Toggle Status</button>
          <button className="btn-secondary" onClick={props.onExportPdf}><FileDown size={17} /> Export PDF</button>
          <button className="btn-danger" onClick={props.onDeleteMonth}><Trash2 size={17} /> Delete Month</button>
        </div>
      </section>
      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Cash Income" value={props.summary.totalCashIncome} />
        <Metric label="Transfers" value={props.summary.totalTransfers} />
        <Metric label="Total Income" value={props.summary.totalIncome} />
        <Metric label="Remittance" value={props.summary.totalRemittance} />
      </section>
      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <IncomeSection {...props} />
        <TotalsSection settings={props.settings} totals={props.totals} remittanceRows={props.remittanceRows} />
      </section>
      <TransferSection {...props} />
      <ParishSummarySection summaries={props.parishSummaries} />
      <RedFormSection summaries={props.parishSummaries} />
    </>
  );
}

function IncomeSection({
  settings,
  parishes,
  incomes,
  editingIncome,
  onSaveIncome,
  onEditIncome,
  onDeleteIncome,
  onCancelIncome,
}: Pick<Parameters<typeof MonthView>[0], 'settings' | 'parishes' | 'incomes' | 'editingIncome' | 'onSaveIncome' | 'onEditIncome' | 'onDeleteIncome' | 'onCancelIncome'>) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-stone-200 p-4">
        <h3 className="text-lg font-bold">Weekly Cash Income</h3>
      </div>
      <form onSubmit={onSaveIncome} className="border-b border-stone-200 bg-stone-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">
            Parish
            <select className="input mt-1" name="parishId" defaultValue={editingIncome?.parishId ?? MAIN_PARISH_ID}>
              {parishes.map((parish) => <option key={parish.id} value={parish.id}>{parish.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Date<input className="input mt-1" type="date" name="date" defaultValue={editingIncome?.date} required /></label>
          {settings.categories.map((category) => (
            <label key={category.id} className="text-sm font-semibold">
              {category.name}
              <input className="input mt-1" name={category.id} inputMode="decimal" defaultValue={editingIncome?.amounts[category.id] || ''} placeholder="0" />
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" type="submit"><Save size={17} /> {editingIncome ? 'Save Changes' : 'Add Income Date'}</button>
          {editingIncome && <button className="btn-secondary" type="button" onClick={onCancelIncome}>Cancel</button>}
        </div>
      </form>
      <ResponsiveTable headers={['Parish', 'Date', 'Total', 'Actions']}>
        {incomes.map((row) => (
          <tr key={row.id}>
            <td className="table-cell font-semibold">{getParishName(settings, row.parishId)}</td>
            <td className="table-cell font-semibold">{row.date}</td>
            <td className="table-cell">{formatCurrency(sumAmounts(row.amounts))}</td>
            <td className="table-cell">
              <RowActions onEdit={() => onEditIncome(row)} onDelete={() => onDeleteIncome(row)} />
            </td>
          </tr>
        ))}
      </ResponsiveTable>
    </section>
  );
}

function TransferSection({
  settings,
  parishes,
  transfers,
  editingTransfer,
  onSaveTransfer,
  onEditTransfer,
  onDeleteTransfer,
  onCancelTransfer,
}: Pick<Parameters<typeof MonthView>[0], 'settings' | 'parishes' | 'transfers' | 'editingTransfer' | 'onSaveTransfer' | 'onEditTransfer' | 'onDeleteTransfer' | 'onCancelTransfer'>) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-stone-200 p-4">
        <h3 className="text-lg font-bold">Transfers</h3>
      </div>
      <form onSubmit={onSaveTransfer} className="border-b border-stone-200 bg-stone-50 p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-semibold">
            Parish
            <select className="input mt-1" name="parishId" defaultValue={editingTransfer?.parishId ?? MAIN_PARISH_ID}>
              {parishes.map((parish) => <option key={parish.id} value={parish.id}>{parish.name}</option>)}
            </select>
          </label>
          <label className="text-sm font-semibold">Name<input className="input mt-1" name="name" defaultValue={editingTransfer?.name} required /></label>
          <label className="text-sm font-semibold">Date<input className="input mt-1" type="date" name="date" defaultValue={editingTransfer?.date} required /></label>
          <label className="text-sm font-semibold">Amount Received<input className="input mt-1" name="amountReceived" inputMode="decimal" defaultValue={editingTransfer?.amountReceived || ''} required /></label>
          {settings.categories.map((category) => (
            <label key={category.id} className="text-sm font-semibold">
              {category.name}
              <input className="input mt-1" name={category.id} inputMode="decimal" defaultValue={editingTransfer?.allocations[category.id] || ''} placeholder="0" />
            </label>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="btn-primary" type="submit"><Save size={17} /> {editingTransfer ? 'Save Changes' : 'Add Transfer'}</button>
          {editingTransfer && <button className="btn-secondary" type="button" onClick={onCancelTransfer}>Cancel</button>}
        </div>
      </form>
      <ResponsiveTable headers={['Parish', 'Name', 'Date', 'Received', 'Allocated', 'Difference', 'Actions']}>
        {transfers.map((row) => {
          const allocated = sumAmounts(row.allocations);
          const difference = calculateTransferDifference(row);
          return (
            <tr key={row.id}>
              <td className="table-cell font-semibold">{getParishName(settings, row.parishId)}</td>
              <td className="table-cell font-semibold">{row.name}</td>
              <td className="table-cell">{row.date}</td>
              <td className="table-cell">{formatCurrency(row.amountReceived)}</td>
              <td className="table-cell">{formatCurrency(allocated)}</td>
              <td className={`table-cell font-bold ${difference === 0 ? 'text-emerald-700' : difference > 0 ? 'text-amber-700' : 'text-brick'}`}>
                {difference === 0 ? 'Balanced' : difference > 0 ? `Unallocated ${formatCurrency(difference)}` : `Over by ${formatCurrency(Math.abs(difference))}`}
              </td>
              <td className="table-cell"><RowActions onEdit={() => onEditTransfer(row)} onDelete={() => onDeleteTransfer(row)} /></td>
            </tr>
          );
        })}
      </ResponsiveTable>
    </section>
  );
}

function TotalsSection({ settings, totals, remittanceRows }: { settings: AppSettings; totals: Record<string, number>; remittanceRows: ReturnType<typeof calculateRemittance> }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-stone-200 p-4">
        <h3 className="text-lg font-bold">Automatic Totals</h3>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full border-collapse">
          <thead className="table-head">
            <tr>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Total</th>
              <th className="px-3 py-2">Remit</th>
            </tr>
          </thead>
          <tbody>
            {settings.categories.map((category) => {
              const remittance = remittanceRows.find((row) => row.category.id === category.id)?.amount ?? 0;
              return (
                <tr key={category.id}>
                  <td className="table-cell font-semibold">{category.name}</td>
                  <td className="table-cell">{formatCurrency(totals[category.id] || 0)}</td>
                  <td className="table-cell">{category.appliesToRemittance ? formatCurrency(remittance) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ParishSummarySection({ summaries }: { summaries: ParishSummary[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-stone-200 p-4">
        <Users size={18} />
        <h3 className="text-lg font-bold">Parish Remittance Summaries</h3>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-2">
        {summaries.map((summary) => (
          <div key={summary.parish.id} className="overflow-hidden rounded-md border border-stone-200">
            <div className="bg-stone-100 px-3 py-2">
              <h4 className="text-sm font-black uppercase">{summary.parish.name}</h4>
            </div>
            <table className="w-full border-collapse">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Returns</th>
                </tr>
              </thead>
              <tbody>
                {summary.remittanceRows.map((row) => (
                  <tr key={row.category.id}>
                    <td className="table-cell font-semibold">{row.category.name}</td>
                    <td className="table-cell">{formatCurrency(row.total)}</td>
                    <td className="table-cell">{row.category.appliesToRemittance ? formatCurrency(row.amount) : formatCurrency(row.total)}</td>
                  </tr>
                ))}
                <tr>
                  <td className="table-cell font-black">TOTAL</td>
                  <td className="table-cell font-black">{formatCurrency(summary.totalIncome)}</td>
                  <td className="table-cell font-black">{formatCurrency(summary.totalRemittance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

function RedFormSection({ summaries }: { summaries: ParishSummary[] }) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-red-200 bg-red-50 p-4">
        <h3 className="text-lg font-bold text-red-900">Red Form Table</h3>
      </div>
      <div className="grid gap-4 p-4 xl:grid-cols-2">
        {summaries.map((summary) => (
          <div key={summary.parish.id} className="overflow-hidden rounded-md border border-red-200">
            <div className="bg-red-700 px-3 py-2 text-white">
              <h4 className="text-sm font-black uppercase">{summary.parish.name} RED FORM</h4>
            </div>
            <table className="w-full border-collapse">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2">Total</th>
                  <th className="px-3 py-2">Remittance</th>
                </tr>
              </thead>
              <tbody>
                {summary.redFormRows.map((row) => (
                  <tr key={row.label}>
                    <td className="table-cell font-semibold">{row.label}</td>
                    <td className="table-cell">{formatCurrency(row.total)}</td>
                    <td className="table-cell font-bold">{formatCurrency(row.amount)}</td>
                  </tr>
                ))}
                <tr className="bg-red-50">
                  <td className="table-cell font-black">TOTAL</td>
                  <td className="table-cell" />
                  <td className="table-cell font-black">{formatCurrency(summary.redFormTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}

function ExpenditureView({
  records,
  editing,
  onSave,
  onEdit,
  onCancel,
  onDelete,
}: {
  records: ExpenditureRecord[];
  editing: ExpenditureRecord | null;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (record: ExpenditureRecord) => void;
  onCancel: () => void;
  onDelete: (record: ExpenditureRecord) => void;
}) {
  return (
    <CrudPanel
      title="Church Expenditure"
      total={records.reduce((sum, row) => sum + row.amount, 0)}
      form={
        <form onSubmit={onSave} className="grid gap-3 bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-semibold">Date<input className="input mt-1" type="date" name="date" defaultValue={editing?.date} required /></label>
          <label className="text-sm font-semibold">Beneficiary<input className="input mt-1" name="beneficiary" defaultValue={editing?.beneficiary} required /></label>
          <label className="text-sm font-semibold lg:col-span-2">Purpose<input className="input mt-1" name="purpose" defaultValue={editing?.purpose} required /></label>
          <label className="text-sm font-semibold">Amount<input className="input mt-1" name="amount" inputMode="decimal" defaultValue={editing?.amount || ''} required /></label>
          <div className="flex gap-2 lg:col-span-5"><button className="btn-primary"><Save size={17} /> Save</button>{editing && <button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button>}</div>
        </form>
      }
    >
      <ResponsiveTable headers={['Date', 'Beneficiary', 'Purpose', 'Amount', 'Actions']}>
        {[...records].sort((a, b) => a.date.localeCompare(b.date)).map((row) => (
          <tr key={row.id}>
            <td className="table-cell">{row.date}</td>
            <td className="table-cell font-semibold">{row.beneficiary}</td>
            <td className="table-cell">{row.purpose}</td>
            <td className="table-cell">{formatCurrency(row.amount)}</td>
            <td className="table-cell"><RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} /></td>
          </tr>
        ))}
      </ResponsiveTable>
    </CrudPanel>
  );
}

function ImpressView({
  records,
  editing,
  onSave,
  onEdit,
  onCancel,
  onDelete,
}: {
  records: Array<ImpressRecord & { balance: number }>;
  editing: ImpressRecord | null;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onEdit: (record: ImpressRecord) => void;
  onCancel: () => void;
  onDelete: (record: ImpressRecord) => void;
}) {
  return (
    <CrudPanel
      title="Church Impress"
      total={records.at(-1)?.balance ?? 0}
      totalLabel="Current Balance"
      form={
        <form onSubmit={onSave} className="grid gap-3 bg-stone-50 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <label className="text-sm font-semibold">Date<input className="input mt-1" type="date" name="date" defaultValue={editing?.date} required /></label>
          <label className="text-sm font-semibold lg:col-span-2">Particulars<input className="input mt-1" name="particulars" defaultValue={editing?.particulars} required /></label>
          <label className="text-sm font-semibold">Debit<input className="input mt-1" name="debit" inputMode="decimal" defaultValue={editing?.debit || ''} /></label>
          <label className="text-sm font-semibold">Credit<input className="input mt-1" name="credit" inputMode="decimal" defaultValue={editing?.credit || ''} /></label>
          <div className="flex gap-2 lg:col-span-5"><button className="btn-primary"><Save size={17} /> Save</button>{editing && <button className="btn-secondary" type="button" onClick={onCancel}>Cancel</button>}</div>
        </form>
      }
    >
      <ResponsiveTable headers={['Date', 'Particulars', 'Debit', 'Credit', 'Balance', 'Actions']}>
        {records.map((row) => (
          <tr key={row.id}>
            <td className="table-cell">{row.date}</td>
            <td className="table-cell font-semibold">{row.particulars}</td>
            <td className="table-cell">{formatCurrency(row.debit)}</td>
            <td className="table-cell">{formatCurrency(row.credit)}</td>
            <td className="table-cell font-bold">{formatCurrency(row.balance)}</td>
            <td className="table-cell"><RowActions onEdit={() => onEdit(row)} onDelete={() => onDelete(row)} /></td>
          </tr>
        ))}
      </ResponsiveTable>
    </CrudPanel>
  );
}

function SettingsView({
  data,
  editingParish,
  onSave,
  onSaveParish,
  onEditParish,
  onCancelParish,
  onDeleteParish,
  onBackup,
  onRestore,
}: {
  data: AppData;
  editingParish: Parish | null;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onSaveParish: (event: FormEvent<HTMLFormElement>) => void;
  onEditParish: (parish: Parish) => void;
  onCancelParish: () => void;
  onDeleteParish: (parish: Parish) => void;
  onBackup: () => void;
  onRestore: (file: File | undefined) => void;
}) {
  return (
    <>
      <section>
        <p className="text-sm font-bold uppercase text-palm">Local browser storage</p>
        <h2 className="mt-1 text-3xl font-bold">Settings</h2>
      </section>
      <section className="panel overflow-hidden">
        <form onSubmit={onSave}>
          <div className="border-b border-stone-200 p-4">
            <label className="text-sm font-semibold">Church Name<input className="input mt-1 max-w-xl" name="churchName" defaultValue={data.settings.churchName} required /></label>
          </div>
          <div className="overflow-auto">
            <table className="w-full border-collapse">
              <thead className="table-head">
                <tr>
                  <th className="px-3 py-2">Calculation Rule</th>
                  <th className="px-3 py-2">Rate</th>
                  <th className="px-3 py-2">Enabled</th>
                </tr>
              </thead>
              <tbody>
                {data.settings.categories.map((category) => (
                  <tr key={category.id}>
                    <td className="table-cell font-semibold">{category.name}</td>
                    <td className="table-cell"><input className="input max-w-28" type="number" min="0" max="100" step="0.01" name={`${category.id}.rate`} defaultValue={category.remittanceRate} /></td>
                    <td className="table-cell"><input className="h-5 w-5 accent-teal-700" type="checkbox" name={`${category.id}.enabled`} defaultChecked={category.appliesToRemittance} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2 border-t border-stone-200 p-4">
            <button className="btn-primary" type="submit"><Calculator size={17} /> Save Rules</button>
            <button className="btn-secondary" type="button" onClick={onBackup}><Download size={17} /> Backup Data</button>
            <label className="btn-secondary cursor-pointer"><Upload size={17} /> Restore Data<input className="hidden" type="file" accept="application/json" onChange={(event) => onRestore(event.target.files?.[0])} /></label>
          </div>
        </form>
      </section>
      <section className="panel overflow-hidden">
        <div className="flex items-center gap-2 border-b border-stone-200 p-4">
          <Users size={18} />
          <h3 className="text-lg font-bold">Parishes Under Church</h3>
        </div>
        <form key={editingParish?.id ?? 'new-parish'} onSubmit={onSaveParish} className="grid gap-3 border-b border-stone-200 bg-stone-50 p-4 sm:grid-cols-[minmax(0,1fr)_auto]">
          <label className="text-sm font-semibold">
            Parish Name
            <input className="input mt-1 uppercase" name="parishName" defaultValue={editingParish?.name} placeholder="HOUSE OF PRAISE PARISH" required />
          </label>
          <div className="flex items-end gap-2">
            <button className="btn-primary" type="submit"><Save size={17} /> {editingParish ? 'Save Parish' : 'Add Parish'}</button>
            {editingParish && <button className="btn-secondary" type="button" onClick={onCancelParish}>Cancel</button>}
          </div>
        </form>
        <ResponsiveTable headers={['Parish', 'Actions']}>
          {(data.settings.parishes ?? []).map((parish) => (
            <tr key={parish.id}>
              <td className="table-cell font-semibold">{parish.name}</td>
              <td className="table-cell">
                <RowActions onEdit={() => onEditParish(parish)} onDelete={() => onDeleteParish(parish)} />
              </td>
            </tr>
          ))}
          {!data.settings.parishes?.length && (
            <tr>
              <td className="table-cell text-stone-500" colSpan={2}>No sub-parishes added yet.</td>
            </tr>
          )}
        </ResponsiveTable>
      </section>
      <div className="panel p-4">
        <p className="flex items-center gap-2 text-sm text-stone-600"><Database size={16} /> Data is saved in this browser with IndexedDB. No backend, no API, no server database.</p>
      </div>
    </>
  );
}

function CrudPanel({ title, total, totalLabel = 'Total', form, children }: { title: string; total: number; totalLabel?: string; form: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold uppercase text-palm">{totalLabel}</p>
          <h2 className="mt-1 text-3xl font-bold">{title}</h2>
        </div>
        <Metric label={totalLabel} value={total} />
      </section>
      <section className="panel overflow-hidden">
        {form}
        {children}
      </section>
    </>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="panel p-4">
      <p className="text-xs font-bold uppercase tracking-normal text-stone-500">{label}</p>
      <p className="mt-2 break-words text-xl font-black">{formatCurrency(value)}</p>
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-2">
      <button className="btn-secondary h-8 px-3" type="button" onClick={onEdit}>Edit</button>
      <button className="btn-danger h-8 px-3" type="button" onClick={onDelete}><Trash2 size={15} /></button>
    </div>
  );
}

function ResponsiveTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-auto">
      <table className="w-full min-w-[720px] border-collapse">
        <thead className="table-head">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-2">{header}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export default App;

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppSettings, ExpenditureRecord, ImpressRecord, MonthlyRecord, TransferRecord, WeeklyIncome } from '../types';
import {
  MAIN_PARISH_ID,
  calculateCategoryTotals,
  calculateImpressLedger,
  calculateRedFormRows,
  calculateRemittance,
  formatCurrency,
  getAllParishes,
  getParishName,
  sumAmounts,
} from './calculations';

type ReportInput = {
  settings: AppSettings;
  month: MonthlyRecord;
  incomes: WeeklyIncome[];
  transfers: TransferRecord[];
  expenditures: ExpenditureRecord[];
  impress: ImpressRecord[];
};

export function exportMonthPdf({ settings, month, incomes, transfers, expenditures, impress }: ReportInput) {
  const doc = new jsPDF({ unit: 'pt' });
  const totals = calculateCategoryTotals(incomes, transfers, settings);
  const remittance = calculateRemittance(totals, settings).filter((row) => row.total || row.amount);
  const incomeTotal = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const transferTotal = transfers.reduce((sum, row) => sum + row.amountReceived, 0);
  const expenditureTotal = expenditures.reduce((sum, row) => sum + row.amount, 0);
  const impressLedger = calculateImpressLedger(impress);
  const finalImpress = impressLedger.at(-1)?.balance ?? 0;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings.churchName, 40, 44);
  doc.setFontSize(13);
  doc.text(`${month.heading} Cash & Remittance Report`, 40, 66);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, 40, 84);

  autoTable(doc, {
    startY: 104,
    head: [['Total Cash Income', 'Transfers Received', 'Total Income', 'Total Expenditure', 'Impress Balance']],
    body: [[formatCurrency(incomeTotal - transferTotal), formatCurrency(transferTotal), formatCurrency(incomeTotal), formatCurrency(expenditureTotal), formatCurrency(finalImpress)]],
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 24,
    head: [['Parish', 'Date', ...settings.categories.map((category) => category.name), 'Row Total']],
    body: incomes.map((row) => [
      getParishName(settings, row.parishId),
      row.date,
      ...settings.categories.map((category) => formatCurrency(row.amounts[category.id] || 0)),
      formatCurrency(sumAmounts(row.amounts)),
    ]),
    theme: 'striped',
    styles: { fontSize: 6 },
    headStyles: { fillColor: [86, 107, 79] },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 24,
    head: [['Parish', 'Name', 'Date', 'Received', 'Allocated', 'Difference']],
    body: transfers.map((row) => {
      const allocated = sumAmounts(row.allocations);
      return [getParishName(settings, row.parishId), row.name, row.date, formatCurrency(row.amountReceived), formatCurrency(allocated), formatCurrency(row.amountReceived - allocated)];
    }),
    theme: 'grid',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [183, 121, 31] },
  });

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 24,
    head: [['Category', 'Monthly Total', 'Rate', 'Remittance']],
    body: remittance.map((row) => [row.category.name, formatCurrency(row.total), `${row.category.remittanceRate}%`, formatCurrency(row.amount)]),
    theme: 'striped',
    styles: { fontSize: 8 },
    headStyles: { fillColor: [15, 118, 110] },
  });

  getAllParishes(settings).forEach((parish) => {
    const automaticTotals = calculateCategoryTotals(incomes, transfers, settings, parish.id);
    const manualTotals = month.manualParishTotals?.[parish.id] ?? {};
    const parishTotals = parish.id === MAIN_PARISH_ID
      ? automaticTotals
      : Object.fromEntries(settings.categories.map((category) => [category.id, manualTotals[category.id] ?? automaticTotals[category.id] ?? 0]));
    const parishRemittance = calculateRemittance(parishTotals, settings);
    const redForm = calculateRedFormRows(parishTotals);

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 24,
      head: [[`${parish.name} Summary`, 'Total', 'Returns']],
      body: [
        ...parishRemittance.map((row) => [
          row.category.name,
          formatCurrency(row.total),
          row.category.appliesToRemittance ? formatCurrency(row.amount) : formatCurrency(row.total),
        ]),
        [
          'TOTAL',
          formatCurrency(Object.values(parishTotals).reduce((sum, amount) => sum + amount, 0)),
          formatCurrency(parishRemittance.reduce((sum, row) => sum + row.amount, 0)),
        ],
      ],
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: parish.id === MAIN_PARISH_ID ? [15, 118, 110] : [86, 107, 79] },
    });

    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 16,
      head: [[`${parish.name} Red Form`, 'Total', 'Remittance']],
      body: [
        ...redForm.map((row) => [row.label, formatCurrency(row.total), formatCurrency(row.amount)]),
        ['', 'TOTAL', formatCurrency(redForm.reduce((sum, row) => sum + row.amount, 0))],
      ],
      theme: 'grid',
      styles: { fontSize: 7 },
      headStyles: { fillColor: [159, 58, 56] },
    });
  });

  if (expenditures.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 24,
      head: [['Date', 'Beneficiary', 'Purpose', 'Amount']],
      body: expenditures.map((row) => [row.date, row.beneficiary, row.purpose, formatCurrency(row.amount)]),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [159, 58, 56] },
    });
  }

  if (impressLedger.length) {
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 24,
      head: [['Date', 'Particulars', 'Debit', 'Credit', 'Balance']],
      body: impressLedger.map((row) => [row.date, row.particulars, formatCurrency(row.debit), formatCurrency(row.credit), formatCurrency(row.balance)]),
      theme: 'grid',
      styles: { fontSize: 8 },
      headStyles: { fillColor: [23, 33, 28] },
    });
  }

  doc.save(`${month.heading.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.pdf`);
}

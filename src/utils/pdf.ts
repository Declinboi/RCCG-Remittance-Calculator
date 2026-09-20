import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { AppSettings, ExpenditureRecord, ImpressRecord, MonthlyRecord, Parish, TransferRecord, WeeklyIncome } from '../types';
import {
  MAIN_PARISH_ID,
  WEEK_NUMBERS,
  calculateCategoryTotals,
  calculateImpressBalance,
  calculateImpressLedger,
  calculateRedFormRows,
  calculateRemittance,
  calculateTransferDifference,
  getAllParishes,
  getParishName,
  getWeekNumber,
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

const colors = {
  ink: [23, 33, 28] as [number, number, number],
  muted: [100, 92, 80] as [number, number, number],
  palm: [15, 118, 110] as [number, number, number],
  leaf: [86, 107, 79] as [number, number, number],
  gold: [183, 121, 31] as [number, number, number],
  brick: [159, 58, 56] as [number, number, number],
  paper: [247, 245, 239] as [number, number, number],
  line: [220, 214, 204] as [number, number, number],
  yellow: [255, 224, 102] as [number, number, number],
};

const SUNDAY_SCHOOL_NAME = 'Sunday School';

function highlightSundaySchoolRow(data: any) {
  if (data.section !== 'body') return;
  const raw = data.row.raw as unknown[];
  if (raw[0] === SUNDAY_SCHOOL_NAME) {
    data.cell.styles.fillColor = colors.yellow;
    data.cell.styles.fontStyle = 'bold';
  }
}

const margin = 40;

export function exportMonthPdf({ settings, month, incomes, transfers, expenditures, impress }: ReportInput) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const totals = calculateCategoryTotals(incomes, transfers, settings);
  const remittance = calculateRemittance(totals, settings);
  const incomeTotal = Object.values(totals).reduce((sum, amount) => sum + amount, 0);
  const transferTotal = transfers.reduce((sum, row) => sum + row.amountReceived, 0);
  const expenditureTotal = expenditures.reduce((sum, row) => sum + row.amount, 0);
  const impressLedger = calculateImpressLedger(impress);
  const finalImpress = calculateImpressBalance(impress);

  drawHeader(doc, settings, month);

  autoTable(doc, {
    startY: 118,
    margin: { left: margin, right: margin },
    head: [['Cash Income', 'Transfers', 'Total Income', 'Expenditure', 'Imprest Balance']],
    body: [[money(incomeTotal - transferTotal), money(transferTotal), money(incomeTotal), money(expenditureTotal), money(finalImpress)]],
    showHead: 'firstPage',
    theme: 'grid',
    styles: { fontSize: 9, cellPadding: 8, textColor: colors.ink, lineColor: colors.line, lineWidth: 0.4 },
    headStyles: { fillColor: colors.palm, textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fontStyle: 'bold' },
  });

  sectionTitle(doc, 'Overall Remittance Summary', colors.palm);
  autoTable(doc, {
    startY: nextY(doc),
    margin: { left: margin, right: margin },
    head: [['Category', 'Monthly Total', 'Rate', 'Remittance']],
    body: remittance.map((row) => [
      row.category.name,
      money(row.total),
      row.category.appliesToRemittance ? `${row.category.remittanceRate}%` : '-',
      row.category.appliesToRemittance ? money(row.amount) : '-',
    ]),
    showHead: 'firstPage',
    foot: [['TOTAL', money(incomeTotal), '', money(remittance.reduce((sum, row) => sum + row.amount, 0))]],
    showFoot: 'lastPage',
    theme: 'striped',
    styles: tableStyles(9),
    headStyles: headStyles(colors.palm),
    footStyles: footStyles(colors.palm),
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'center' },
      3: { halign: 'right' },
    },
    didParseCell: highlightSundaySchoolRow,
  });

  getAllParishes(settings).forEach((parish) => {
    const parishTotals = getParishTotals(settings, month, parish, incomes, transfers);
    const parishRemittance = calculateRemittance(parishTotals, settings);
    const parishTotal = Object.values(parishTotals).reduce((sum, amount) => sum + amount, 0);
    const parishReturn = parishRemittance.reduce((sum, row) => sum + row.amount, 0);

    sectionTitle(doc, `${parish.name} Remittance Summary`, parish.id === MAIN_PARISH_ID ? colors.palm : colors.leaf);
    autoTable(doc, {
      startY: nextY(doc),
      margin: { left: margin, right: margin },
      head: [['Description', 'Total', 'Returns']],
      body: parishRemittance.map((row) => [
        row.category.name,
        money(row.total),
        row.category.appliesToRemittance ? money(row.amount) : money(row.total),
      ]),
      showHead: 'firstPage',
      foot: [['TOTAL', money(parishTotal), money(parishReturn)]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: tableStyles(8),
      headStyles: headStyles(parish.id === MAIN_PARISH_ID ? colors.palm : colors.leaf),
      footStyles: footStyles(parish.id === MAIN_PARISH_ID ? colors.palm : colors.leaf),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      didParseCell: highlightSundaySchoolRow,
    });

    sectionTitle(doc, `${parish.name} Red Form`, colors.brick);
    const redForm = calculateRedFormRows(parishTotals, settings);
    autoTable(doc, {
      startY: nextY(doc),
      margin: { left: margin, right: margin },
      head: [['Description', 'Total', 'Remittance']],
      body: redForm.map((row) => [row.label, money(row.total), money(row.amount)]),
      showHead: 'firstPage',
      foot: [['TOTAL', '', money(redForm.reduce((sum, row) => sum + row.amount, 0))]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: tableStyles(8),
      headStyles: headStyles(colors.brick),
      footStyles: footStyles(colors.brick),
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
    });
  });

  WEEK_NUMBERS.forEach((week) => {
    const weekIncomes = incomes.filter((row) => getWeekNumber(row.week) === week);
    const weekTransfers = transfers.filter((row) => getWeekNumber(row.week) === week);
    if (!weekIncomes.length && !weekTransfers.length) return;

    const weekTotals = calculateCategoryTotals(weekIncomes, weekTransfers, settings);
    const weekRemittance = calculateRemittance(weekTotals, settings);
    const weekIncomeTotal = Object.values(weekTotals).reduce((sum, amount) => sum + amount, 0);

    sectionTitle(doc, `Week ${week} Summary`, colors.ink);
    autoTable(doc, {
      startY: nextY(doc),
      margin: { left: margin, right: margin },
      head: [['Category', 'Total', 'Remit']],
      body: weekRemittance.map((row) => [
        row.category.name,
        money(row.total),
        row.category.appliesToRemittance ? money(row.amount) : '-',
      ]),
      showHead: 'firstPage',
      foot: [['TOTAL', money(weekIncomeTotal), money(weekRemittance.reduce((sum, row) => sum + row.amount, 0))]],
      showFoot: 'lastPage',
      theme: 'striped',
      styles: tableStyles(8),
      headStyles: headStyles(colors.ink),
      footStyles: footStyles(colors.ink),
      columnStyles: {
        1: { halign: 'right' },
        2: { halign: 'right' },
      },
      didParseCell: highlightSundaySchoolRow,
    });

    if (weekIncomes.length) {
      sectionTitle(doc, `Week ${week} Cash Income`, colors.leaf);
      autoTable(doc, {
        startY: nextY(doc),
        margin: { left: margin, right: margin },
        head: [['Parish', 'Date', 'Category Breakdown', 'Total']],
        body: weekIncomes.map((row) => [
          getParishName(settings, row.parishId),
          row.date,
          describeAmounts(settings, row.amounts),
          money(sumAmounts(row.amounts)),
        ]),
        showHead: 'firstPage',
        foot: [['', '', 'TOTAL', money(weekIncomes.reduce((sum, row) => sum + sumAmounts(row.amounts), 0))]],
        showFoot: 'lastPage',
        theme: 'striped',
        styles: tableStyles(8),
        headStyles: headStyles(colors.leaf),
        footStyles: footStyles(colors.leaf),
        columnStyles: {
          0: { cellWidth: 115 },
          1: { cellWidth: 70 },
          3: { halign: 'right', cellWidth: 70 },
        },
      });
    }

    if (weekTransfers.length) {
      const weekAllocatedTotal = weekTransfers.reduce((sum, row) => sum + sumAmounts(row.allocations), 0);
      const weekReceivedTotal = weekTransfers.reduce((sum, row) => sum + row.amountReceived, 0);
      const weekDifferenceTotal = weekTransfers.reduce((sum, row) => sum + calculateTransferDifference(row), 0);

      sectionTitle(doc, `Week ${week} Transfers`, colors.gold);
      autoTable(doc, {
        startY: nextY(doc),
        margin: { left: margin, right: margin },
        head: [['Category Breakdown', 'Name', 'Date', 'Received', 'Allocated', 'Difference']],
        body: weekTransfers.map((row) => {
          const allocated = sumAmounts(row.allocations);
          return [
            describeAmounts(settings, row.allocations),
            row.name,
            row.date,
            money(row.amountReceived),
            money(allocated),
            money(calculateTransferDifference(row)),
          ];
        }),
        showHead: 'firstPage',
        foot: [['', '', 'TOTAL', money(weekReceivedTotal), money(weekAllocatedTotal), money(weekDifferenceTotal)]],
        showFoot: 'lastPage',
        theme: 'grid',
        styles: tableStyles(8),
        headStyles: headStyles(colors.gold),
        footStyles: footStyles(colors.gold),
        columnStyles: {
          0: { cellWidth: 150 },
          3: { halign: 'right' },
          4: { halign: 'right' },
          5: { halign: 'right' },
        },
      });
    }
  });

  if (expenditures.length) {
    sectionTitle(doc, 'Church Expenditure', colors.brick);
    autoTable(doc, {
      startY: nextY(doc),
      margin: { left: margin, right: margin },
      head: [['Date', 'Beneficiary', 'Purpose', 'Amount']],
      body: expenditures.map((row) => [row.date, row.beneficiary, row.purpose, money(row.amount)]),
      showHead: 'firstPage',
      foot: [['', '', 'TOTAL', money(expenditureTotal)]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: tableStyles(8),
      headStyles: headStyles(colors.brick),
      footStyles: footStyles(colors.brick),
      columnStyles: { 3: { halign: 'right' } },
    });
  }

  if (impressLedger.length) {
    const totalImpressCredit = impressLedger.reduce((sum, row) => sum + row.credit, 0);
    const totalImpressDebit = impressLedger.reduce((sum, row) => sum + row.debit, 0);
    const totalImpressBalance = impressLedger.reduce((sum, row) => sum + row.balance, 0);

    sectionTitle(doc, 'Church Imprest', colors.ink);
    autoTable(doc, {
      startY: nextY(doc),
      margin: { left: margin, right: margin },
      head: [['Date', 'Particulars', 'Money Delegated (Cr)', 'Money Spent (Dr)', 'Balance']],
      body: impressLedger.map((row) => [row.date, row.particulars, money(row.credit), money(row.debit), money(row.balance)]),
      showHead: 'firstPage',
      foot: [['', 'TOTAL', money(totalImpressCredit), money(totalImpressDebit), money(totalImpressBalance)]],
      showFoot: 'lastPage',
      theme: 'grid',
      styles: tableStyles(8),
      headStyles: headStyles(colors.ink),
      footStyles: footStyles(colors.ink),
      columnStyles: {
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
      },
    });
  }

  addPageNumbers(doc, pageWidth);
  doc.save(`${month.heading.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-report.pdf`);
}

export function exportExpenditurePdf(settings: AppSettings, expenditures: ExpenditureRecord[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const sorted = [...expenditures].sort((a, b) => a.date.localeCompare(b.date));
  const total = sorted.reduce((sum, row) => sum + row.amount, 0);

  drawSimpleHeader(doc, settings, 'Church Expenditure Report');
  autoTable(doc, {
    startY: 118,
    margin: { left: margin, right: margin },
    head: [['Total Expenditure', 'Entries']],
    body: [[money(total), String(sorted.length)]],
    showHead: 'firstPage',
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 8, textColor: colors.ink, lineColor: colors.line, lineWidth: 0.4 },
    headStyles: headStyles(colors.brick),
    bodyStyles: { fontStyle: 'bold' },
  });

  sectionTitle(doc, 'Expenditure Details', colors.brick);
  autoTable(doc, {
    startY: nextY(doc),
    margin: { left: margin, right: margin },
    head: [['Date', 'Beneficiary', 'Purpose', 'Amount']],
    body: sorted.map((row) => [row.date, row.beneficiary, row.purpose, money(row.amount)]),
    showHead: 'firstPage',
    foot: [['', '', 'TOTAL', money(total)]],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: tableStyles(9),
    headStyles: headStyles(colors.brick),
    footStyles: footStyles(colors.brick),
    columnStyles: {
      0: { cellWidth: 82 },
      3: { halign: 'right', cellWidth: 95 },
    },
  });

  addPageNumbers(doc, pageWidth);
  doc.save(`${settings.churchName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-expenditure-report.pdf`);
}

export function exportImpressPdf(settings: AppSettings, impress: ImpressRecord[]) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const ledger = calculateImpressLedger(impress);
  const balance = calculateImpressBalance(impress);
  const totalDebit = ledger.reduce((sum, row) => sum + row.debit, 0);
  const totalCredit = ledger.reduce((sum, row) => sum + row.credit, 0);

  drawSimpleHeader(doc, settings, 'Church Imprest Report');
  autoTable(doc, {
    startY: 118,
    margin: { left: margin, right: margin },
    head: [['Money Delegated (Cr)', 'Money Spent (Dr)', 'Current Balance', 'Entries']],
    body: [[money(totalCredit), money(totalDebit), money(balance), String(ledger.length)]],
    showHead: 'firstPage',
    theme: 'grid',
    styles: { fontSize: 10, cellPadding: 8, textColor: colors.ink, lineColor: colors.line, lineWidth: 0.4 },
    headStyles: headStyles(colors.ink),
    bodyStyles: { fontStyle: 'bold' },
  });

  sectionTitle(doc, 'Imprest Ledger', colors.ink);
  autoTable(doc, {
    startY: nextY(doc),
    margin: { left: margin, right: margin },
    head: [['Date', 'Particulars', 'Money Delegated (Cr)', 'Money Spent (Dr)', 'Balance']],
    body: ledger.map((row) => [row.date, row.particulars, money(row.credit), money(row.debit), money(row.balance)]),
    showHead: 'firstPage',
    foot: [['', 'TOTAL', money(totalCredit), money(totalDebit), money(balance)]],
    showFoot: 'lastPage',
    theme: 'grid',
    styles: tableStyles(9),
    headStyles: headStyles(colors.ink),
    footStyles: footStyles(colors.ink),
    columnStyles: {
      0: { cellWidth: 82 },
      2: { halign: 'right', cellWidth: 86 },
      3: { halign: 'right', cellWidth: 86 },
      4: { halign: 'right', cellWidth: 92 },
    },
  });

  addPageNumbers(doc, pageWidth);
  doc.save(`${settings.churchName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-imprest-report.pdf`);
}

function getParishTotals(
  settings: AppSettings,
  month: MonthlyRecord,
  parish: Parish,
  incomes: WeeklyIncome[],
  transfers: TransferRecord[],
) {
  const automaticTotals = calculateCategoryTotals(incomes, transfers, settings, parish.id);
  const manualTotals = month.manualParishTotals?.[parish.id] ?? {};
  if (parish.id === MAIN_PARISH_ID) return automaticTotals;
  return Object.fromEntries(settings.categories.map((category) => [category.id, manualTotals[category.id] ?? automaticTotals[category.id] ?? 0]));
}

function describeAmounts(settings: AppSettings, amounts: Record<string, number>) {
  const parts = settings.categories
    .map((category) => ({ name: category.name, amount: amounts[category.id] || 0 }))
    .filter((item) => item.amount > 0)
    .map((item) => `${item.name}: ${money(item.amount)}`);
  return parts.length ? parts.join('; ') : '-';
}

function drawHeader(doc: jsPDF, settings: AppSettings, month: MonthlyRecord) {
  drawSimpleHeader(doc, settings, `${month.heading} Cash & Remittance Report`);
}

function drawSimpleHeader(doc: jsPDF, settings: AppSettings, reportTitle: string) {
  doc.setFillColor(...colors.paper);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 96, 'F');
  doc.setDrawColor(...colors.palm);
  doc.setLineWidth(3);
  doc.line(margin, 94, doc.internal.pageSize.getWidth() - margin, 94);
  doc.setTextColor(...colors.ink);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(settings.churchName.toUpperCase(), margin, 42);
  doc.setFontSize(12);
  doc.text(reportTitle, margin, 64);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...colors.muted);
  doc.text(`Generated ${new Date().toLocaleDateString()}`, margin, 82);
}

function sectionTitle(doc: jsPDF, title: string, color: [number, number, number]) {
  let next = nextY(doc, 22);
  if (next > doc.internal.pageSize.getHeight() - 90) {
    doc.addPage();
    next = margin;
  }
  doc.setTextColor(...color);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title.toUpperCase(), margin, next);
  (doc as any).__nextTableY = next + 8;
}

function nextY(doc: jsPDF, gap = 18) {
  const pendingTableY = (doc as any).__nextTableY;
  if (pendingTableY) {
    delete (doc as any).__nextTableY;
    return pendingTableY;
  }
  const lastTable = (doc as any).lastAutoTable;
  return lastTable ? lastTable.finalY + gap : 118;
}

function tableStyles(fontSize: number) {
  return {
    fontSize,
    cellPadding: 5,
    overflow: 'linebreak' as const,
    valign: 'middle' as const,
    textColor: colors.ink,
    lineColor: colors.line,
    lineWidth: 0.3,
  };
}

function headStyles(fillColor: [number, number, number]) {
  return { fillColor, textColor: 255, fontStyle: 'bold' as const };
}

function footStyles(fillColor: [number, number, number]) {
  return { fillColor, textColor: 255, fontStyle: 'bold' as const };
}

function money(amount: number) {
  return `NGN ${Math.round(amount || 0).toLocaleString('en-NG')}`;
}

function addPageNumbers(doc: jsPDF, pageWidth: number) {
  const pageCount = doc.getNumberOfPages();
  for (let index = 1; index <= pageCount; index += 1) {
    doc.setPage(index);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...colors.muted);
    doc.text(`Page ${index} of ${pageCount}`, pageWidth - margin, doc.internal.pageSize.getHeight() - 24, { align: 'right' });
  }
}

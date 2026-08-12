import { db } from '@/lib/db';

export interface ExpenseStatsFilters {
  ulId?: string;
  imputation?: string;
}

export interface ExpenseStatsDataResult {
  period: { from: string; to: string };
  global: {
    totalExpensesAmount: number;
    totalRefundedAmount: number;
    totalPendingAmount: number;
    reportsCount: number;
    avgReportAmount: number;
  };
  byMonth: Array<{
    month: string;
    label: string;
    amount: number;
    count: number;
  }>;
  byUser: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    totalAmount: number;
    paidAmount: number;
    reportCount: number;
  }>;
  byImputation: Array<{
    imputation: string;
    amount: number;
    count: number;
    percentOfTotal: number;
  }>;
  byStatus: Array<{
    status: string;
    label: string;
    amount: number;
    count: number;
  }>;
}

export async function fetchExpenseStatsData(
  dateFrom: string,
  dateTo: string,
  filters?: ExpenseStatsFilters
): Promise<ExpenseStatsDataResult> {
  const args: (string | null)[] = [];
  let whereSql = `1=1`;

  if (filters?.ulId) {
    whereSql += ` AND er.ulId = ?`;
    args.push(filters.ulId);
  }

  whereSql += ` AND DATE(COALESCE(er.submittedAt, er.createdAt)) >= DATE(?) AND DATE(COALESCE(er.submittedAt, er.createdAt)) <= DATE(?)`;
  args.push(dateFrom, dateTo);

  if (filters?.imputation) {
    whereSql += ` AND (er.imputation = ? OR er.customImputation = ?)`;
    args.push(filters.imputation, filters.imputation);
  }

  const reportsResult = await db.execute({
    sql: `
      SELECT er.*, u.name as userName, u.email as userEmail
      FROM "ExpenseReport" er
      JOIN "User" u ON u.id = er.userId
      WHERE ${whereSql}
      ORDER BY COALESCE(er.submittedAt, er.createdAt) DESC
    `,
    args,
  });

  const rows = reportsResult.rows;

  let totalExpensesAmount = 0;
  let totalRefundedAmount = 0;
  let totalPendingAmount = 0;
  const reportsCount = rows.length;

  const monthMap: Record<string, { amount: number; count: number }> = {};
  const userMap: Record<string, { userId: string; userName: string; userEmail: string; totalAmount: number; paidAmount: number; reportCount: number }> = {};
  const imputationMap: Record<string, { amount: number; count: number }> = {};
  const statusMap: Record<string, { amount: number; count: number }> = {
    brouillon: { amount: 0, count: 0 },
    soumis: { amount: 0, count: 0 },
    en_attente_paiement: { amount: 0, count: 0 },
    traité: { amount: 0, count: 0 },
    refusé: { amount: 0, count: 0 },
  };

  rows.forEach((row) => {
    const total = Number(row.total ?? 0);
    const status = String(row.status ?? 'brouillon');
    const dateStr = String(row.submittedAt || row.createdAt || dateFrom);
    const monthKey = dateStr.slice(0, 7); // "YYYY-MM"
    const userId = String(row.userId);
    const userName = String(row.userName || 'Inconnu');
    const userEmail = String(row.userEmail || '');
    const imputation = String(row.customImputation || row.imputation || 'DLUS');

    totalExpensesAmount += total;
    if (status === 'traité') {
      totalRefundedAmount += total;
    } else if (status === 'soumis' || status === 'en_attente_paiement') {
      totalPendingAmount += total;
    }

    // Month stats
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { amount: 0, count: 0 };
    }
    monthMap[monthKey].amount += total;
    monthMap[monthKey].count += 1;

    // User stats
    if (!userMap[userId]) {
      userMap[userId] = { userId, userName, userEmail, totalAmount: 0, paidAmount: 0, reportCount: 0 };
    }
    userMap[userId].totalAmount += total;
    if (status === 'traité') {
      userMap[userId].paidAmount += total;
    }
    userMap[userId].reportCount += 1;

    // Imputation stats
    if (!imputationMap[imputation]) {
      imputationMap[imputation] = { amount: 0, count: 0 };
    }
    imputationMap[imputation].amount += total;
    imputationMap[imputation].count += 1;

    // Status stats
    if (!statusMap[status]) {
      statusMap[status] = { amount: 0, count: 0 };
    }
    statusMap[status].amount += total;
    statusMap[status].count += 1;
  });

  const avgReportAmount = reportsCount > 0 ? totalExpensesAmount / reportsCount : 0;

  // Month list formatted
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  const byMonth = Object.keys(monthMap)
    .sort()
    .map((m) => {
      const [year, monthNum] = m.split('-');
      const monthIdx = parseInt(monthNum, 10) - 1;
      const label = `${monthNames[monthIdx] || monthNum} ${year}`;
      return {
        month: m,
        label,
        amount: Math.round(monthMap[m].amount * 100) / 100,
        count: monthMap[m].count,
      };
    });

  // User list
  const byUser = Object.values(userMap)
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map((u) => ({
      ...u,
      totalAmount: Math.round(u.totalAmount * 100) / 100,
      paidAmount: Math.round(u.paidAmount * 100) / 100,
    }));

  // Imputation list
  const byImputation = Object.keys(imputationMap)
    .map((imp) => {
      const amt = imputationMap[imp].amount;
      return {
        imputation: imp,
        amount: Math.round(amt * 100) / 100,
        count: imputationMap[imp].count,
        percentOfTotal: totalExpensesAmount > 0 ? Math.round((amt / totalExpensesAmount) * 100) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Status list
  const statusLabels: Record<string, string> = {
    brouillon: 'Brouillon',
    soumis: 'Soumis',
    en_attente_paiement: 'En attente de paiement',
    traité: 'Traitée / Payée',
    refusé: 'Refusée',
  };

  const byStatus = Object.keys(statusMap).map((st) => ({
    status: st,
    label: statusLabels[st] || st,
    amount: Math.round(statusMap[st].amount * 100) / 100,
    count: statusMap[st].count,
  }));

  return {
    period: { from: dateFrom, to: dateTo },
    global: {
      totalExpensesAmount: Math.round(totalExpensesAmount * 100) / 100,
      totalRefundedAmount: Math.round(totalRefundedAmount * 100) / 100,
      totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      reportsCount,
      avgReportAmount: Math.round(avgReportAmount * 100) / 100,
    },
    byMonth,
    byUser,
    byImputation,
    byStatus,
  };
}

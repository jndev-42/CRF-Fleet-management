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
  /** Agrégat par budget analytique. ATTENTION : `count` compte des LIGNES de dépense,
   *  là où byImputation.count compte des NOTES. Les deux tableaux voisinent dans /stats. */
  byBudget: Array<{
    budgetId: string | null;
    name: string;
    amount: number;
    count: number;
    percentOfTotal: number;
  }>;
}

/** Ligne de dépense réduite à ce dont l'agrégation par budget a besoin. */
export interface ExpenseItemForBudget {
  budgetId: string | null;
  amount: number;
}

/** Libellé des lignes antérieures à la feature (aucun budget n'a jamais été choisi). */
export const BUDGET_LABEL_NA = 'N/A';
/** Libellé d'une référence de budget qui ne se résout pas — anomalie d'intégrité, jamais fondue dans `N/A`. */
export const BUDGET_LABEL_UNKNOWN = 'Budget inconnu';

/**
 * Extrait les lignes exploitables du JSON `ExpenseReport.items`.
 *
 * Parse défensif volontaire : le format d'`items` a déjà dérivé dans ce repo
 * (`src/app/api/stats/expenses/csv/route.ts` lit `it.description || it.label`).
 * Une note illisible, une ligne mal formée ou un montant non numérique sont
 * ignorés et signalés, sans jamais faire échouer l'agrégation.
 */
export function parseExpenseItemsForBudget(rawItems: unknown, reportId?: string): ExpenseItemForBudget[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(rawItems ?? '[]'));
  } catch {
    console.warn(`[stats-expenses] items illisible sur la note ${reportId ?? '(inconnue)'} — note ignorée dans byBudget`);
    return [];
  }

  if (!Array.isArray(parsed)) {
    console.warn(`[stats-expenses] items n'est pas un tableau sur la note ${reportId ?? '(inconnue)'} — note ignorée dans byBudget`);
    return [];
  }

  const items: ExpenseItemForBudget[] = [];
  parsed.forEach((raw, index) => {
    const item = raw as { budgetId?: unknown; amount?: unknown } | null;
    const amount = Number(item?.amount);
    if (!Number.isFinite(amount)) {
      console.warn(`[stats-expenses] montant non numérique ligne ${index + 1} de la note ${reportId ?? '(inconnue)'} — ligne ignorée`);
      return;
    }
    const budgetId = typeof item?.budgetId === 'string' && item.budgetId.length > 0 ? item.budgetId : null;
    items.push({ budgetId, amount });
  });

  return items;
}

/**
 * Agrège des lignes de dépense par budget analytique.
 *
 * Trois populations strictement distinctes :
 * - `budgetId` absent  → `N/A` (ligne antérieure à la feature) ;
 * - `budgetId` résolu  → nom réel du budget, **archivé compris et sans suffixe** ;
 * - `budgetId` non résolu → entrée à part sous `Budget inconnu`, l'id étant conservé.
 *
 * Fondre le troisième cas dans `N/A` comptabiliserait une anomalie d'intégrité
 * comme de l'historique légitime et priverait le trésorier de tout signal.
 *
 * `percentOfTotal` se calcule sur la somme des montants de LIGNES passés ici,
 * jamais sur la somme des `ExpenseReport.total` : les deux bases divergent dès
 * qu'une note porte un total sans lignes, et les pourcentages ne sommeraient
 * plus à 100.
 */
export function aggregateByBudget(
  items: ExpenseItemForBudget[],
  budgetNames: Map<string, string>,
): ExpenseStatsDataResult['byBudget'] {
  const buckets = new Map<string, { budgetId: string | null; name: string; amount: number; count: number }>();
  const warned = new Set<string>();
  let totalItemsAmount = 0;

  for (const item of items) {
    const amount = Number(item.amount);
    if (!Number.isFinite(amount)) {
      continue;
    }
    const budgetId = item.budgetId ?? null;

    let key: string;
    let name: string;
    if (budgetId === null) {
      key = 'na';
      name = BUDGET_LABEL_NA;
    } else {
      key = `id:${budgetId}`;
      const resolved = budgetNames.get(budgetId);
      if (resolved === undefined) {
        name = BUDGET_LABEL_UNKNOWN;
        if (!warned.has(budgetId)) {
          warned.add(budgetId);
          console.warn(`[stats-expenses] budgetId non résolu dans les statistiques : ${budgetId}`);
        }
      } else {
        name = resolved;
      }
    }

    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { budgetId, name, amount: 0, count: 0 };
      buckets.set(key, bucket);
    }
    bucket.amount += amount;
    bucket.count += 1;
    totalItemsAmount += amount;
  }

  return Array.from(buckets.values())
    .map((b) => ({
      budgetId: b.budgetId,
      name: b.name,
      amount: Math.round(b.amount * 100) / 100,
      count: b.count,
      percentOfTotal: totalItemsAmount > 0 ? Math.round((b.amount / totalItemsAmount) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
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

  // Colonnes énumérées, jamais `er.*` : la table porte des signatures manuscrites
  // et des empreintes de scellement en base64 (userSignature, validatorSignature,
  // payerSignature, signatureRevisions) qui pèsent plusieurs kilo-octets par note
  // et que cette fonction ne lit pas. Les tirer faisait dépasser la limite de
  // taille de réponse du serveur libsql et la requête ne rendait jamais la main.
  const reportsPromise = db.execute({
    sql: `
      SELECT er.id, er.userId, er.submittedAt, er.createdAt, er.status, er.total,
             er.items, er.imputation, er.customImputation,
             u.name as userName, u.email as userEmail
      FROM "ExpenseReport" er
      JOIN "User" u ON u.id = er.userId
      WHERE ${whereSql}
      ORDER BY COALESCE(er.submittedAt, er.createdAt) DESC
    `,
    args,
  });

  // Résolution des noms de budgets, émise EN PARALLÈLE de la requête des notes
  // (latence ajoutée nulle) et scopée sur l'UL demandée (aucune fuite inter-UL :
  // un id étranger ou fabriqué ne se résout pas et retombe sur « Budget inconnu »).
  //
  // Les budgets ARCHIVÉS doivent être résolus : un budget archivé conserve son
  // nom dans les statistiques historiques (l'archivage remplace la suppression).
  // Ne JAMAIS ajouter « AND archived = 0 » ici — cela viderait rétroactivement
  // les bilans d'un exercice clos dès le premier ménage de budgets.
  const budgetsPromise = filters?.ulId
    ? db.execute({ sql: `SELECT id, name FROM "ExpenseBudget" WHERE ulId = ?`, args: [filters.ulId] })
    : db.execute({ sql: `SELECT id, name FROM "ExpenseBudget"`, args: [] });

  const [reportsResult, budgetsResult] = await Promise.all([reportsPromise, budgetsPromise]);

  const rows = reportsResult.rows;

  const budgetNames = new Map<string, string>();
  for (const budgetRow of budgetsResult.rows) {
    budgetNames.set(String(budgetRow.id), String(budgetRow.name ?? ''));
  }

  let totalExpensesAmount = 0;
  let totalRefundedAmount = 0;
  let totalPendingAmount = 0;
  const reportsCount = rows.length;

  // Lignes de dépense de la période, base dédiée de `byBudget` et de son
  // dénominateur de pourcentage — distincte de `totalExpensesAmount`.
  const budgetItems: ExpenseItemForBudget[] = [];

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

    // Budget stats — parse défensif, une note illisible n'invalide pas l'agrégat
    budgetItems.push(...parseExpenseItemsForBudget(row.items, String(row.id ?? '')));

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

  const byBudget = aggregateByBudget(budgetItems, budgetNames);

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
    byBudget,
  };
}

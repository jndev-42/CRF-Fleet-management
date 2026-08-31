import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { fetchExpenseStatsData } from '@/lib/stats-expenses';

function csvEscape(value: unknown): string {
  const raw = value == null ? '' : String(value);
  // Neutralisation de l'injection de formule : un champ libre commençant par
  // =, +, - ou @ est interprété comme une formule par Excel et LibreOffice.
  // Les noms de budget et l'imputation « Autre » sont saisis par l'utilisateur.
  const str = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

const postSchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
}).refine(
  (data) => new Date(data.dateTo).getTime() >= new Date(data.dateFrom).getTime(),
  { message: 'La date de début doit être antérieure à la date de fin.', path: ['dateFrom'] }
);

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return unauthorizedResponse();
    }

    const roles = (session.user.roles || []) as string[];
    const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
    const isTresorier = roles.includes('TRESORIER');

    if (!isManager && !isTresorier) {
      return forbiddenResponse('Accès réservé aux gestionnaires (Président, Trésorier, Super Admin)');
    }

    const ulId = (session.user.ulId as string) || 'ul-paris-18';

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Paramètres invalides', details: parsed.error.issues }, { status: 400 });
    }

    const { dateFrom, dateTo } = parsed.data;

    const result = await db.execute({
      sql: `
        SELECT
          er.id,
          er.submittedAt,
          er.createdAt,
          er.status,
          u.name AS userName,
          u.email AS userEmail,
          er.imputation,
          er.customImputation,
          er.requestRefund,
          er.noReceiptDeclaration,
          er.total,
          er.items
        FROM "ExpenseReport" er
        JOIN "User" u ON u.id = er.userId
        WHERE er.ulId = ?
          AND DATE(COALESCE(er.submittedAt, er.createdAt)) >= DATE(?)
          AND DATE(COALESCE(er.submittedAt, er.createdAt)) <= DATE(?)
        ORDER BY COALESCE(er.submittedAt, er.createdAt) DESC
      `,
      args: [ulId, dateFrom, dateTo],
    });

    const statusLabels: Record<string, string> = {
      brouillon: 'Brouillon',
      soumis: 'Soumis',
      en_attente_paiement: 'En attente de paiement',
      traité: 'Traitée / Payée',
      refusé: 'Refusée',
    };

    const headers = [
      'ID Note',
      'Date soumission',
      'Statut',
      'Demandeur',
      'Email demandeur',
      'Imputation',
      'Detail Imputation',
      'Remboursement demande',
      'Declaration sans justificatif',
      'Total (EUR)',
      'Nb d\'articles',
      'Détail des lignes de dépense',
    ];

    const rows = result.rows.map((r) => {
      const submittedDate = String(r.submittedAt || r.createdAt || '');
      const status = statusLabels[String(r.status)] || String(r.status);
      const imp = String(r.imputation || 'DLUS');
      const customImp = r.customImputation ? String(r.customImputation) : '';
      const requestRefund = Number(r.requestRefund) === 1 ? 'Oui' : 'Non';
      const noReceipt = Number(r.noReceiptDeclaration) === 1 ? 'Oui' : 'Non';
      const total = Number(r.total ?? 0).toFixed(2);

      let itemsSummary = '';
      let itemCount = 0;
      try {
        const itemsArr = JSON.parse(String(r.items || '[]'));
        if (Array.isArray(itemsArr)) {
          itemCount = itemsArr.length;
          itemsSummary = itemsArr.map((it: { description?: string; amount?: number; label?: string }) => `${it.description || it.label || 'Ligne'}: ${Number(it.amount || 0).toFixed(2)}€`).join(' | ');
        }
      } catch {
        // Fallback
      }

      return [
        r.id,
        submittedDate,
        status,
        r.userName,
        r.userEmail,
        imp,
        customImp,
        requestRefund,
        noReceipt,
        total,
        itemCount,
        itemsSummary,
      ].map(csvEscape).join(',');
    });

    // Sous-tableau « Par budget », alimenté par l'agrégation partagée des stats.
    // Second parcours de la même période, assumé : le CSV par note ci-dessus ne
    // passe pas par `fetchExpenseStatsData`. Les deux prédicats restent alignés
    // (même `ulId`, mêmes bornes de dates).
    const stats = await fetchExpenseStatsData(dateFrom, dateTo, { ulId });
    const budgetSection = [
      '',
      '',
      ['Budget', 'Lignes', 'Montant (EUR)', 'Part (%)'].map(csvEscape).join(','),
      ...stats.byBudget.map((b) => [
        b.name,
        b.count,
        b.amount.toFixed(2),
        b.percentOfTotal,
      ].map(csvEscape).join(',')),
    ];

    const csv = [headers.map(csvEscape).join(','), ...rows, ...budgetSection].join('\n');
    const buffer = Buffer.from('\uFEFF' + csv, 'utf-8');

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="notes-de-frais-martine.csv"',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('[POST /api/stats/expenses/csv]', error);
    return NextResponse.json({ error: 'Erreur lors de la génération du CSV des notes de frais' }, { status: 500 });
  }
}

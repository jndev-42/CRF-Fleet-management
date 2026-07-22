import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';

declare global {
  var __expenseCsvJobs: Map<string, { buffer: Buffer; createdAt: number }> | undefined;
}

function getJobsMap(): Map<string, { buffer: Buffer; createdAt: number }> {
  if (!global.__expenseCsvJobs) global.__expenseCsvJobs = new Map();
  return global.__expenseCsvJobs;
}

function cleanupOldJobs() {
  const jobs = getJobsMap();
  const tenMinutes = 10 * 60 * 1000;
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > tenMinutes) jobs.delete(id);
  }
}

function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
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
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const roles = (session.user.roles || []) as string[];
    const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
    const isTresorier = roles.includes('TRESORIER');

    if (!isManager && !isTresorier) {
      return NextResponse.json({ error: 'Accès réservé aux gestionnaires (Président, Trésorier, Super Admin)' }, { status: 403 });
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
          er.items,
          er.photos
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

    const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
    const buffer = Buffer.from('\uFEFF' + csv, 'utf-8');

    cleanupOldJobs();
    const jobId = crypto.randomUUID();
    getJobsMap().set(jobId, { buffer, createdAt: Date.now() });

    return NextResponse.json({ jobId, status: 'ready' });
  } catch (error) {
    console.error('[POST /api/stats/expenses/csv]', error);
    return NextResponse.json({ error: 'Erreur lors de la génération du CSV des notes de frais' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const roles = (session.user.roles || []) as string[];
    const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
    const isTresorier = roles.includes('TRESORIER');

    if (!isManager && !isTresorier) {
      return NextResponse.json({ error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'jobId manquant' }, { status: 400 });

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(jobId)) {
      return NextResponse.json({ error: 'jobId invalide' }, { status: 400 });
    }

    const job = getJobsMap().get(jobId);
    if (!job) return NextResponse.json({ error: 'Export non trouvé ou expiré' }, { status: 404 });

    return new NextResponse(new Uint8Array(job.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="notes-de-frais-martine.csv"',
        'Content-Length': String(job.buffer.length),
      },
    });
  } catch (error) {
    console.error('[GET /api/stats/expenses/csv]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

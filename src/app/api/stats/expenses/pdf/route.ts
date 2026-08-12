import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchExpenseStatsData } from '@/lib/stats-expenses';
import { db } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import ExpenseStatsPdfDocument from '@/components/stats/ExpenseStatsPdfDocument';
import path from 'path';
import sharp from 'sharp';

declare global {
  var __expensePdfJobs: Map<string, { buffer: Buffer; createdAt: number }> | undefined;
}

function getJobsMap(): Map<string, { buffer: Buffer; createdAt: number }> {
  if (!global.__expensePdfJobs) global.__expensePdfJobs = new Map();
  return global.__expensePdfJobs;
}

function cleanupOldJobs() {
  const jobs = getJobsMap();
  const tenMinutes = 10 * 60 * 1000;
  const now = Date.now();
  for (const [id, job] of jobs.entries()) {
    if (now - job.createdAt > tenMinutes) jobs.delete(id);
  }
}

const postSchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
});

async function generateExpensePdf(dateFrom: string, dateTo: string, ulId: string): Promise<Buffer> {
  const data = await fetchExpenseStatsData(dateFrom, dateTo, { ulId });

  const ulResult = await db.execute({
    sql: `SELECT name FROM "UniteLocale" WHERE id = ? LIMIT 1`,
    args: [ulId],
  });
  const ulName = String(ulResult.rows[0]?.name || 'Unité Locale');

  const generatedAt = new Date().toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const logoPng = await sharp(path.join(process.cwd(), 'public', 'crf-logo.svg'))
    .resize(96, 96)
    .png()
    .toBuffer();
  const logoSrc = `data:image/png;base64,${logoPng.toString('base64')}`;

  const element = createElement(ExpenseStatsPdfDocument, {
    data,
    ulName,
    dateFrom,
    dateTo,
    generatedAt,
    logoSrc,
  }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;

  const buffer = await renderToBuffer(element);

  return Buffer.from(buffer);
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const roles = (session.user.roles || []) as string[];
    const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
    const isTresorier = roles.includes('TRESORIER');

    if (!isManager && !isTresorier) {
      return NextResponse.json({ success: false, error: 'Accès réservé aux gestionnaires (Président, Trésorier, Super Admin)' }, { status: 403 });
    }

    const ulId = (session.user.ulId as string) || 'ul-paris-18';

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });
    }

    const { dateFrom, dateTo } = parsed.data;

    cleanupOldJobs();

    const buffer = await generateExpensePdf(dateFrom, dateTo, ulId);

    const jobId = crypto.randomUUID();
    getJobsMap().set(jobId, { buffer, createdAt: Date.now() });

    return NextResponse.json({ success: true, jobId, status: 'ready' });
  } catch (error) {
    console.error('[POST /api/stats/expenses/pdf]', error);
    return NextResponse.json({ success: false, error: 'Erreur lors de la génération du PDF des notes de frais' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const roles = (session.user.roles || []) as string[];
    const isManager = roles.includes('SUPER_ADMIN') || roles.includes('PRESIDENT');
    const isTresorier = roles.includes('TRESORIER');

    if (!isManager && !isTresorier) {
      return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (!jobId) {
      return NextResponse.json({ success: false, error: 'jobId manquant' }, { status: 400 });
    }

    const job = getJobsMap().get(jobId);
    if (!job) {
      return NextResponse.json({ success: false, error: 'PDF non trouvé ou expiré' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(job.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="stats-notes-de-frais-martine.pdf"',
        'Content-Length': String(job.buffer.length),
      },
    });
  } catch (error) {
    console.error('[GET /api/stats/expenses/pdf]', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

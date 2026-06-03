import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer } from '@react-pdf/renderer';
import { createElement } from 'react';
import IncidentPdfDocument from '@/components/incident/IncidentPdfDocument';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';

declare global {
  var __pdfJobs: Map<string, { buffer: Buffer; createdAt: number }> | undefined;
}

function getJobsMap(): Map<string, { buffer: Buffer; createdAt: number }> {
  if (!global.__pdfJobs) {
    global.__pdfJobs = new Map();
  }
  return global.__pdfJobs;
}

async function generateIncidentPdf(reportId: string): Promise<Buffer> {
  const result = await db.execute({
    sql: `SELECT ir.*, v.name as vehicleName, v.plate as vehiclePlate, u.name as userName, u.email as userEmail
          FROM IncidentReport ir
          JOIN Vehicle v ON v.id = ir.vehicleId
          JOIN User u ON u.id = ir.userId
          WHERE ir.id = ?`,
    args: [reportId],
  });

  if (result.rows.length === 0) throw new Error('Report not found');

  const report = result.rows[0] as unknown as Record<string, unknown>;

  // Parse JSON
  const jsonFields = ['flashDetails', 'accidentDetails', 'damages', 'victims', 'actions', 'context'];
  jsonFields.forEach(field => {
    if (report[field] && typeof report[field] === 'string') {
      report[field] = JSON.parse(report[field] as string);
    }
  });

  const logoPng = await sharp(path.join(process.cwd(), 'public', 'crf-logo.svg'))
    .resize(96, 96)
    .png()
    .toBuffer();
  const logoSrc = `data:image/png;base64,${logoPng.toString('base64')}`;

  const element = createElement(IncidentPdfDocument, {
    report: report as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- interface mismatch with record
    logoSrc,
    generatedAt: new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }),
  });

  const buffer = await renderToBuffer(element as React.ReactElement);
  return Buffer.from(buffer);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
    }

    const buffer = await generateIncidentPdf(id);
    const jobId = crypto.randomUUID();
    getJobsMap().set(jobId, { buffer, createdAt: Date.now() });

    return NextResponse.json({ success: true, jobId });
  } catch (error) {
    console.error('[POST /api/incidents/[id]/pdf]', error);
    return NextResponse.json({ error: 'Erreur lors de la génération du PDF' }, { status: 500 });
  }
}

export async function GET(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non autorisé' }, { status: 401 });
        }

        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('jobId');

        if (!jobId) {
            return NextResponse.json({ error: 'jobId manquant' }, { status: 400 });
        }

        const jobs = getJobsMap();
        const job = jobs.get(jobId);

        if (!job) {
            return NextResponse.json({ error: 'PDF non trouvé ou expiré' }, { status: 404 });
        }

        return new NextResponse(new Uint8Array(job.buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="incident-report-${(await params).id}.pdf"`,
                'Content-Length': String(job.buffer.length),
            },
        });
    } catch (error) {
        console.error('[GET /api/incidents/[id]/pdf]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

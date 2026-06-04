import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import IncidentPdfDocument from '@/components/incident/IncidentPdfDocument';
import path from 'path';
import sharp from 'sharp';
import crypto from 'crypto';
import { getDriveClient } from '@/lib/drive';

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

  // Fetch photos from Drive if driveFolderId exists
  const photos: string[] = [];
  if (report.driveFolderId) {
    try {
        const drive = getDriveClient();

        // List subfolders (emprunt/rendu are not used here, it's 'incident' stage)
        const subfoldersRes = await drive.files.list({
            q: `'${report.driveFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
            fields: 'files(id, name)',
        });

        const subfolders = subfoldersRes.data.files || [];
        for (const folder of subfolders) {
            const filesRes = await drive.files.list({
                q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                fields: 'files(id, mimeType)',
            });
            const files = filesRes.data.files || [];
            for (const file of files) {
                if (file.id) {
                    try {
                        const imgRes = await drive.files.get(
                            { fileId: file.id, alt: 'media' },
                            { responseType: 'arraybuffer' }
                        );
                        const buffer = Buffer.from(imgRes.data as ArrayBuffer);
                        const base64 = buffer.toString('base64');
                        photos.push(`data:${file.mimeType || 'image/jpeg'};base64,${base64}`);
                    } catch (imgErr) {
                        console.error(`Failed to fetch image ${file.id} for PDF:`, imgErr);
                    }
                }
            }
        }
    } catch (photoErr) {
        console.error('Error fetching photos for PDF:', photoErr);
    }
  }

  const element = createElement(IncidentPdfDocument, {
    report: report as unknown as Parameters<typeof IncidentPdfDocument>[0]['report'],
    logoSrc,
    generatedAt: new Date().toLocaleDateString('fr-FR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    }),
    photos,
  }) as unknown as ReactElement<DocumentProps, JSXElementConstructor<DocumentProps>>;

  const buffer = await renderToBuffer(element);
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

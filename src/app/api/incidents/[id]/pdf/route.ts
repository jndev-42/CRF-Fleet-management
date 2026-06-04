import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import IncidentPdfDocument from '@/components/incident/IncidentPdfDocument';
import path from 'path';
import sharp from 'sharp';
import { getDriveClient } from '@/lib/drive';

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

  const report = { ...result.rows[0] } as unknown as Record<string, unknown>;

  // Parse JSON
  const jsonFields = ['flashDetails', 'accidentDetails', 'damages', 'victims', 'actions', 'context'];
  jsonFields.forEach(field => {
    if (report[field] && typeof report[field] === 'string') {
      report[field] = JSON.parse(report[field] as string);
    }
  });

  // Format occurredAt to a nice French date string if it exists
  if (report.occurredAt && typeof report.occurredAt === 'string') {
      const parts = report.occurredAt.split('T');
      if (parts.length === 2) {
          const dateParts = parts[0].split('-');
          if (dateParts.length === 3) {
              report.occurredAt = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]} à ${parts[1]}`;
          }
      }
  }

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

        // Check if report.driveFolderId contains folders or images
        const childrenRes = await drive.files.list({
            q: `'${report.driveFolderId}' in parents and trashed=false`,
            fields: 'files(id, name, mimeType)',
        });
        const children = childrenRes.data.files || [];
        
        let imageFiles = children.filter(f => f.mimeType?.includes('image/'));
        const subfolders = children.filter(f => f.mimeType === 'application/vnd.google-apps.folder');

        if (subfolders.length > 0) {
            // Legacy case: it's a parent folder, find the 'incident' folders
            for (const folder of subfolders) {
                if (folder.name?.startsWith('incident')) {
                    const filesRes = await drive.files.list({
                        q: `'${folder.id}' in parents and mimeType contains 'image/' and trashed=false`,
                        fields: 'files(id, mimeType)',
                    });
                    const files = filesRes.data.files || [];
                    imageFiles = imageFiles.concat(files);
                }
            }
        }

        for (const file of imageFiles) {
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

export async function GET(
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

        return new NextResponse(new Uint8Array(buffer), {
            status: 200,
            headers: {
                'Content-Type': 'application/pdf',
                'Content-Disposition': `attachment; filename="incident-report-${id}.pdf"`,
                'Content-Length': String(buffer.length),
            },
        });
    } catch (error) {
        console.error('[GET /api/incidents/[id]/pdf]', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

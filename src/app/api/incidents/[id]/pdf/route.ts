import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import IncidentPdfDocument from '@/components/incident/IncidentPdfDocument';
import path from 'path';
import sharp from 'sharp';
import { isR2Ref } from '@/lib/media/refs';
import { listMediaFiles } from '@/lib/media/server';
import { canViewIncident, type IncidentViewer } from '@/lib/incidentAccess';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

async function generateIncidentPdf(reportId: string): Promise<Buffer> {
  const result = await db.execute({
    // Pas de jointure sur User : le document est anonyme par construction, l'identité
    // du déclarant n'a donc aucune raison d'être chargée ici. La retirer de la requête
    // plutôt que de la laisser inutilisée évite qu'un futur champ l'imprime par accident.
    sql: `SELECT ir.*, v.name as vehicleName, v.plate as vehiclePlate
          FROM IncidentReport ir
          JOIN Vehicle v ON v.id = ir.vehicleId
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

  // Photos : préfixe R2 (`incident-photos/…`) ; une référence non R2 (id Drive résiduel) n'en a aucune.
  const photos: string[] = [];
  if (isR2Ref(report.driveFolderId)) {
    try {
        const { getObject } = await import('@/lib/r2');
        const files = (await listMediaFiles(report.driveFolderId)).filter(f => f.mimeType.startsWith('image/'));
        for (const file of files) {
            try {
                const buffer = await getObject(file.id);
                if (buffer) photos.push(`data:${file.mimeType};base64,${buffer.toString('base64')}`);
            } catch (imgErr) {
                console.error(`Failed to fetch image ${file.id} for PDF:`, imgErr);
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
        if (!session?.user?.id) {
            return unauthorizedResponse();
        }

        // Le PDF porte les mêmes règles de lecture que le détail : un membre de l'UL
        // télécharge tout rapport SOUMIS de ses véhicules. Le document lui-même ne
        // porte aucun nom de déclarant — il est anonyme par construction.
        const accessRes = await db.execute({
            sql: `SELECT ir.userId, ir.status, v.ulId as vehicleUlId
                  FROM IncidentReport ir
                  JOIN Vehicle v ON v.id = ir.vehicleId
                  WHERE ir.id = ?`,
            args: [id],
        });
        const accessRow = accessRes.rows[0];
        if (!accessRow) {
            return NextResponse.json({ error: 'Rapport introuvable' }, { status: 404 });
        }

        const viewer: IncidentViewer = {
            userId: session.user.id,
            ulId: session.user.ulId,
            roles: session.user.roles || [],
        };
        const canView = canViewIncident(viewer, {
            authorId: String(accessRow.userId),
            vehicleUlId: (accessRow.vehicleUlId as string | null) ?? null,
            status: String(accessRow.status),
        });
        if (!canView) {
            return forbiddenResponse();
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

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchStatsData } from '@/lib/stats-trips';
import { db } from '@/lib/db';
import { z } from 'zod';
import { renderToBuffer, type DocumentProps } from '@react-pdf/renderer';
import { createElement, type JSXElementConstructor, type ReactElement } from 'react';
import StatsPdfDocument from '@/components/stats/StatsPdfDocument';
import path from 'path';
import sharp from 'sharp';

const postSchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
});

async function generatePdf(dateFrom: string, dateTo: string): Promise<Buffer> {
  const data = await fetchStatsData(dateFrom, dateTo);

  const incidentRows = await db.execute({
    sql: `SELECT t.checkOutAt, u.name AS driverName, v.name as vehicleName, t.incident
      FROM Trip t
      JOIN Vehicle v ON v.id = t.vehicleId
      JOIN "User" u ON u.id = t.driverId
      WHERE DATE(t.checkOutAt) >= ? AND DATE(t.checkOutAt) <= ?
        AND t.incident IS NOT NULL AND t.incident != ''
      ORDER BY t.checkOutAt ASC`,
    args: [dateFrom, dateTo],
  });

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

  const element = createElement(StatsPdfDocument, {
    data,
    incidentRows: incidentRows.rows.map((r) => ({
      checkOutAt: String(r.checkOutAt),
      driverName: String(r.driverName),
      vehicleName: String(r.vehicleName),
      incident: String(r.incident),
    })),
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

    const roles = (session.user.roles || ['INACTIF']) as string[];
    if (roles.length === 0 || (roles.length === 1 && roles[0] === 'INACTIF')) {
      return NextResponse.json({ success: false, error: 'Accès non autorisé' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });
    }

    const { dateFrom, dateTo } = parsed.data;

    const buffer = await generatePdf(dateFrom, dateTo);

    // NextResponse body must be BodyInit-compatible — convert Buffer to Uint8Array
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="stats-martine.pdf"',
        'Content-Length': String(buffer.length),
      },
    });
  } catch (error) {
    console.error('[POST /api/stats/pdf]', error);
    return NextResponse.json({ success: false, error: 'Erreur lors de la génération du PDF' }, { status: 500 });
  }
}

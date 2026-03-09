import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { z } from 'zod';
import crypto from 'crypto';

declare global {
  var __csvJobs: Map<string, { buffer: Buffer; createdAt: number }> | undefined;
}

function getJobsMap(): Map<string, { buffer: Buffer; createdAt: number }> {
  if (!global.__csvJobs) global.__csvJobs = new Map();
  return global.__csvJobs;
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
});

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Paramètres manquants' }, { status: 400 });
    }

    const { dateFrom, dateTo } = parsed.data;

    const result = await db.execute({
      sql: `SELECT
              t.id,
              t.checkOutAt,
              t.checkInAt,
              t.driverName,
              t.driverEmail,
              t.secondDriverName,
              t.secondDriverEmail,
              v.name  AS vehicleName,
              v.plate AS vehiclePlate,
              t.missionType,
              t.missionName,
              t.mileageOut,
              t.mileageIn,
              t.fuelOut,
              t.fuelIn,
              t.conditionOut,
              t.conditionIn,
              t.cleanlinessOut,
              t.cleanlinessIn,
              t.parkingOut,
              t.parkingIn,
              t.dsaChecked,
              t.dsaUsed,
              t.windowsClosed,
              t.vehicleInspected,
              t.incident,
              t.commentsOut,
              t.commentsIn
            FROM Trip t
            JOIN Vehicle v ON v.id = t.vehicleId
            WHERE t.checkOutAt >= ? AND t.checkOutAt <= ?
            ORDER BY t.checkOutAt DESC`,
      args: [dateFrom, dateTo],
    });

    const headers = [
      'ID', 'Date depart', 'Date retour', 'Chauffeur', 'Email chauffeur',
      '2e chauffeur', 'Email 2e chauffeur', 'Vehicule', 'Plaque',
      'Type de mission', 'Nom de mission',
      'Km depart', 'Km retour', 'Km parcourus',
      'Carburant depart (%)', 'Carburant retour (%)',
      'Etat depart', 'Etat retour',
      'Proprete depart', 'Proprete retour',
      'Parking depart', 'Parking retour',
      'DSA verifie', 'DSA utilise',
      'Fenetres fermees', 'Vehicule inspecte',
      'Incident', 'Commentaires depart', 'Commentaires retour',
    ];

    const rows = result.rows.map((t) => {
      const mileageOut = t.mileageOut as number | null;
      const mileageIn = t.mileageIn as number | null;
      return [
        t.id, t.checkOutAt, t.checkInAt,
        t.driverName, t.driverEmail,
        t.secondDriverName, t.secondDriverEmail,
        t.vehicleName, t.vehiclePlate,
        t.missionType, t.missionName,
        mileageOut, mileageIn,
        mileageOut != null && mileageIn != null ? mileageIn - mileageOut : '',
        t.fuelOut, t.fuelIn,
        t.conditionOut, t.conditionIn,
        t.cleanlinessOut, t.cleanlinessIn,
        t.parkingOut, t.parkingIn,
        t.dsaChecked ? 'Oui' : 'Non',
        t.dsaUsed ? 'Oui' : 'Non',
        t.windowsClosed ? 'Oui' : 'Non',
        t.vehicleInspected ? 'Oui' : 'Non',
        t.incident, t.commentsOut, t.commentsIn,
      ].map(csvEscape).join(',');
    });

    const csv = [headers.map(csvEscape).join(','), ...rows].join('\n');
    const buffer = Buffer.from('\uFEFF' + csv, 'utf-8');

    cleanupOldJobs();
    const jobId = crypto.randomUUID();
    getJobsMap().set(jobId, { buffer, createdAt: Date.now() });

    return NextResponse.json({ jobId, status: 'ready' });
  } catch (error) {
    console.error('[POST /api/stats/csv]', error);
    return NextResponse.json({ error: 'Erreur lors de la génération du CSV' }, { status: 500 });
  }
}

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');
    if (!jobId) return NextResponse.json({ error: 'jobId manquant' }, { status: 400 });

    const job = getJobsMap().get(jobId);
    if (!job) return NextResponse.json({ error: 'Export non trouvé ou expiré' }, { status: 404 });

    return new NextResponse(new Uint8Array(job.buffer), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="trips-cr-chauffeur.csv"`,
        'Content-Length': String(job.buffer.length),
      },
    });
  } catch (error) {
    console.error('[GET /api/stats/csv]', error);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

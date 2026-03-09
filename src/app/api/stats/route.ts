import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchStatsData } from '@/lib/stats';
import { z } from 'zod';

const querySchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
});

export async function GET(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, error: 'Non autorisé' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });
    }

    const { dateFrom, dateTo } = parsed.data;

    const fromDate = new Date(dateFrom);
    const toDate = new Date(dateTo);
    const diffDays = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24);

    if (diffDays > 62) {
      return NextResponse.json(
        { success: false, error: "La plage de dates est limitée à 62 jours pour l'affichage." },
        { status: 400 }
      );
    }

    if (diffDays < 0) {
      return NextResponse.json(
        { success: false, error: 'La date de début doit être antérieure à la date de fin.' },
        { status: 400 }
      );
    }

    const data = await fetchStatsData(dateFrom, dateTo);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/stats]', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

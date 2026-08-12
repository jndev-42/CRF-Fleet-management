import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { fetchExpenseStatsData } from '@/lib/stats-expenses';
import { z } from 'zod';

const querySchema = z.object({
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
  imputation: z.string().optional(),
});

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
      return NextResponse.json(
        { success: false, error: 'Accès réservé aux gestionnaires (Président, Trésorier, Super Admin)' },
        { status: 403 }
      );
    }

    const ulId = (session.user.ulId as string) || 'ul-paris-18';

    const { searchParams } = new URL(request.url);
    const parsed = querySchema.safeParse({
      dateFrom: searchParams.get('dateFrom'),
      dateTo: searchParams.get('dateTo'),
      imputation: searchParams.get('imputation') ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: 'Paramètres invalides' }, { status: 400 });
    }

    const { dateFrom, dateTo, imputation } = parsed.data;

    const data = await fetchExpenseStatsData(dateFrom, dateTo, {
      ulId,
      imputation,
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[GET /api/stats/expenses]', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur' }, { status: 500 });
  }
}

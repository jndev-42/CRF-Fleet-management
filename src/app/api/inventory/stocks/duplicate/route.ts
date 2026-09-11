import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import { isAdminOrAbove } from '@/lib/roles';
import { duplicateStock } from '@/lib/inventory/stocks';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

// La duplication écrit 1 + 2N lignes ; on laisse de la marge sur un gros stock.
export const maxDuration = 30;

const duplicateStockSchema = z.object({
    sourceStockId: z.string().min(1),
    name: z.string().min(1),
    copyStock: z.boolean().default(false),
});

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const userRoles = (session.user.roles ?? []) as string[];
        if (!isAdminOrAbove(userRoles)) {
            return forbiddenResponse();
        }

        const body = await request.json();
        let parsed: z.infer<typeof duplicateStockSchema>;
        try {
            parsed = duplicateStockSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Nom et stock source requis', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        const { sourceStockId, copyStock } = parsed;
        const name = parsed.name.trim();
        if (!name) {
            return NextResponse.json({ error: 'Nom et stock source requis' }, { status: 400 });
        }

        const result = await duplicateStock({
            sourceStockId,
            name,
            ulId: session.user.ulId || 'default',
            userName: session.user.name || session.user.email || 'Inconnu',
            copyStock,
        });

        if (!result) {
            return NextResponse.json({ error: 'Stock source introuvable' }, { status: 404 });
        }

        return NextResponse.json(result, { status: 201 });
    } catch (e) {
        console.error('POST /api/inventory/stocks/duplicate error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de la duplication du stock' }, { status: 500 });
    }
}

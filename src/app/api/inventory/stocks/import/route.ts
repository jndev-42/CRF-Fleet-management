import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getErrorMessage } from '@/lib/utils/error';
import { isAdminOrAbove } from '@/lib/roles';
import { parseStockCsv } from '@/lib/inventory/csvImport';
import { importStockFromCsv } from '@/lib/inventory/stocks';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

// Lecture d'un fichier via `formData()` : le runtime Edge ne convient pas.
export const runtime = 'nodejs';

// Un import de 2000 articles écrit plus de 6000 lignes ; on laisse de la marge.
export const maxDuration = 30;

/** 2 Mo : très au-delà d'un CSV de 2000 lignes, et sous la limite de corps Vercel. */
const MAX_FILE_SIZE = 2 * 1024 * 1024;

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

        const formData = await request.formData();
        const rawName = formData.get('name');
        const file = formData.get('file');

        const name = typeof rawName === 'string' ? rawName.trim() : '';
        if (!name) {
            return NextResponse.json({ error: 'Le nom du stock est requis' }, { status: 400 });
        }

        if (!(file instanceof File)) {
            return NextResponse.json({ error: 'Un fichier CSV est requis' }, { status: 400 });
        }

        // Validation par extension et non par type MIME : le navigateur annonce un
        // type instable pour un CSV (`text/csv`, `application/vnd.ms-excel`, vide…).
        if (!file.name.toLowerCase().endsWith('.csv')) {
            return NextResponse.json({ error: 'Le fichier doit être au format CSV (.csv)' }, { status: 400 });
        }

        // `request.formData()` a déjà bufferisé tout le corps multipart (fichier inclus)
        // avant qu'on puisse lire `file.size` : ce plafond ne protège donc pas contre la
        // bufferisation initiale, seulement contre le décodage/parsing CSV d'un fichier
        // hors limite, qui serait plus coûteux encore.
        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json(
                { error: `Le fichier (${(file.size / (1024 * 1024)).toFixed(1)} Mo) dépasse la taille maximale autorisée de 2 Mo.` },
                { status: 400 }
            );
        }

        const parsed = parseStockCsv(await file.text());
        if (!parsed.ok) {
            return NextResponse.json({ error: parsed.message, lines: parsed.errors }, { status: 400 });
        }

        const result = await importStockFromCsv({
            ulId: session.user.ulId || 'default',
            name,
            userName: session.user.name || session.user.email || 'Inconnu',
            rows: parsed.rows,
        });

        return NextResponse.json(result, { status: 201 });
    } catch (e) {
        console.error('POST /api/inventory/stocks/import error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur lors de l\'import du stock' }, { status: 500 });
    }
}

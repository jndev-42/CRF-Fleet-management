import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';

const createULSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    slug: z.string().min(1, 'Le slug est requis').regex(/^[a-z0-9-]+$/, 'Slug invalide (lettres minuscules, chiffres, tirets)'),
});

/** GET /api/ul — Retourne toutes les UL (ADMIN uniquement) */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }
        if (!session.user.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const res = await db.execute(`SELECT id, name, slug FROM "UniteLocale" ORDER BY name ASC`);
        const uls = res.rows.map(r => ({ id: r.id, name: r.name, slug: r.slug }));

        return NextResponse.json({ uls });
    } catch (error) {
        console.error('Error fetching ULs:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** POST /api/ul — Créer une nouvelle UL (ADMIN uniquement) */
export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const body = await request.json();
        const data = createULSchema.parse(body);

        const existing = await db.execute({
            sql: `SELECT id FROM "UniteLocale" WHERE name = ? OR slug = ?`,
            args: [data.name, data.slug],
        });
        if (existing.rows.length > 0) {
            return NextResponse.json({ error: 'Une UL avec ce nom ou ce slug existe déjà.' }, { status: 409 });
        }

        const id = `ul-${data.slug}`;
        await db.execute({
            sql: `INSERT INTO "UniteLocale" (id, name, slug) VALUES (?, ?, ?)`,
            args: [id, data.name, data.slug],
        });

        return NextResponse.json({ success: true, id, name: data.name, slug: data.slug }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error creating UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

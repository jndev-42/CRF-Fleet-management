import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin } from '@/lib/roles';

const createULSchema = z.object({
    name: z.string().min(1, 'Le nom est requis'),
    slug: z.string().min(1, 'Le slug est requis').regex(/^[a-z0-9-]+$/, 'Slug invalide (lettres minuscules, chiffres, tirets)'),
    phoneNumbers: z.array(z.object({
        label: z.string().min(1, 'Le libellé est requis'),
        number: z.string().min(1, 'Le numéro est requis'),
    })).default([]),
    defaultParkingSpots: z.array(z.string()).default([]),
    stampImage: z.string().optional().nullable(),
});

/** GET /api/ul — Retourne toutes les UL (Utilisateurs connectés) */
export async function GET() {
    try {
        const session = await auth();
        if (!session?.user) {
            return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
        }

        const res = await db.execute(`SELECT id, name, slug, phoneNumbers, defaultParkingSpots, stampImage FROM "UniteLocale" ORDER BY name ASC`);
        const uls = res.rows.map(r => ({
            id: r.id,
            name: r.name,
            slug: r.slug,
            phoneNumbers: r.phoneNumbers ? JSON.parse(r.phoneNumbers as string) : [],
            defaultParkingSpots: r.defaultParkingSpots ? JSON.parse(r.defaultParkingSpots as string) : [],
            stampImage: (r.stampImage as string) || null,
        }));

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
        if (!isSuperAdmin(session?.user?.roles || [])) {
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
            sql: `INSERT INTO "UniteLocale" (id, name, slug, phoneNumbers, defaultParkingSpots, stampImage) VALUES (?, ?, ?, ?, ?, ?)`,
            args: [id, data.name, data.slug, JSON.stringify(data.phoneNumbers), JSON.stringify(data.defaultParkingSpots), data.stampImage || null],
        });

        return NextResponse.json({ success: true, id, name: data.name, slug: data.slug, phoneNumbers: data.phoneNumbers, defaultParkingSpots: data.defaultParkingSpots, stampImage: data.stampImage || null }, { status: 201 });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Données invalides', details: error.issues }, { status: 400 });
        }
        console.error('Error creating UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

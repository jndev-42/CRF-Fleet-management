import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin, isAdminOrAbove } from '@/lib/roles';
import { compressStampImage } from '@/lib/stamp';
import { forbiddenResponse } from '@/lib/apiAuth';

const updateUlSchema = z.object({
    name: z.string().min(1).optional(),
    slug: z.string().min(1).optional(),
    phoneNumbers: z.array(z.object({ label: z.string(), number: z.string() })).optional(),
    defaultParkingSpots: z.array(z.string()).optional(),
    stampImage: z.string().nullable().optional(),
    dtCode: z.string().nullable().optional(),
});

/** DELETE /api/ul/[id] — Supprimer une UL (ADMIN uniquement) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!isSuperAdmin(session?.user?.roles || [])) {
            return forbiddenResponse();
        }

        const { id } = await params;

        // Vérifier qu'elle existe
        const existing = await db.execute({ sql: `SELECT id FROM "UniteLocale" WHERE id = ?`, args: [id] });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'UL introuvable' }, { status: 404 });
        }

        await db.execute({ sql: `DELETE FROM "UniteLocale" WHERE id = ?`, args: [id] });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error deleting UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

/** PATCH /api/ul/[id] — Modifier une UL (ADMIN uniquement) */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        const roles = session?.user?.roles || [];
        const isSuper = isSuperAdmin(roles);
        const { id } = await params;
        const isLocalAdmin = isAdminOrAbove(roles) && id === session?.user?.ulId;

        if (!isSuper && !isLocalAdmin) {
            return forbiddenResponse();
        }

        const body = await request.json();
        let parsed: z.infer<typeof updateUlSchema>;
        try {
            parsed = updateUlSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }
        const { name, slug, phoneNumbers, defaultParkingSpots, stampImage, dtCode } = parsed;

        if (!name && !slug && !phoneNumbers && !defaultParkingSpots && stampImage === undefined && dtCode === undefined) {
            return NextResponse.json({ error: 'Aucune donnée à modifier' }, { status: 400 });
        }

        if (name) await db.execute({ sql: `UPDATE "UniteLocale" SET name = ? WHERE id = ?`, args: [name, id] });
        if (slug) await db.execute({ sql: `UPDATE "UniteLocale" SET slug = ? WHERE id = ?`, args: [slug, id] });
        if (phoneNumbers) await db.execute({ sql: `UPDATE "UniteLocale" SET phoneNumbers = ? WHERE id = ?`, args: [JSON.stringify(phoneNumbers), id] });
        if (defaultParkingSpots) await db.execute({ sql: `UPDATE "UniteLocale" SET defaultParkingSpots = ? WHERE id = ?`, args: [JSON.stringify(defaultParkingSpots), id] });
        if (stampImage !== undefined) {
            const compressed = await compressStampImage(stampImage);
            await db.execute({ sql: `UPDATE "UniteLocale" SET stampImage = ? WHERE id = ?`, args: [compressed, id] });
        }
        if (dtCode !== undefined) {
            await db.execute({ sql: `UPDATE "UniteLocale" SET dtCode = ? WHERE id = ?`, args: [dtCode ? dtCode.trim() : null, id] });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

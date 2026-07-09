import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';

/** DELETE /api/ul/[id] — Supprimer une UL (ADMIN uniquement) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
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
        if (!session?.user?.roles?.includes('ADMIN')) {
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        const { id } = await params;
        const { name, slug, phoneNumbers } = body as { name?: string; slug?: string; phoneNumbers?: Array<{ label: string; number: string }> };

        if (!name && !slug && !phoneNumbers) {
            return NextResponse.json({ error: 'Aucune donnée à modifier' }, { status: 400 });
        }

        if (name) await db.execute({ sql: `UPDATE "UniteLocale" SET name = ? WHERE id = ?`, args: [name, id] });
        if (slug) await db.execute({ sql: `UPDATE "UniteLocale" SET slug = ? WHERE id = ?`, args: [slug, id] });
        if (phoneNumbers) await db.execute({ sql: `UPDATE "UniteLocale" SET phoneNumbers = ? WHERE id = ?`, args: [JSON.stringify(phoneNumbers), id] });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

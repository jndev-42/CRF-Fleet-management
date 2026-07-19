import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { isSuperAdmin, isAdminOrAbove } from '@/lib/roles';

/** DELETE /api/ul/[id] — Supprimer une UL (ADMIN uniquement) */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await auth();
        if (!isSuperAdmin(session?.user?.roles || [])) {
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

let migrationChecked = false;
async function ensureULSchema() {
    if (migrationChecked) return;
    try {
        const tableInfo = await db.execute(`PRAGMA table_info("UniteLocale")`);
        if (tableInfo.rows.length > 0 && !tableInfo.rows.some(r => r.name === 'defaultParkingSpots')) {
            await db.execute(`ALTER TABLE "UniteLocale" ADD COLUMN "defaultParkingSpots" TEXT`);
        }
        migrationChecked = true;
    } catch {
        // Ignore if error occurs during migration check
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
            return NextResponse.json({ error: 'Interdit' }, { status: 403 });
        }

        await ensureULSchema();

        const body = await request.json();
        const { name, slug, phoneNumbers, defaultParkingSpots } = body as {
            name?: string;
            slug?: string;
            phoneNumbers?: Array<{ label: string; number: string }>;
            defaultParkingSpots?: string[];
        };

        if (!name && !slug && !phoneNumbers && !defaultParkingSpots) {
            return NextResponse.json({ error: 'Aucune donnée à modifier' }, { status: 400 });
        }

        if (name) await db.execute({ sql: `UPDATE "UniteLocale" SET name = ? WHERE id = ?`, args: [name, id] });
        if (slug) await db.execute({ sql: `UPDATE "UniteLocale" SET slug = ? WHERE id = ?`, args: [slug, id] });
        if (phoneNumbers) await db.execute({ sql: `UPDATE "UniteLocale" SET phoneNumbers = ? WHERE id = ?`, args: [JSON.stringify(phoneNumbers), id] });
        if (defaultParkingSpots) await db.execute({ sql: `UPDATE "UniteLocale" SET defaultParkingSpots = ? WHERE id = ?`, args: [JSON.stringify(defaultParkingSpots), id] });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Error updating UL:', error);
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

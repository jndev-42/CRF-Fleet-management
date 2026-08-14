import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const bannerSchema = z.object({
    title: z.string().optional().nullable(),
    message: z.string().trim().min(1, 'Le message est requis'),
    target_page: z.enum(['ALL', 'VEHICLES', 'MISSIONS', 'INVENTORY']).default('ALL'),
    type: z.enum(['info', 'warning', 'danger', 'success']).default('info'),
    is_global: z.boolean().default(false),
    is_active: z.boolean().default(true),
    ul_id: z.string().optional().nullable(),
    link_url: z.string().optional().nullable(),
    link_label: z.string().optional().nullable(),
});

async function ensureBannerColumns() {
    try {
        const tableInfo = await db.execute(`PRAGMA table_info("CommunicationBanner")`);
        if (tableInfo?.rows) {
            const hasLinkUrl = tableInfo.rows.some((r: Record<string, unknown>) => r.name === 'link_url');
            if (!hasLinkUrl) {
                await db.execute(`ALTER TABLE "CommunicationBanner" ADD COLUMN "link_url" TEXT`);
            }
            const hasLinkLabel = tableInfo.rows.some((r: Record<string, unknown>) => r.name === 'link_label');
            if (!hasLinkLabel) {
                await db.execute(`ALTER TABLE "CommunicationBanner" ADD COLUMN "link_label" TEXT`);
            }
        }
    } catch (e) {
        console.error('Error ensuring banner table columns:', e);
    }
}

export async function GET(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        await ensureBannerColumns();

        const roles = (session.user.roles || []) as string[];
        const { searchParams } = new URL(request.url);
        const isAdminMode = searchParams.get('admin') === 'true';
        const userUlId = searchParams.get('ulId') || session.user.ulId || null;

        if (isAdminMode) {
            if (!canAccessAdminPanel(roles)) {
                return forbiddenResponse();
            }

            const isSuper = isSuperAdmin(roles);
            let result;

            if (isSuper) {
                result = await db.execute(`
                    SELECT 
                        b.id,
                        b.title,
                        b.message,
                        b.target_page,
                        b.type,
                        b.ul_id,
                        b.is_global,
                        b.is_active,
                        b.link_url,
                        b.link_label,
                        b.created_by,
                        b.created_by_name,
                        b.created_at,
                        b.updated_at,
                        ul.name as ul_name
                    FROM "CommunicationBanner" b
                    LEFT JOIN "UniteLocale" ul ON b.ul_id = ul.id
                    ORDER BY b.created_at DESC
                `);
            } else {
                result = await db.execute({
                    sql: `
                        SELECT 
                            b.id,
                            b.title,
                            b.message,
                            b.target_page,
                            b.type,
                            b.ul_id,
                            b.is_global,
                            b.is_active,
                            b.link_url,
                            b.link_label,
                            b.created_by,
                            b.created_by_name,
                            b.created_at,
                            b.updated_at,
                            ul.name as ul_name
                        FROM "CommunicationBanner" b
                        LEFT JOIN "UniteLocale" ul ON b.ul_id = ul.id
                        WHERE b.ul_id = ? OR (b.created_by = ? AND b.ul_id IS NULL AND b.is_global = 0)
                        ORDER BY b.created_at DESC
                    `,
                    args: [userUlId || '', session.user.id || '']
                });
            }

            const banners = result.rows.map(r => ({
                id: r.id as string,
                title: (r.title as string) || null,
                message: r.message as string,
                target_page: r.target_page as string,
                type: r.type as string,
                ul_id: (r.ul_id as string) || null,
                ul_name: (r.ul_name as string) || null,
                is_global: Number(r.is_global) === 1,
                is_active: Number(r.is_active) === 1,
                link_url: (r.link_url as string) || null,
                link_label: (r.link_label as string) || null,
                created_by: r.created_by as string,
                created_by_name: (r.created_by_name as string) || null,
                created_at: r.created_at as string,
                updated_at: r.updated_at as string,
            }));

            return NextResponse.json({ banners });
        }

        // Standard user fetch for display
        const result = await db.execute({
            sql: `
                SELECT 
                    b.id,
                    b.title,
                    b.message,
                    b.target_page,
                    b.type,
                    b.ul_id,
                    b.is_global,
                    b.is_active,
                    b.link_url,
                    b.link_label,
                    b.created_at
                FROM "CommunicationBanner" b
                WHERE b.is_active = 1 AND (b.is_global = 1 OR (b.ul_id = ? AND b.ul_id IS NOT NULL))
                ORDER BY b.created_at DESC
            `,
            args: [userUlId || '']
        });

        const banners = result.rows.map(r => ({
            id: r.id as string,
            title: (r.title as string) || null,
            message: r.message as string,
            target_page: r.target_page as string,
            type: r.type as string,
            ul_id: (r.ul_id as string) || null,
            is_global: Number(r.is_global) === 1,
            is_active: Number(r.is_active) === 1,
            link_url: (r.link_url as string) || null,
            link_label: (r.link_label as string) || null,
            created_at: r.created_at as string,
        }));

        return NextResponse.json({ banners });

    } catch (error) {
        console.error('Error fetching banners:', error);
        return NextResponse.json({ error: 'Erreur lors de la récupération des bandeaux' }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        await ensureBannerColumns();

        const roles = (session.user.roles || []) as string[];
        if (!canAccessAdminPanel(roles)) {
            return forbiddenResponse();
        }

        const body = await request.json();
        let data: z.infer<typeof bannerSchema>;
        try {
            data = bannerSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        const isSuper = isSuperAdmin(roles);
        // Only SuperAdmin can create global banners
        const isGlobal = isSuper ? Boolean(data.is_global) : false;
        // Non-SuperAdmin banners are tied to their active UL
        const ulId = isGlobal ? null : (isSuper && data.ul_id ? data.ul_id : (session.user.ulId || null));

        const bannerId = crypto.randomUUID();
        const createdByName = session.user.name || session.user.email || 'Admin';
        const now = new Date().toISOString();

        await db.execute({
            sql: `
                INSERT INTO "CommunicationBanner" (
                    id, title, message, target_page, type, ul_id, is_global, is_active, link_url, link_label, created_by, created_by_name, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `,
            args: [
                bannerId,
                data.title || null,
                data.message,
                data.target_page,
                data.type,
                ulId,
                isGlobal ? 1 : 0,
                data.is_active ? 1 : 0,
                data.link_url || null,
                data.link_label || null,
                session.user.id || 'unknown',
                createdByName,
                now,
                now,
            ]
        });

        return NextResponse.json({
            success: true,
            banner: {
                id: bannerId,
                title: data.title || null,
                message: data.message,
                target_page: data.target_page,
                type: data.type,
                ul_id: ulId,
                is_global: isGlobal,
                is_active: data.is_active,
                link_url: data.link_url || null,
                link_label: data.link_label || null,
                created_by: session.user.id,
                created_by_name: createdByName,
                created_at: now,
                updated_at: now,
            }
        }, { status: 201 });

    } catch (error) {
        console.error('Error creating banner:', error);
        return NextResponse.json({ error: 'Erreur lors de la création du bandeau' }, { status: 500 });
    }
}

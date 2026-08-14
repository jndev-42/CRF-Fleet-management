import { NextResponse } from 'next/server';
import { z } from 'zod';
import { db } from '@/lib/db';
import { auth } from '@/auth';
import { canAccessAdminPanel, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';

const updateBannerSchema = z.object({
    title: z.string().optional().nullable(),
    message: z.string().min(1, 'Le message est requis').optional(),
    target_page: z.enum(['ALL', 'VEHICLES', 'MISSIONS', 'INVENTORY']).optional(),
    type: z.enum(['info', 'warning', 'danger', 'success']).optional(),
    is_global: z.boolean().optional(),
    is_active: z.boolean().optional(),
    ul_id: z.string().optional().nullable(),
    link_url: z.string().optional().nullable(),
    link_label: z.string().optional().nullable(),
});

export async function PATCH(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || []) as string[];
        if (!canAccessAdminPanel(roles)) {
            return forbiddenResponse();
        }

        const { id } = await params;
        const existingRes = await db.execute({
            sql: 'SELECT * FROM "CommunicationBanner" WHERE id = ?',
            args: [id]
        });

        if (existingRes.rows.length === 0) {
            return NextResponse.json({ error: 'Bandeau non trouvé' }, { status: 404 });
        }

        const existing = existingRes.rows[0];
        const isSuper = isSuperAdmin(roles);
        const userUlId = session.user.ulId;

        // Non-super-admins can only modify banners belonging to their UL
        if (!isSuper) {
            if (existing.ul_id !== userUlId && existing.created_by !== session.user.id) {
                return forbiddenResponse('Vous ne pouvez modifier que les bandeaux de votre Unité Locale.');
            }
        }

        const body = await request.json();
        let data: z.infer<typeof updateBannerSchema>;
        try {
            data = updateBannerSchema.parse(body);
        } catch (zodErr) {
            if (zodErr instanceof z.ZodError) {
                return NextResponse.json({ error: 'Données invalides', details: zodErr.issues }, { status: 400 });
            }
            throw zodErr;
        }

        if (!isSuper && data.is_global === true) {
            return forbiddenResponse('Seuls les Super Administrateurs peuvent définir un bandeau global.');
        }

        let newIsGlobal = existing.is_global;
        if (data.is_global !== undefined) {
            newIsGlobal = isSuper ? (data.is_global ? 1 : 0) : 0;
        }

        let newUlId = existing.ul_id;
        if (newIsGlobal === 1) {
            newUlId = null;
        } else if (data.ul_id !== undefined) {
            newUlId = isSuper ? data.ul_id : (userUlId || null);
        }

        const now = new Date().toISOString();

        const updatedTitle = data.title !== undefined ? data.title : existing.title;
        const updatedMessage = data.message !== undefined ? data.message : existing.message;
        const updatedTargetPage = data.target_page !== undefined ? data.target_page : existing.target_page;
        const updatedType = data.type !== undefined ? data.type : existing.type;
        const updatedIsActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : existing.is_active;
        const updatedLinkUrl = data.link_url !== undefined ? data.link_url : existing.link_url;
        const updatedLinkLabel = data.link_label !== undefined ? data.link_label : existing.link_label;

        await db.execute({
            sql: `
                UPDATE "CommunicationBanner"
                SET 
                    title = ?,
                    message = ?,
                    target_page = ?,
                    type = ?,
                    ul_id = ?,
                    is_global = ?,
                    is_active = ?,
                    link_url = ?,
                    link_label = ?,
                    updated_at = ?
                WHERE id = ?
            `,
            args: [
                updatedTitle,
                updatedMessage,
                updatedTargetPage,
                updatedType,
                newUlId,
                newIsGlobal,
                updatedIsActive,
                updatedLinkUrl,
                updatedLinkLabel,
                now,
                id
            ]
        });

        return NextResponse.json({
            success: true,
            banner: {
                id,
                title: updatedTitle,
                message: updatedMessage,
                target_page: updatedTargetPage,
                type: updatedType,
                ul_id: newUlId,
                is_global: Number(newIsGlobal) === 1,
                is_active: Number(updatedIsActive) === 1,
                link_url: updatedLinkUrl || null,
                link_label: updatedLinkLabel || null,
                updated_at: now
            }
        });

    } catch (error) {
        console.error('Error updating banner:', error);
        return NextResponse.json({ error: 'Erreur lors de la mise à jour du bandeau' }, { status: 500 });
    }
}

export async function DELETE(
    request: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user) {
            return unauthorizedResponse();
        }

        const roles = (session.user.roles || []) as string[];
        if (!canAccessAdminPanel(roles)) {
            return forbiddenResponse();
        }

        const { id } = await params;
        const existingRes = await db.execute({
            sql: 'SELECT * FROM "CommunicationBanner" WHERE id = ?',
            args: [id]
        });

        if (existingRes.rows.length === 0) {
            return NextResponse.json({ error: 'Bandeau non trouvé' }, { status: 404 });
        }

        const existing = existingRes.rows[0];
        const isSuper = isSuperAdmin(roles);
        const userUlId = session.user.ulId;

        if (!isSuper) {
            if (existing.ul_id !== userUlId && existing.created_by !== session.user.id) {
                return forbiddenResponse('Vous ne pouvez supprimer que les bandeaux de votre Unité Locale.');
            }
        }

        await db.execute({
            sql: 'DELETE FROM "CommunicationBanner" WHERE id = ?',
            args: [id]
        });

        return NextResponse.json({ success: true, message: 'Bandeau supprimé' });

    } catch (error) {
        console.error('Error deleting banner:', error);
        return NextResponse.json({ error: 'Erreur lors de la suppression du bandeau' }, { status: 500 });
    }
}

/**
 * DELETE /api/mcp-tokens/[id] — révoque un jeton d'accès IA (effet immédiat).
 *
 * ADMIN : ses propres jetons ; SUPER_ADMIN : tous. Un jeton d'un autre utilisateur est
 * indiscernable d'un identifiant inconnu (404) pour un ADMIN. Idempotent.
 */
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { isAdminOrAbove, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { getErrorMessage } from '@/lib/utils/error';
import { getMcpToken, revokeMcpToken } from '@/lib/mcp/tokens';

type RouteContext = { params: Promise<{ id: string }> };

async function deleteHandler(_request: Request, { params }: RouteContext) {
    try {
        const session = await auth();
        if (!session?.user?.id) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles) || session.user.mcpTokenId) return forbiddenResponse();

        const { id } = await params;
        const token = await getMcpToken(id);
        if (!token || (!isSuperAdmin(roles) && token.userId !== session.user.id)) {
            return NextResponse.json({ error: 'Jeton introuvable' }, { status: 404 });
        }

        await revokeMcpToken(id);
        return NextResponse.json({ success: true });
    } catch (e: unknown) {
        console.error('DELETE /api/mcp-tokens/[id] error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const DELETE = withAudit(deleteHandler, { action: "Révocation d'un jeton d'accès IA (MCP)", entityType: 'mcpToken' });

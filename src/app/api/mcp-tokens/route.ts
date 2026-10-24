/**
 * /api/mcp-tokens — jetons d'accès IA (serveur MCP).
 *
 * GET  : ses propres jetons (ADMIN) ; tous les jetons, avec leur propriétaire (SUPER_ADMIN).
 * POST : crée un jeton **pour soi-même** (jamais au nom d'un autre) ; le jeton complet
 *        n'est renvoyé qu'ici, une seule fois. 10 jetons actifs au plus par utilisateur.
 *
 * Refusé à une session MCP : une IA ne crée ni ne liste de jetons.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { isAdminOrAbove, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { withAudit } from '@/lib/audit/log';
import { getErrorMessage } from '@/lib/utils/error';
import {
    DEFAULT_MCP_TOKEN_VALIDITY_DAYS,
    MCP_SCOPES,
    MCP_TOKEN_VALIDITY_DAYS,
    McpTokenLimitError,
    createMcpToken,
    listMcpTokens,
    type McpTokenValidityDays,
} from '@/lib/mcp/tokens';

const NO_STORE = { 'Cache-Control': 'no-store' };

const createSchema = z.object({
    name: z.string('Nom requis').trim().min(1, 'Nom requis').max(60, 'Le nom ne peut pas dépasser 60 caractères'),
    scope: z.enum(MCP_SCOPES, 'Portée invalide (read ou write)'),
    validityDays: z.union(MCP_TOKEN_VALIDITY_DAYS.map(d => z.literal(d)), 'Validité invalide (30, 90 ou 365 jours)')
        .default(DEFAULT_MCP_TOKEN_VALIDITY_DAYS as McpTokenValidityDays),
});

export async function GET() {
    try {
        const session = await auth();
        if (!session?.user?.id) return unauthorizedResponse();
        const roles = session.user.roles || [];
        if (!isAdminOrAbove(roles) || session.user.mcpTokenId) return forbiddenResponse();

        const tokens = await listMcpTokens(isSuperAdmin(roles) ? undefined : session.user.id);
        return NextResponse.json({
            tokens: tokens.map(t => ({ ...t, mine: t.userId === session.user.id })),
        }, { headers: NO_STORE });
    } catch (e: unknown) {
        console.error('GET /api/mcp-tokens error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

async function postHandler(request: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) return unauthorizedResponse();
        if (!isAdminOrAbove(session.user.roles || []) || session.user.mcpTokenId) return forbiddenResponse();

        // En impersonation, la session est celle de la personne incarnée : un jeton se génère pour soi-même.
        const original = session.user.originalEmail?.toLowerCase();
        if (original && session.user.email && original !== session.user.email.toLowerCase()) {
            return forbiddenResponse("Impossible de générer un jeton pendant une impersonation");
        }

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return NextResponse.json({ error: 'Corps de requête invalide' }, { status: 400 });
        }
        const parsed = createSchema.safeParse(body);
        if (!parsed.success) {
            return NextResponse.json({
                error: parsed.error.issues[0]?.message ?? 'Données invalides',
                details: parsed.error.issues,
            }, { status: 400 });
        }

        const { token, info } = await createMcpToken({ userId: session.user.id, ...parsed.data });
        return NextResponse.json({ token, item: { ...info, mine: true } }, { status: 201, headers: NO_STORE });
    } catch (e: unknown) {
        if (e instanceof McpTokenLimitError) return NextResponse.json({ error: e.message }, { status: 409 });
        console.error('POST /api/mcp-tokens error:', getErrorMessage(e));
        return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
}

export const POST = withAudit(postHandler, { action: "Création d'un jeton d'accès IA (MCP)", entityType: 'mcpToken' });

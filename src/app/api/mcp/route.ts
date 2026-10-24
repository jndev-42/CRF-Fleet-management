/**
 * /api/mcp — serveur MCP (Streamable HTTP, sans état) pour les assistants IA.
 *
 * Authentifié par un jeton personnel `Authorization: Bearer crf_mcp_…`, généré dans
 * Administration → « Accès IA (MCP) ». Seuls les clients qui acceptent un en-tête
 * Authorization personnalisé (Claude Code, Claude Desktop, Cursor…) s'y connectent ; les
 * connecteurs web qui exigent OAuth (claude.ai, ChatGPT) ne sont pas pris en charge.
 * L'IA agit en tant que le propriétaire du jeton, sur son UL d'attache :
 * l'outil `api_request` rappelle l'API REST avec une assertion interne signée, et chaque
 * route y applique ses contrôles habituels. Seule route qui accepte le jeton brut.
 *
 * Exemptée de `withAudit` : ce n'est qu'un transport ; les écritures qu'elle relaie sont
 * tracées par les routes appelées, au nom du propriétaire et marquées « MCP ».
 */
import { createMcpHandler, withMcpAuth } from 'mcp-handler';
import { z } from 'zod';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { version } from '../../../../package.json';
import { verifyMcpToken, type McpPrincipal } from '@/lib/mcp/tokens';
import { apiRequest, apiRequestInput, internalOrigin, listApiRoutes, listApiRoutesInput, whoami, type ToolResult } from '@/lib/mcp/tools';

interface McpAuthExtra {
    principal: McpPrincipal;
    origin: string;
}

function authExtra(authInfo: AuthInfo | undefined): McpAuthExtra | null {
    const extra = authInfo?.extra as Partial<McpAuthExtra> | undefined;
    return extra?.principal && extra.origin ? extra as McpAuthExtra : null;
}

const unauthenticated: ToolResult = { content: [{ type: 'text', text: 'Non authentifié' }], isError: true };

const mcpHandler = createMcpHandler(server => {
    server.registerTool('whoami', {
        title: 'Qui suis-je',
        description: "Compte au nom duquel l'IA agit : e-mail, rôles, unité locale d'attache du propriétaire (la seule sur laquelle l'IA agit), nom et portée du jeton.",
        inputSchema: z.object({}),
        annotations: { readOnlyHint: true },
    }, async (_args, ctx) => {
        const auth = authExtra(ctx.http?.authInfo);
        return auth ? whoami(auth.principal) : unauthenticated;
    });

    server.registerTool('list_api_routes', {
        title: "Routes de l'API",
        description: "Liste les routes REST de l'application (chemin et méthodes) appelables avec api_request. Filtre texte facultatif.",
        inputSchema: listApiRoutesInput,
        annotations: { readOnlyHint: true },
    }, async ({ filter }, ctx) => {
        const auth = authExtra(ctx.http?.authInfo);
        return auth ? listApiRoutes(auth.principal, filter) : unauthenticated;
    });

    server.registerTool('api_request', {
        title: "Appel de l'API",
        description: "Appelle une route REST de l'application avec les droits du propriétaire du jeton (mêmes rôles), toujours sur son unité locale d'attache. "
            + 'Corps JSON uniquement ; les réponses binaires sont résumées. Un jeton en lecture seule ne permet que GET.',
        inputSchema: apiRequestInput,
    }, async (input, ctx) => {
        const auth = authExtra(ctx.http?.authInfo);
        return auth ? apiRequest(auth.principal, input, auth.origin) : unauthenticated;
    });
}, {
    serverInfo: { name: 'crf-fleet', version },
    instructions: "Application de gestion de flotte de la Croix-Rouge (véhicules, trajets, réservations, inventaire, missions, notes de frais, uniformes). "
        + "Commencer par whoami, puis list_api_routes pour trouver la route, puis api_request avec le chemin concret.",
});

async function verifyToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
    const principal = await verifyMcpToken(bearerToken);
    if (!principal) return undefined;
    const extra: McpAuthExtra = { principal, origin: internalOrigin(req) };
    return {
        token: principal.tokenId,
        clientId: principal.tokenId,
        scopes: [principal.scope],
        expiresAt: Math.floor(new Date(principal.expiresAt).getTime() / 1000),
        extra: extra as unknown as Record<string, unknown>,
    };
}

const handler = withMcpAuth(mcpHandler, verifyToken, { required: true });

export { handler as GET, handler as POST };

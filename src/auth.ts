import NextAuth, { type DefaultSession, type NextAuthConfig, type Session } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { isPreview, isDev as isDevEnv } from "@/lib/env";
import { PREVIEW_ACCOUNTS } from "@/lib/preview-accounts";
import { resolveSessionRoles } from "@/lib/session-roles";
import { recordAudit } from "@/lib/audit/log";
import { fetchUserULs, resolveActiveUL } from "@/lib/user-uls";
import { MCP_ASSERTION_HEADER, verifyMcpAssertion } from "@/lib/mcp/assertion";
import { loadMcpPrincipal, type McpPrincipal } from "@/lib/mcp/tokens";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            roles: string[];
            ulId: string;
            availableULs: { id: string; name: string; slug: string; isHome: boolean; roles?: string[] }[];
            originalEmail?: string;
            impersonatedEmail?: string;
            /** Session d'une IA via le serveur MCP : jeton utilisé (absent pour le navigateur). */
            mcpTokenId?: string;
            mcpTokenName?: string;
            mcpScope?: "read" | "write";
        } & DefaultSession["user"];
    }
}

declare module "next-auth/jwt" {
    interface JWT {
        originalEmail?: string | null;
        impersonatedEmail?: string | null;
        roles?: string[];
        userId?: string;
        devRoles?: string[];
        ulId?: string;
        availableULs?: { id: string; name: string; slug: string; isHome: boolean; roles?: string[] }[];
    }
}

// ── Utilisateurs de test (dev uniquement) ────────────────────────────────────
const DEV_USERS: Record<string, { email: string; name: string; roles: string[] }> = {
    superadmin: { email: 'superadmin@dev.local', name: 'Super Admin Dev', roles: ['SUPER_ADMIN', 'CHVL'] },
    admin:      { email: 'admin@dev.local',      name: 'Admin Dev',       roles: ['ADMIN'] },
    president:  { email: 'president@dev.local',  name: 'Président Dev',   roles: ['PRESIDENT'] },
    tresorier:  { email: 'tresorier@dev.local',   name: 'Trésorier Dev',   roles: ['TRESORIER'] },
    respo:      { email: 'respo@dev.local',       name: 'Respo Dev',       roles: ['RESPO'] },
    cadre:      { email: 'cadre@dev.local',       name: 'Cadre Dev',       roles: ['CADRE'] },
    respvehicule: { email: 'respvehicule@dev.local', name: 'Resp. Véhicule Dev', roles: ['RESP_VEHICULE'] },
    respuniforme: { email: 'respuniforme@dev.local', name: 'Resp. Uniforme Dev', roles: ['RESP_UNIFORME'] },
    chvl:       { email: 'chvl@dev.local',        name: 'Chauffeur Dev',   roles: ['CHVL'] },
    guest:      { email: 'guest@dev.local',       name: 'Inactif Dev',     roles: ['INACTIF'] },
    ci:         { email: 'ci@dev.local',          name: 'CI/RPAPS Dev',    roles: ['CI/RPAPS'] },
    jeannoel:   { email: 'jeannoel.durand@croix-rouge.fr', name: 'Jean-Noël Durand', roles: ['SUPER_ADMIN', 'CHVL'] },
};

const isDev = isDevEnv;

// ── Comptes Preview (one-click, sans mot de passe) ────────────────────────────
const PREVIEW_USERS: Record<string, { email: string; name: string }> = Object.fromEntries(
    PREVIEW_ACCOUNTS.map(a => [a.key, { email: a.email, name: a.name }])
);

// ── Providers ────────────────────────────────────────────────────────────────
const providers = [
    // Google OAuth : désactivé en preview (connexion one-click uniquement)
    ...(isPreview ? [] : [
        Google({
            clientId: process.env.GOOGLE_CLIENT_ID,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            authorization: {
                params: {
                    prompt: "consent",
                    access_type: "offline",
                    response_type: "code",
                    scope: "openid email profile"
                },
            },
        }),
    ]),

    // Provider disponible en développement local et en preview
    ...(isDev || isPreview ? [
        Credentials({
            id: 'dev-credentials',
            name: isDev ? 'Dev Login' : 'Preview Login',
            credentials: {
                role: { label: 'Rôle', type: 'text' },
            },
            async authorize(credentials) {
                const role = credentials?.role as string;

                // Mode preview : lookup par email via les comptes préchargés
                if (isPreview) {
                    const previewUser = PREVIEW_USERS[role];
                    if (!previewUser) return null;
                    // Pas de devRoles bypass : les rôles sont lus depuis la DB preview normalement
                    return { id: previewUser.email, email: previewUser.email, name: previewUser.name } as Record<string, unknown>;
                }

                // Mode dev : bypass DB avec des rôles statiques
                const user = DEV_USERS[role];
                if (!user) return null;
                // devRoles est stocké dans le JWT → aucune requête DB nécessaire
                // devRoles is a custom field carried through to the jwt callback
                return { id: user.email, email: user.email, name: user.name, devRoles: user.roles } as Record<string, unknown>;
            },
        }),
    ] : []),
];

export const authCallbacks: NonNullable<NextAuthConfig["callbacks"]> = {
    async signIn({ user, profile, account }) {
        // Dev & preview credentials : pas de vérification de domaine
        if (account?.provider === 'dev-credentials') return true;

        const email = user?.email || profile?.email;
        if (!email) return "/login?error=AccessDenied";

        if (email.toLowerCase().endsWith("@croix-rouge.fr")) {
            try {
                const normalizedEmail = email.toLowerCase();
                const resUser = await db.execute({
                    sql: 'SELECT id FROM "User" WHERE email = ?',
                    args: [normalizedEmail],
                });
                if (resUser.rows.length === 0) {
                    const newUserId = crypto.randomUUID();
                    const name = user?.name || profile?.name || normalizedEmail.split('@')[0];
                    await db.execute({
                        sql: 'INSERT INTO "User" (id, email, name) VALUES (?, ?, ?)',
                        args: [newUserId, normalizedEmail, name],
                    });
                }
            } catch (e) {
                console.error("Failed to verify or auto-create user:", e);
                return "/login?error=AccessDenied";
            }
            return true;
        }

        return "/login?error=AccessDenied";
    },

    async session({ session, token }) {
        const email = session?.user?.email;

        // Expose the user DB id from the JWT so API routes can use session.user.id
        if (token.userId) {
            session.user.id = token.userId as string;
        }

        // Propagate impersonation states
        session.user.originalEmail = token.originalEmail as string;
        session.user.impersonatedEmail = token.impersonatedEmail as string | undefined;

        // Propagate UL data
        session.user.ulId = (token.ulId as string) || 'default';
        session.user.availableULs = (token.availableULs as { id: string; name: string; slug: string; isHome: boolean }[]) || [];

        // Dev : @dev.local bypass la vérification de domaine
        // Preview : @preview.local bypass également la vérification de domaine
        if (email?.endsWith('@dev.local') || email?.endsWith('@preview.local')) {
            session.user.roles = (token.roles as string[]) || [];
            return session;
        }

        const emailToVerify = token.originalEmail as string;
        const isInternalDomain = emailToVerify?.endsWith('@croix-rouge.fr')
            || emailToVerify?.endsWith('@dev.local')
            || emailToVerify?.endsWith('@preview.local');
        if (!emailToVerify || !isInternalDomain) {
            // Casting needed: NextAuth Session type does not include error field by default
            return { ...session, error: "Unauthorized" } as typeof session & { error: string };
        }

        if (token.userId) {
            try {
                session.user.roles = await resolveSessionRoles(
                    db,
                    token.userId as string,
                    token.ulId ?? 'default',
                );
            } catch (e) {
                // Repli de PANNE, et lui seul : base injoignable, on sert la dernière
                // valeur connue plutôt que de déconnecter tout le monde. Ce n'est PAS
                // un maillon de la cascade — l'y remettre rendrait les rôles collants
                // et la révocation n'arriverait jamais (cf. src/lib/session-roles.ts).
                console.error("Failed to fetch fresh roles for session:", e);
                session.user.roles = (token.roles as string[]) || [];
            }
        } else {
            session.user.roles = (token.roles as string[]) || [];
        }
        return session;
    },

    async jwt({ token, user, trigger, session }) {
        // Première connexion dev : stocker les rôles dans le JWT (évite toute requête DB)
        if (user && 'devRoles' in user) {
            // devRoles is set by the dev-credentials authorize() return value
            token.devRoles = (user as Record<string, unknown>).devRoles as string[];
        }

        // Store original email on first load
        if (user && user.email) {
            token.originalEmail = user.email;
        }

        if (!token.originalEmail && token.email) {
            token.originalEmail = token.email;
        }

        // Handle session update for impersonation and UL switching
        if (trigger === "update" && session) {
            if (token.originalEmail === 'jeannoel.durand@croix-rouge.fr') {
                if (session.impersonateEmail !== undefined) {
                    const previous = token.impersonatedEmail ?? null;
                    token.impersonatedEmail = session.impersonateEmail; // string or null
                    delete token.ulId; // Reset active UL when starting/stopping impersonation
                    // Journal d'audit : passe par /api/auth/*, hors de `withAudit`. Ne lève jamais.
                    const target = session.impersonateEmail || previous;
                    await recordAudit({
                        actorEmail: token.originalEmail ?? null,
                        method: "POST",
                        path: "/api/auth/session",
                        action: session.impersonateEmail ? "Début d'impersonation" : "Fin d'impersonation",
                        entityType: "user",
                        entityId: typeof target === "string" ? target : null,
                        status: 200,
                    });
                }
            }
            // Allow any authenticated user to switch active UL
            if (session.ulId !== undefined) {
                const requestedUlId = session.ulId as string;
                // Validate the user actually has access to the requested UL
                const available = (token.availableULs as { id: string; name: string; slug: string; isHome: boolean }[] | undefined) || [];
                const hasAccess = available.some(ul => ul.id === requestedUlId);
                if (hasAccess) {
                    token.ulId = requestedUlId;

                    // Dynamic roles retrieval upon switching UL
                    if (token.userId) {
                        try {
                            const globalRolesRes = await db.execute({
                                sql: `
                                    SELECT r.name
                                    FROM "UserRole" ur
                                    JOIN "Role" r ON ur.roleId = r.id
                                    WHERE ur.userId = ?
                                `,
                                args: [token.userId],
                            });
                            const globalRoles = globalRolesRes.rows.map(row => row.name as string);

                            const ulRoleRes = await db.execute({
                                sql: 'SELECT roles FROM "UserUL" WHERE userId = ? AND ulId = ?',
                                args: [token.userId, requestedUlId],
                            });
                            let activeRoles: string[] = [];
                            if (ulRoleRes.rows.length > 0 && ulRoleRes.rows[0].roles) {
                                activeRoles = (ulRoleRes.rows[0].roles as string).split(',').map(r => r.trim()).filter(Boolean);
                            }
                            if (activeRoles.length === 0) {
                                activeRoles = globalRoles;
                            }
                            if (globalRoles.includes('SUPER_ADMIN') && !activeRoles.includes('SUPER_ADMIN')) {
                                activeRoles.unshift('SUPER_ADMIN');
                            }
                            token.roles = activeRoles;
                        } catch (e) {
                            console.error("Failed to fetch roles for switched UL:", e);
                        }
                    }
                }
            }
        }

        // Work email: impersonated if active, otherwise original
        const emailToUse = (token.originalEmail === 'jeannoel.durand@croix-rouge.fr' && token.impersonatedEmail)
            ? token.impersonatedEmail
            : token.originalEmail;

        token.email = emailToUse;

        // Dev users : rôles depuis le JWT uniquement (bypass DB)
        if (emailToUse?.endsWith('@dev.local')) {
            token.roles = (token.devRoles as string[]) || [];
            if (!token.userId) {
                // Fetch the actual User.id from DB for dev users too
                try {
                    const devUser = await db.execute({
                        sql: `SELECT id FROM "User" WHERE email = ?`,
                        args: [emailToUse],
                    });
                    if (devUser.rows.length > 0) {
                        token.userId = devUser.rows[0].id as string;
                    }
                } catch {
                    // non-fatal — dev env may not have a User row yet
                }
            }
            // Load UL data for dev users if not yet set
            if (!token.availableULs && token.userId) {
                token.availableULs = await fetchUserULs(token.userId as string);
            }
            if (token.availableULs) {
                if (!token.ulId || !token.availableULs.some(ul => ul.id === token.ulId)) {
                    token.ulId = resolveActiveUL(token.availableULs);
                }
            }
            return token;
        }

        // Preview users : rôles lus depuis la DB preview (comptes préchargés)
        // Même flow que les utilisateurs normaux — les rôles viennent de UserUL/UserRole
        if (emailToUse?.endsWith('@preview.local')) {
            // Falls through to the normal DB lookup below
        }

        // Utilisateurs normaux : récupération des rôles et userId depuis la DB
        if (emailToUse) {
            try {
                const userRes = await db.execute({
                    sql: 'SELECT id FROM "User" WHERE email = ?',
                    args: [emailToUse],
                });
                if (userRes.rows.length > 0) {
                    token.userId = userRes.rows[0].id as string;

                    // Load UL data (always refresh on sign-in, keep ulId if already set via switch)
                    token.availableULs = await fetchUserULs(token.userId as string);
                    if (!token.ulId || !token.availableULs.some(ul => ul.id === token.ulId)) {
                        token.ulId = resolveActiveUL(token.availableULs);
                    }

                    // Retrieve roles based on the active UL — même résolution que le
                    // callback `session`, une seule implémentation partagée.
                    token.roles = token.userId
                        ? await resolveSessionRoles(db, token.userId as string, token.ulId ?? 'default')
                        : [];
                } else {
                    token.roles = [];
                }
            } catch (e) {
                console.error("Failed to fetch roles for JWT:", e);
                token.roles = [];
            }
        }
        return token;
    },
};

export const authEvents: NonNullable<NextAuthConfig["events"]> = {
    // Journal d'audit : connexion RÉUSSIE uniquement (`events.signIn` ne part qu'après
    // un `callbacks.signIn` accepté). Non fatal : `recordAudit` ne lève jamais.
    async signIn({ user, account }) {
        let ip: string | null = null;
        let userAgent: string | null = null;
        try {
            const { headers } = await import("next/headers");
            const h = await headers();
            ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip");
            userAgent = h.get("user-agent");
        } catch {
            // Hors contexte de requête : connexion tracée sans IP ni navigateur.
        }
        const provider = account?.provider ?? "inconnu";
        await recordAudit({
            actorEmail: user?.email ?? null,
            actorName: user?.name ?? null,
            method: "POST",
            path: `/api/auth/callback/${provider}`,
            action: "Connexion",
            entityType: "session",
            entityId: provider,
            status: 200,
            ip,
            userAgent,
        });
    },
};

const nextAuth = NextAuth({
    providers,
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: authCallbacks,
    events: authEvents,
});

export const { handlers, signIn, signOut } = nextAuth;

/** Session du propriétaire d'un jeton MCP — durée de vie de l'assertion, pas plus. */
function mcpSession(principal: McpPrincipal): Session {
    return {
        user: {
            id: principal.userId,
            email: principal.email,
            name: principal.name,
            // Pas d'impersonation possible via le MCP : l'auteur est le propriétaire.
            originalEmail: principal.email,
            roles: principal.roles,
            ulId: principal.ulId,
            availableULs: principal.availableULs.map(({ id, name, slug, isHome, roles }) => ({ id, name, slug, isHome, roles })),
            mcpTokenId: principal.tokenId,
            mcpTokenName: principal.tokenName,
            mcpScope: principal.scope,
        },
        expires: new Date(Date.now() + 60_000).toISOString(),
    };
}

/**
 * Session d'un appel interne du serveur MCP (en-tête `x-crf-mcp-assertion` signé), ou
 * `null`. Les droits sont relus en base : un jeton révoqué ou un propriétaire rétrogradé
 * ne produit aucune session. Hors contexte de requête (scripts, tests), `null`.
 */
async function sessionFromMcpAssertion(): Promise<Session | null> {
    let assertion: string | null;
    try {
        const { headers } = await import("next/headers");
        assertion = (await headers()).get(MCP_ASSERTION_HEADER);
    } catch {
        return null;
    }
    const claims = verifyMcpAssertion(assertion);
    if (!claims) return null;
    try {
        const principal = await loadMcpPrincipal(claims.tokenId, claims.userId);
        return principal ? mcpSession(principal) : null;
    } catch (e) {
        console.error("[mcp] session impossible à construire :", e instanceof Error ? e.message : String(e));
        return null;
    }
}

const nextAuthAuth = nextAuth.auth;

/**
 * `auth()` de NextAuth, qui reconnaît en plus les appels du serveur MCP.
 *
 * Sans argument (routes API, composants serveur) : une assertion MCP valide donne la
 * session du propriétaire du jeton, sinon délégation à NextAuth (cookie de session).
 * Avec arguments (enveloppe de middleware, etc.) : délégation pure. Le jeton brut n'est
 * jamais accepté ici — seulement par `/api/mcp`.
 */
export const auth = (async (...args: unknown[]) => {
    if (args.length === 0) {
        const session = await sessionFromMcpAssertion();
        if (session) return session;
    }
    return (nextAuthAuth as (...a: unknown[]) => unknown)(...args);
}) as typeof nextAuthAuth;

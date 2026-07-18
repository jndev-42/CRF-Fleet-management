import NextAuth, { type DefaultSession, type NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { isPreview, isDev as isDevEnv } from "@/lib/env";
import { PREVIEW_ACCOUNTS } from "@/lib/preview-accounts";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            roles: string[];
            ulId: string;
            availableULs: { id: string; name: string; slug: string; isHome: boolean; roles?: string[] }[];
            originalEmail?: string;
            impersonatedEmail?: string;
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
    cadre:      { email: 'cadre@dev.local',       name: 'Cadre Dev',       roles: ['CADRE'] },
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

// ── UL helpers ───────────────────────────────────────────────────────────────
type ULEntry = { id: string; name: string; slug: string; isHome: boolean; roles?: string[] };

async function fetchUserULs(userId: string): Promise<ULEntry[]> {
    try {
        const res = await db.execute({
            sql: `SELECT ul.id, ul.name, ul.slug, uu.is_home, uu.roles
                  FROM "UserUL" uu
                  JOIN "UniteLocale" ul ON ul.id = uu.ulId
                  WHERE uu.userId = ?
                  ORDER BY uu.is_home DESC, ul.name ASC`,
            args: [userId],
        });
        return res.rows.map(r => {
            const rolesStr = r.roles as string | null;
            const roles = rolesStr 
                ? rolesStr.split(',').map(role => role.trim()).filter(Boolean) 
                : undefined;
            return {
                id: r.id as string,
                name: r.name as string,
                slug: r.slug as string,
                isHome: !!r.is_home,
                roles,
            };
        });
    } catch {
        return [];
    }
}

/** Retourne l'ulId actif : UL d'appartenance (is_home=1) en priorité, sinon première UL disponible, sinon 'default' */
function resolveActiveUL(uls: ULEntry[]): string {
    if (uls.length === 0) return 'default';
    const home = uls.find(u => u.isHome);
    return home ? home.id : uls[0].id;
}

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
                const resUser = await db.execute({
                    sql: 'SELECT id FROM "User" WHERE email = ?',
                    args: [email],
                });
                if (resUser.rows.length === 0) {
                    return "/login?error=AccessDenied";
                }
            } catch (e) {
                console.error("Failed to verify user:", e);
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

        session.user.roles = (token.roles as string[]) || [];
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
                    token.impersonatedEmail = session.impersonateEmail; // string or null
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
                            const ulRoleRes = await db.execute({
                                sql: 'SELECT roles FROM "UserUL" WHERE userId = ? AND ulId = ?',
                                args: [token.userId, requestedUlId],
                            });
                            let activeRoles: string[] = [];
                            if (ulRoleRes.rows.length > 0 && ulRoleRes.rows[0].roles) {
                                activeRoles = (ulRoleRes.rows[0].roles as string).split(',').map(r => r.trim()).filter(Boolean);
                            }
                            if (activeRoles.length === 0) {
                                const rolesRes = await db.execute({
                                    sql: `
                                        SELECT r.name
                                        FROM "UserRole" ur
                                        JOIN "Role" r ON ur.roleId = r.id
                                        WHERE ur.userId = ?
                                    `,
                                    args: [token.userId],
                                });
                                activeRoles = rolesRes.rows.map(row => row.name as string);
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
                if (!token.ulId) {
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
                    if (!token.ulId) {
                        token.ulId = resolveActiveUL(token.availableULs);
                    }

                    // Retrieve roles based on the active UL
                    let activeRoles: string[] = [];
                    if (token.userId) {
                        if (token.ulId && token.ulId !== 'default') {
                            const ulRoleRes = await db.execute({
                                sql: 'SELECT roles FROM "UserUL" WHERE userId = ? AND ulId = ?',
                                args: [token.userId, token.ulId],
                            });
                            if (ulRoleRes.rows.length > 0 && ulRoleRes.rows[0].roles) {
                                activeRoles = (ulRoleRes.rows[0].roles as string).split(',').map(r => r.trim()).filter(Boolean);
                            }
                        }

                        if (activeRoles.length === 0) {
                            const rolesRes = await db.execute({
                                sql: `
                                    SELECT r.name
                                    FROM "UserRole" ur
                                    JOIN "Role" r ON ur.roleId = r.id
                                    WHERE ur.userId = ?
                                `,
                                args: [token.userId],
                            });
                            activeRoles = rolesRes.rows.map(row => row.name as string);
                        }
                    }
                    token.roles = activeRoles;
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

export const { handlers, signIn, signOut, auth } = NextAuth({
    providers,
    pages: {
        signIn: "/login",
        error: "/login",
    },
    callbacks: authCallbacks,
});

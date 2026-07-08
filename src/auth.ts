import NextAuth, { type DefaultSession } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";

declare module "next-auth" {
    interface Session {
        user: {
            id: string;
            roles: string[];
            originalEmail?: string;
            impersonatedEmail?: string;
        } & DefaultSession["user"];
    }
}

// ── Utilisateurs de test (dev uniquement) ────────────────────────────────────
const DEV_USERS: Record<string, { email: string; name: string; roles: string[] }> = {
    admin: { email: 'admin@dev.local',  name: 'Admin Dev',     roles: ['ADMIN', 'CHVL'] },
    respo: { email: 'respo@dev.local',  name: 'Respo Dev',     roles: ['RESPO', 'CHVL'] },
    chvl:  { email: 'chvl@dev.local',   name: 'Chauffeur Dev', roles: ['CHVL'] },
    guest: { email: 'guest@dev.local',  name: 'Inactif Dev',   roles: ['INACTIF'] },
    secouriste: { email: 'secouriste@dev.local', name: 'Secouriste Dev', roles: [] },
    ci:         { email: 'ci@dev.local',          name: 'CI/RPAPS Dev',  roles: ['CI/RPAPS'] },
    jeannoel:   { email: 'jeannoel.durand@croix-rouge.fr', name: 'Jean-Noël Durand', roles: ['ADMIN', 'CHVL'] },
};

const isDev = process.env.NODE_ENV === 'development';

// ── Providers ────────────────────────────────────────────────────────────────
const providers = [
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

    // Provider disponible uniquement en développement local
    ...(isDev ? [
        Credentials({
            id: 'dev-credentials',
            name: 'Dev Login',
            credentials: {
                role: { label: 'Rôle', type: 'text' },
            },
            async authorize(credentials) {
                const role = credentials?.role as string;
                const user = DEV_USERS[role];
                if (!user) return null;
                // devRoles est stocké dans le JWT → aucune requête DB nécessaire
                // devRoles is a custom field carried through to the jwt callback
                return { id: user.email, email: user.email, name: user.name, devRoles: user.roles } as Record<string, unknown>;
            },
        }),
    ] : []),
];

export const authCallbacks = {
    async signIn({ user, profile, account }) {
        // Dev credentials : pas de vérification de domaine
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

        // Dev : @dev.local bypass la vérification de domaine
        if (email?.endsWith('@dev.local')) {
            session.user.roles = (token.roles as string[]) || [];
            return session;
        }

        const emailToVerify = token.originalEmail as string;
        if (!emailToVerify || !emailToVerify.toLowerCase().endsWith("@croix-rouge.fr")) {
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
            token.devRoles = (user as Record<string, unknown>).devRoles;
        }

        // Store original email on first load
        if (user && user.email) {
            token.originalEmail = user.email;
        }

        if (!token.originalEmail && token.email) {
            token.originalEmail = token.email;
        }

        // Handle session update for impersonation
        if (trigger === "update" && session) {
            if (token.originalEmail === 'jeannoel.durand@croix-rouge.fr') {
                if (session.impersonateEmail !== undefined) {
                    token.impersonatedEmail = session.impersonateEmail; // string or null
                }
            }
        }

        // Work email: impersonated if active, otherwise original
        const emailToUse = (token.originalEmail === 'jeannoel.durand@croix-rouge.fr' && token.impersonatedEmail)
            ? token.impersonatedEmail
            : token.originalEmail;

        token.email = emailToUse;

        // Dev users : rôles depuis le JWT uniquement; userId = email (dev DB convention)
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
            return token;
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
                    
                    const rolesRes = await db.execute({
                        sql: `
                            SELECT r.name
                            FROM "UserRole" ur
                            JOIN "Role" r ON ur.roleId = r.id
                            WHERE ur.userId = ?
                        `,
                        args: [token.userId],
                    });
                    token.roles = rolesRes.rows.map(row => row.name as string);
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

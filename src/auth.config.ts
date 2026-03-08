import type { NextAuthConfig } from "next-auth";

/**
 * Configuration edge-safe : pas d'import de @libsql/client ni de Node.js natif.
 * Utilisé uniquement par le middleware (Edge Runtime).
 * Les callbacks nécessitant la DB (jwt, session, signIn) restent dans auth.ts.
 */
export const authConfig: NextAuthConfig = {
    pages: {
        signIn: "/login",
        error: "/login",
    },
    providers: [],
    callbacks: {
        authorized({ auth, request: { nextUrl } }) {
            const isLoggedIn = !!auth?.user;
            const isApiAuthRoute = nextUrl.pathname.startsWith('/api/auth');
            const isLoginRoute = nextUrl.pathname === '/login';

            if (isApiAuthRoute) return true;
            if (isLoginRoute) {
                if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
                return true;
            }
            if (!isLoggedIn) return false;
            return true;
        },
    },
};

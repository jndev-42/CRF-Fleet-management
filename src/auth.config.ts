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
            const pathname = nextUrl.pathname;

            // Public assets and auth APIs are always allowed
            const isPublicAsset = pathname.startsWith('/icons') ||
                                 pathname.startsWith('/manifest.json') ||
                                 pathname.startsWith('/crf-logo.svg') ||
                                 pathname.startsWith('/_next');
            const isApiAuthRoute = pathname.startsWith('/api/auth');

            if (isPublicAsset || isApiAuthRoute) return true;

            const isLoginRoute = pathname === '/login';
            const isInactifRoute = pathname === '/inactif';

            if (isLoginRoute) {
                if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
                return true;
            }

            if (!isLoggedIn) return false; // Redirect to login

            // Inactive user handling (logic from legacy proxy.ts)
            const roles = (auth?.user?.roles as string[] | undefined) ?? [];
            const isInactif = roles.length > 0 && roles.every(r => r === 'INACTIF');

            if (isInactif && !isInactifRoute) {
                return Response.redirect(new URL('/inactif', nextUrl));
            }

            if (!isInactif && isInactifRoute) {
                 return Response.redirect(new URL('/', nextUrl));
            }

            return true;
        },
    },
};

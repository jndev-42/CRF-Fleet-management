import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import {
    DEMO_COOKIE_NAME,
    DEMO_COOKIE_VALUE,
    DEMO_READ_ONLY_ERROR,
    isApiPath,
    isDemoBlockedRequest,
} from "./lib/demo/readOnly";

const authProxy = NextAuth(authConfig).auth;

/**
 * Pages : authentification NextAuth inchangée.
 * API : en mode démo (cookie), toute écriture non exemptée est refusée (403) ;
 * sinon la requête passe sans toucher à l'authentification (chaque route la gère).
 */
export default function proxy(req: NextRequest, ctx: unknown) {
    const { pathname } = req.nextUrl;

    if (isApiPath(pathname)) {
        const isDemo = req.cookies.get(DEMO_COOKIE_NAME)?.value === DEMO_COOKIE_VALUE;
        if (isDemo && isDemoBlockedRequest(pathname, req.method)) {
            return NextResponse.json({ error: DEMO_READ_ONLY_ERROR, demo: true }, { status: 403 });
        }
        return NextResponse.next();
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature NextAuth (NextMiddleware) non exportée ; on délègue telle quelle
    return (authProxy as any)(req, ctx);
}

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    matcher: ['/api/:path*', '/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};

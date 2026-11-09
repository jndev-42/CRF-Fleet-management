import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import NextAuth from "next-auth";
import { authConfig } from "./auth.config";
import {
    DEMO_COOKIE_NAME,
    DEMO_COOKIE_VALUE,
    DEMO_READ_ONLY_ERROR,
    DEMO_REQUEST_HEADER,
    isApiPath,
    isDemoBlockedRequest,
    isDemoDbConfigured,
    isDemoEligibleApi,
} from "./lib/demo/readOnly";

const authProxy = NextAuth(authConfig).auth;

/**
 * Pages : authentification NextAuth inchangée.
 * API : en mode démo (cookie), les écritures à effet externe (R2, Renault,
 * Web Push) sont refusées (403) ; les autres vont à la base démo (`src/lib/db.ts`).
 * Base démo non configurée : toute écriture non exemptée est refusée (garde-fou).
 * Les requêtes démo transmises reçoivent l'en-tête `x-crf-demo: 1` (lu par
 * `isDemoRequest()`), jamais les API QR publiques ni l'authentification.
 * Le proxy tourne sous Node (Next 16) : `process.env` y est lu à chaque requête.
 * Sinon la requête passe sans toucher à l'authentification (chaque route la gère).
 */
export default function proxy(req: NextRequest, ctx: unknown) {
    const { pathname } = req.nextUrl;

    if (isApiPath(pathname)) {
        const isDemo = req.cookies.get(DEMO_COOKIE_NAME)?.value === DEMO_COOKIE_VALUE;
        if (isDemo && isDemoBlockedRequest(pathname, req.method, isDemoDbConfigured())) {
            return NextResponse.json({ error: DEMO_READ_ONLY_ERROR, demo: true }, { status: 403 });
        }
        // Seul le proxy décide qu'une requête est démo : l'en-tête est toujours retiré
        // puis reposé si le cookie est là et que la route n'est ni QR ni auth.
        const headers = new Headers(req.headers);
        headers.delete(DEMO_REQUEST_HEADER);
        if (isDemo && isDemoEligibleApi(pathname)) headers.set(DEMO_REQUEST_HEADER, '1');
        return NextResponse.next({ request: { headers } });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- signature NextAuth (NextMiddleware) non exportée ; on délègue telle quelle
    return (authProxy as any)(req, ctx);
}

export const config = {
    // https://nextjs.org/docs/app/building-your-application/routing/middleware#matcher
    matcher: ['/api/:path*', '/((?!api|_next/static|_next/image|.*\\.png$).*)'],
};

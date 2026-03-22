import { auth } from '@/auth';
import { NextResponse } from 'next/server';

const EXEMPT_PREFIXES = ['/inactif', '/login', '/api/auth', '/api/', '/_next', '/icons', '/manifest.json', '/crf-logo.svg'];

export default auth(function proxy(req) {
    const { pathname } = req.nextUrl;

    if (EXEMPT_PREFIXES.some(p => pathname.startsWith(p))) {
        return NextResponse.next();
    }

    const roles = (req.auth?.user?.roles as string[] | undefined) ?? [];
    const isInactif = roles.length > 0 && roles.every(r => r === 'INACTIF');

    if (isInactif) {
        return NextResponse.redirect(new URL('/inactif', req.url));
    }

    return NextResponse.next();
});

export const config = {
    matcher: ['/((?!_next/static|_next/image).*)'],
};

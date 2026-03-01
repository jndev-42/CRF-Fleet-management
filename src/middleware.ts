export { auth as middleware } from "@/auth";

export const config = {
    // Regex: match all request paths except for the ones starting with:
    // - api (API routes)
    // - _next/static (static files)
    // - _next/image (image optimization files)
    // - favicon.ico (favicon file)
    // - public files
    // - public files
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};

import { auth } from "@/auth";

export default auth;

export const config = {
    /**
     * Ce matcher exclut du middleware toutes les requêtes vers :
     * - Les routes d'API (/api/*)
     * - Les assets Next.js (_next/static, _next/image)
     * - Les fichiers statiques publics : images, SVG, polices, JSON (manifest), scripts SW
     * - Le favicon
     *
     * IMPORTANT : manifest.json et sw.js DOIVENT être accessibles sans authentification
     * pour que la PWA fonctionne (le navigateur les charge sans cookie de session).
     */
    matcher: [
        '/((?!api|_next/static|_next/image|favicon\\.ico|.*\\.png|.*\\.jpg|.*\\.svg|.*\\.json|.*\\.js|.*\\.webp|.*\\.ico|.*\\.woff2?|.*\\.ttf|.*\\.vcf).*)'
    ],
};

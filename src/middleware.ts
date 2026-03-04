import { auth } from "@/auth";

export default auth;

export const config = {
    // Optionnel mais recommandé : 
    // Ce matcher exclut de passer au travers du middleware toutes les requêtes :
    // - vers les routes d'API
    // - vers les fichiers statiques de Next.js (_next/static, _next/image)
    // - vers le favicon et les images publiques
    matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.png|.*\\.jpg|.*\\.svg).*)'],
};

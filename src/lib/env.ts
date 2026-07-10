/**
 * Utilitaire central pour détecter l'environnement de l'application.
 *
 * En production (branche main sur Vercel) : NEXT_PUBLIC_APP_ENV est absent ou vaut 'production'.
 * En preview (branche preview sur Vercel) : NEXT_PUBLIC_APP_ENV=preview
 * En développement local : NODE_ENV=development
 *
 * Usage :
 *   import { isPreview, isDev } from '@/lib/env';
 */

export const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview';
export const isDev = process.env.NODE_ENV === 'development';

/** Vrai uniquement en production Vercel (branche main) */
export const isProd = !isPreview && !isDev;

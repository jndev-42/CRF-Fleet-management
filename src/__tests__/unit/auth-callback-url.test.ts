/**
 * Tests unitaires — `resolveCallbackUrl` (src/lib/auth-callback-url.ts).
 *
 * Régression couverte : un utilisateur non connecté scannant un QR code
 * (`/qr/<token>` ou `/qr-stock/<token>`) est redirigé par NextAuth vers
 * `/login?callbackUrl=<url absolue>`. L'ancien garde-fou (`startsWith('/')`)
 * rejetait toujours cette URL absolue et retombait sur `/`, forçant à
 * re-scanner après connexion.
 */
import { describe, it, expect } from 'vitest';
import { resolveCallbackUrl } from '@/lib/auth-callback-url';

describe('resolveCallbackUrl', () => {
    it('conserve un chemin relatif tel quel', () => {
        expect(resolveCallbackUrl('/qr/AbCd1234', 'app.example.org')).toBe('/qr/AbCd1234');
    });

    it('rejette un chemin protocol-relative (//) même avec host correspondant', () => {
        expect(resolveCallbackUrl('//evil.example.org/phish', 'app.example.org')).toBe('/');
    });

    it('extrait le chemin + query d’une URL absolue de même host', () => {
        expect(resolveCallbackUrl('https://app.example.org/qr-stock/xyz?foo=bar', 'app.example.org')).toBe('/qr-stock/xyz?foo=bar');
    });

    it('retombe sur / pour une URL absolue de host différent (open-redirect)', () => {
        expect(resolveCallbackUrl('https://evil.example.org/qr/AbCd1234', 'app.example.org')).toBe('/');
    });

    it('retombe sur / quand host est null', () => {
        expect(resolveCallbackUrl('https://app.example.org/qr/AbCd1234', null)).toBe('/');
    });

    it('retombe sur / pour une valeur qui n’est ni un chemin ni une URL valide', () => {
        expect(resolveCallbackUrl('not a url', 'app.example.org')).toBe('/');
    });
});

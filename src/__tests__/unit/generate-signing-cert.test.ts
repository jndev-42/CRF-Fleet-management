// @vitest-environment node
/**
 * Non-régression du générateur de certificat.
 *
 * Un CN accentué produisait un PKCS#12 corrompu : node-forge conservait « ç » et
 * le tiret cadratin comme points de code JavaScript > 255 au lieu de les encoder
 * en octets UTF-8, et l'encodage base64 les tronquait. Le certificat paraissait
 * normal mais son en-tête DER annonçait plus d'octets qu'il n'en contenait, et il
 * n'échouait qu'au premier scellement réel.
 */

import { describe, it, expect } from 'vitest';
import forge from 'node-forge';
import { generate } from '../../../scripts/generate-signing-cert';

/** Vérifie qu'une chaîne base64 est complète et réversible à l'octet près. */
function assertRoundTrip(b64: string): Buffer {
    expect(b64.length % 4).toBe(0);
    const decoded = Buffer.from(b64, 'base64');
    expect(decoded.toString('base64')).toBe(b64);

    // L'en-tête ASN.1 annonce la taille totale : elle doit correspondre.
    expect(decoded[0]).toBe(0x30);
    const declared = 4 + ((decoded[2] << 8) | decoded[3]);
    expect(decoded.length).toBe(declared);
    return decoded;
}

describe('generate-signing-cert', () => {
    it('produit un base64 réversible pour un CN ASCII', () => {
        assertRoundTrip(generate('CRF Notes de frais', 'motdepasse'));
    }, 30_000);

    it('produit un base64 réversible pour un CN ACCENTUÉ', () => {
        // Le CN par défaut du script : la régression venait précisément de là.
        assertRoundTrip(generate('Croix-Rouge française — Notes de frais', 'motdepasse'));
    }, 30_000);

    it('génère un PKCS#12 réellement déchiffrable', () => {
        const passphrase = 'ma-passphrase';
        const der = assertRoundTrip(generate('Croix-Rouge française — Paris 18', passphrase));

        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary')));
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, passphrase);
        const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
        expect(bags && bags.length).toBeGreaterThan(0);
    }, 30_000);

    it('émet un certificat valide bien au-delà de la durée d\'archivage de 10 ans', () => {
        const der = assertRoundTrip(generate('Test', 'p'));
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary')));
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, 'p');
        const bag = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0];
        const years = (bag.cert!.validity.notAfter.getTime() - Date.now()) / (365.25 * 86_400_000);
        expect(years).toBeGreaterThan(25);
    }, 30_000);
});

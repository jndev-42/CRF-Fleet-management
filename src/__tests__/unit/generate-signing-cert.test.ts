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
import { generate, ENV_PREFIXES, parseEnvironnement, BASE_COMMON_NAME } from '../../../scripts/generate-signing-cert';

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
    it('n\'émet que des sujets ASCII, y compris pour l\'organisation', () => {
        const der = assertRoundTrip(generate('CRF Notes de frais', 'motdepasse'));
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(der.toString('latin1')));
        const p12 = forge.pkcs12.pkcs12FromAsn1(asn1, 'motdepasse');
        const cert = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag]![0].cert!;
        for (const attr of cert.subject.attributes) {
            expect(String(attr.value ?? '')).toMatch(/^[\x20-\x7e]*$/);
        }
    }, 30_000);

    it('produit un base64 réversible pour un CN ASCII', () => {
        assertRoundTrip(generate('CRF Notes de frais', 'motdepasse'));
    }, 30_000);

    it('REFUSE un CN accentué — il rendrait les signatures invérifiables', () => {
        // Un caractère non-ASCII dans le sujet casse le lien entre le SignerInfo
        // et le certificat : OpenSSL répond « signer certificate not found »,
        // Acrobat « erreurs relatives aux informations contenues ». Les condensats
        // restant corrects, le défaut échappe à toute vérification maison — mieux
        // vaut donc refuser à la génération que produire un certificat inutilisable.
        expect(() => generate('Croix-Rouge française — Notes de frais', 'motdepasse'))
            .toThrow(/non-ASCII/);
    }, 30_000);

    it('génère un PKCS#12 réellement déchiffrable', () => {
        const passphrase = 'ma-passphrase';
        const der = assertRoundTrip(generate('Croix-Rouge francaise - Paris 18', passphrase));

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

describe('préfixe d\'environnement', () => {
    it('préfixe local et preview, laisse la production nue', () => {
        expect(ENV_PREFIXES.local).toBe('LOCAL - ');
        expect(ENV_PREFIXES.preview).toBe('PREVIEW - ');
        // La production ne porte aucun préfixe : c'est la référence.
        expect(ENV_PREFIXES.prod).toBe('');
    });

    it('n\'utilise que de l\'ASCII dans les préfixes et le nom de base', () => {
        // Un accent rendrait les signatures invérifiables, préfixe compris.
        for (const p of Object.values(ENV_PREFIXES)) expect(p).toMatch(/^[\x20-\x7e]*$/);
        expect(BASE_COMMON_NAME).toMatch(/^[\x20-\x7e]+$/);
    });

    it('refuse un environnement inconnu plutôt que de retomber sur la production', () => {
        // Un repli silencieux produirait un certificat de test indiscernable
        // d'un certificat de production dans le panneau Signatures.
        expect(() => parseEnvironnement('staging')).toThrow(/Environnement inconnu/);
        expect(() => parseEnvironnement('')).toThrow(/Environnement inconnu/);
    });

    it('accepte les trois environnements attendus', () => {
        for (const e of ['local', 'preview', 'prod']) {
            expect(parseEnvironnement(e)).toBe(e);
        }
    });
});


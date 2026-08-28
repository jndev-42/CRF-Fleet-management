/**
 * Génère un certificat auto-signé PKCS#12 (.p12) pour le scellement cryptographique
 * des notes de frais, et l'émet en base64 prêt à coller dans les variables
 * d'environnement Vercel.
 *
 * Décision D1 (spec) : certificat auto-signé assumé. Adobe Acrobat affichera
 * « signature valide, identité inconnue » (bandeau bleu). Le critère retenu est la
 * DÉTECTION D'ALTÉRATION, pas la reconnaissance par une autorité AATL/eIDAS.
 *
 * Décision C-10 : validité 30 ans. Les notes de frais sont archivées 10 ans et
 * l'horodatage RFC-3161 est hors périmètre — sans jeton tiers, un certificat expiré
 * rendrait tout le corpus invérifiable. 30 ans place l'expiration bien au-delà de
 * l'horizon d'archivage. Le coût d'une validité longue est nul.
 *
 * Ce script n'écrit AUCUN secret dans le dépôt : il imprime sur stdout.
 *
 * Usage :
 *   npx tsx scripts/generate-signing-cert.ts [--cn "Nom"] [--passphrase "..."]
 *
 * Puis coller dans Vercel (et dans .env.local pour le développement) :
 *   SIGNING_CERT_P12_BASE64=<sortie>
 *   SIGNING_CERT_PASSPHRASE=<passphrase>
 */

import forge from 'node-forge';

const VALIDITY_YEARS = 30;
const KEY_BITS = 2048;

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

function generate(commonName: string, passphrase: string): string {
    const keys = forge.pki.rsa.generateKeyPair(KEY_BITS);
    const cert = forge.pki.createCertificate();

    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(19));

    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(
        now.getFullYear() + VALIDITY_YEARS,
        now.getMonth(),
        now.getDate()
    );

    const attrs = [
        { name: 'commonName', value: commonName },
        { name: 'organizationName', value: 'Croix-Rouge française' },
        { name: 'countryName', value: 'FR' },
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs); // auto-signé : émetteur == sujet

    cert.setExtensions([
        { name: 'basicConstraints', cA: false },
        // digitalSignature + nonRepudiation : usage requis pour une signature PDF
        { name: 'keyUsage', digitalSignature: true, nonRepudiation: true },
        { name: 'extKeyUsage', emailProtection: true },
    ]);

    cert.sign(keys.privateKey, forge.md.sha256.create());

    const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], passphrase, {
        algorithm: '3des',
    });

    return forge.util.encode64(forge.asn1.toDer(p12Asn1).getBytes());
}

function main(): void {
    const commonName = arg('cn', 'Croix-Rouge française — Notes de frais');
    const passphrase = arg('passphrase', forge.util.bytesToHex(forge.random.getBytesSync(16)));

    process.stderr.write(`Génération d'un certificat RSA ${KEY_BITS} bits, validité ${VALIDITY_YEARS} ans...\n`);
    const base64 = generate(commonName, passphrase);

    process.stderr.write('\n--- À coller dans Vercel et dans .env.local ---\n');
    console.log(`SIGNING_CERT_P12_BASE64=${base64}`);
    console.log(`SIGNING_CERT_PASSPHRASE=${passphrase}`);
    process.stderr.write(`\nCertificat : CN="${commonName}", expire le ${new Date(
        new Date().getFullYear() + VALIDITY_YEARS,
        new Date().getMonth(),
        new Date().getDate()
    ).toLocaleDateString('fr-FR')}\n`);
    process.stderr.write('Ne committez JAMAIS ces valeurs.\n');
}

main();

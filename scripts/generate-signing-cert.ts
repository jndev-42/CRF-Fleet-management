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

export function generate(commonName: string, passphrase: string): string {
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

    // `@types/node-forge` déclare `valueTagClass?: asn1.Class`, alors que
    // node-forge y attend un `asn1.Type` : `x509.js` initialise ce champ à
    // `asn1.Type.PRINTABLESTRING` puis le compare à `asn1.Type.UTF8`. La valeur
    // passée est donc correcte — c'est la déclaration de types qui est fausse.
    const UTF8_TAG = forge.asn1.Type.UTF8 as unknown as forge.asn1.Class;

    // ⚠️ `valueTagClass: UTF8` est OBLIGATOIRE dès qu'une valeur contient un
    // caractère non-ASCII (« ç », tiret cadratin…). Sans lui, node-forge conserve
    // ces caractères comme points de code JavaScript > 255 au lieu de les encoder
    // en octets UTF-8 ; l'encodage base64 les tronque alors silencieusement et
    // produit un certificat invalide, dont l'en-tête DER annonce plus d'octets
    // qu'il n'en contient. C'est de surcroît l'encodage ASN.1 correct :
    // PrintableString n'admet pas les caractères accentués.
    const attrs = [
        { name: 'commonName', value: commonName, valueTagClass: UTF8_TAG },
        { name: 'organizationName', value: 'Croix-Rouge française', valueTagClass: UTF8_TAG },
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

    const der = forge.asn1.toDer(p12Asn1).getBytes();

    // Auto-contrôle : le script ne doit JAMAIS émettre un certificat que
    // l'application refusera. On vérifie que l'encodage est réversible à
    // l'octet près avant de l'imprimer.
    const stray = [...der].filter(c => c.charCodeAt(0) > 255).length;
    if (stray > 0) {
        throw new Error(
            `Encodage corrompu : ${stray} caractère(s) hors de la plage 0-255 dans le DER. ` +
            `Une valeur non-ASCII n'a pas été encodée en UTF-8.`
        );
    }

    const b64 = forge.util.encode64(der);
    const roundTrip = Buffer.from(b64, 'base64');
    if (b64.length % 4 !== 0 || roundTrip.length !== der.length) {
        throw new Error(
            `Base64 non réversible : ${b64.length} caractères, ${roundTrip.length} octets décodés ` +
            `pour ${der.length} attendus. Le certificat aurait été rejeté à l'usage.`
        );
    }

    return b64;
}

function main(): void {
    const commonName = arg('cn', 'Croix-Rouge française — Notes de frais');
    const passphrase = arg('passphrase', forge.util.bytesToHex(forge.random.getBytesSync(16)));

    process.stderr.write(`Génération d'un certificat RSA ${KEY_BITS} bits, validité ${VALIDITY_YEARS} ans...\n`);
    const base64 = generate(commonName, passphrase);

    process.stderr.write('\n--- À coller dans Vercel et dans .env.local ---\n');
    console.log(`SIGNING_CERT_P12_BASE64=${base64}`);
    console.log(`SIGNING_CERT_PASSPHRASE=${passphrase}`);
    process.stderr.write(`\nEncodage vérifié : ${base64.length} caractères base64, réversible à l'octet près.\n`);
    process.stderr.write(`Certificat : CN="${commonName}", expire le ${new Date(
        new Date().getFullYear() + VALIDITY_YEARS,
        new Date().getMonth(),
        new Date().getDate()
    ).toLocaleDateString('fr-FR')}\n`);
    process.stderr.write('Ne committez JAMAIS ces valeurs.\n');
}

// Ne s'exécute que lancé directement, pour rester importable par les tests.
if (process.argv[1] && process.argv[1].endsWith('generate-signing-cert.ts')) main();

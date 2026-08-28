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
 *   npx tsx scripts/generate-signing-cert.ts --env local     # défaut
 *   npx tsx scripts/generate-signing-cert.ts --env preview
 *   npx tsx scripts/generate-signing-cert.ts --env prod
 *   npx tsx scripts/generate-signing-cert.ts --env prod --cn "Autre nom" --passphrase "..."
 *
 * Le nom du signataire est préfixé selon l'environnement, de sorte qu'un
 * document scellé indique d'emblée d'où il provient : Acrobat affiche par
 * exemple « Certifié par LOCAL - Croix-Rouge francaise - Notes de frais ». Seule
 * la production est sans préfixe.
 *
 * Puis coller dans l'environnement correspondant :
 *   SIGNING_CERT_P12_BASE64=<sortie>
 *   SIGNING_CERT_PASSPHRASE=<passphrase>
 */

import forge from 'node-forge';

const VALIDITY_YEARS = 30;
const KEY_BITS = 2048;

/**
 * ⚠️ SANS ACCENT, ET CE N'EST PAS UN DÉTAIL DE STYLE.
 *
 * Tout caractère non-ASCII dans le sujet du certificat rend les signatures
 * INVÉRIFIABLES. `@signpdf/signer-p12` construit le `SignerInfo` en ré-encodant
 * en UTF-8 un nom qui contient déjà des octets UTF-8 : l'émetteur y occupe alors
 * plus d'octets que dans le certificat lui-même, et plus aucun validateur ne
 * peut relier les deux.
 *
 * Symptômes : OpenSSL répond « signer certificate not found », Acrobat affiche
 * « Il y a des erreurs relatives au formatage ou aux informations contenues dans
 * cette signature ». Les condensats restent pourtant corrects, ce qui rend le
 * défaut invisible à toute vérification maison.
 */
const ORGANIZATION = 'Croix-Rouge francaise';

export const BASE_COMMON_NAME = 'Croix-Rouge francaise - Notes de frais';

/**
 * Préfixe apposé au nom du signataire selon l'environnement.
 *
 * Un certificat de test ne doit jamais pouvoir passer pour un certificat de
 * production : le préfixe rend l'origine d'un document visible dans le panneau
 * Signatures d'Acrobat, sans avoir à inspecter quoi que ce soit.
 *
 * Les préfixes sont volontairement ASCII : un accent rendrait les signatures
 * invérifiables (voir la note sur ORGANIZATION).
 */
export const ENV_PREFIXES = {
    local: 'LOCAL - ',
    preview: 'PREVIEW - ',
    prod: '',
} as const;

type Environnement = keyof typeof ENV_PREFIXES;

export function parseEnvironnement(valeur: string): Environnement {
    if (valeur in ENV_PREFIXES) return valeur as Environnement;
    throw new Error(
        `Environnement inconnu : « ${valeur} ». Valeurs acceptées : ${Object.keys(ENV_PREFIXES).join(', ')}.`
    );
}

/** Rejette toute valeur qui produirait un certificat inutilisable. */
function assertAscii(champ: string, valeur: string): void {
    if (/[^\x20-\x7e]/.test(valeur)) {
        const fautifs = [...valeur].filter(c => c.charCodeAt(0) > 0x7e || c.charCodeAt(0) < 0x20);
        throw new Error(
            `${champ} contient des caractères non-ASCII : ${JSON.stringify(fautifs.join(''))}.\n` +
            `Un accent dans le sujet du certificat rend TOUTES les signatures invérifiables ` +
            `(Acrobat : « erreurs relatives aux informations contenues »).\n` +
            `Utilisez par exemple « Croix-Rouge francaise - Notes de frais ».`
        );
    }
}

function arg(name: string, fallback: string): string {
    const i = process.argv.indexOf(`--${name}`);
    return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

export function generate(commonName: string, passphrase: string): string {
    assertAscii('Le nom du signataire (--cn)', commonName);
    assertAscii('L\'organisation', ORGANIZATION);

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
        { name: 'organizationName', value: ORGANIZATION },
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
    // Défaut volontairement le moins engageant : générer par mégarde un
    // certificat de production serait plus gênant que l'inverse.
    const environnement = parseEnvironnement(arg('env', 'local'));
    const nomBase = arg('cn', BASE_COMMON_NAME);
    const commonName = `${ENV_PREFIXES[environnement]}${nomBase}`;
    const passphrase = arg('passphrase', forge.util.bytesToHex(forge.random.getBytesSync(16)));

    process.stderr.write(`Environnement : ${environnement}${environnement === 'prod' ? ' (sans préfixe)' : ''}\n`);
    process.stderr.write(`Génération d'un certificat RSA ${KEY_BITS} bits, validité ${VALIDITY_YEARS} ans...\n`);
    const base64 = generate(commonName, passphrase);

    process.stderr.write(`\n--- À coller dans l'environnement « ${environnement} » ---\n`);
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

/**
 * Scellement cryptographique des PDF de notes de frais.
 *
 * Chaîne d'une passe :
 *   addPlaceholderToField (remplit un champ existant) → signpdf.sign
 *
 * Les trois champs de signature sont créés en amont, sur le document non signé
 * (`addSignatureFields`). Chaque passe se contente d'en remplir un : c'est la
 * seule modification qu'autorise la certification DocMDP posée par la première.
 *
 * Chaque passe est un INCREMENTAL UPDATE strictement additif : les octets des
 * signatures antérieures ne sont jamais réécrits, donc leurs condensats restent
 * valides. `assertIncrementalAppend` le vérifie à chaque appel.
 */

import forge from 'node-forge';
import { SignPdf } from '@signpdf/signpdf';
import { P12Signer } from '@signpdf/signer-p12';
import { addPlaceholderToField, assertIncrementalAppend } from './incremental';

export class SigningError extends Error {}

/**
 * Longueur réservée pour le PKCS#7 dans `/Contents`.
 *
 * ⚠️ JAMAIS la valeur DER mesurée nue : `signpdf` lève « Signature exceeds
 * placeholder length » au moindre dépassement, et la taille varie légèrement d'une
 * signature à l'autre. 8192 offre une marge confortable pour un P12 RSA 2048.
 */
export const SIGNATURE_LENGTH = 8192;

/**
 * Buffer du certificat, décodé une fois par instance de lambda.
 *
 * ⚠️ ON NE CACHE QUE LE BUFFER, JAMAIS UNE INSTANCE `P12Signer`. Le constructeur
 * de `P12Signer` construit un `forge.util.ByteBuffer` que `sign()` CONSOMME via
 * `forge.asn1.fromDer`. Réutiliser l'instance fait échouer le 2e scellement avec
 * « Too few bytes to parse DER {available: 0} » — panne intermittente qui ne se
 * manifeste que sur un lambda chaud.
 */
let cachedP12: Buffer | null = null;

function p12Buffer(): Buffer {
    if (cachedP12) return cachedP12;
    const b64 = (process.env.SIGNING_CERT_P12_BASE64 || '').trim();
    if (!b64) throw new SigningError('SIGNING_CERT_P12_BASE64 n\'est pas configurée.');
    try {
        cachedP12 = Buffer.from(b64, 'base64');
    } catch {
        throw new SigningError('SIGNING_CERT_P12_BASE64 n\'est pas un base64 valide.');
    }
    if (!cachedP12.length) throw new SigningError('SIGNING_CERT_P12_BASE64 est vide après décodage.');
    return cachedP12;
}

/** Construit un signer NEUF — voir l'avertissement sur le cache ci-dessus. */
function freshSigner(): P12Signer {
    return new P12Signer(p12Buffer(), {
        passphrase: (process.env.SIGNING_CERT_PASSPHRASE || '').trim(),
    });
}

/**
 * Valide la configuration du certificat au démarrage, pour échouer avec un message
 * lisible plutôt qu'avec une erreur DER opaque au premier scellement réel.
 *
 * ⚠️ Construire un `P12Signer` NE SUFFIT PAS : son constructeur se contente
 * d'envelopper le buffer, et le parsing n'a lieu qu'au premier `sign()`. Un
 * certificat tronqué — cas classique d'une variable d'environnement copiée
 * incomplètement — passerait donc le contrôle et ne casserait qu'en production.
 * On déchiffre donc réellement le PKCS#12 ici.
 *
 * Le signer construit est JETABLE et jeté : le conserver recréerait le bug de
 * consommation du ByteBuffer.
 */
export function assertSigningCertConfigured(): void {
    const buf = p12Buffer();

    // Contrôle de complétude avant tout : l'en-tête DER annonce la taille totale.
    if (buf.length < 4 || buf[0] !== 0x30) {
        throw new SigningError(
            'SIGNING_CERT_P12_BASE64 ne contient pas une structure PKCS#12 valide ' +
            '(un fichier .p12 commence par l\'octet 0x30).'
        );
    }
    const declared = 4 + ((buf[2] << 8) | buf[3]);
    if (buf.length < declared) {
        throw new SigningError(
            `SIGNING_CERT_P12_BASE64 est TRONQUÉ : ${buf.length} octets décodés alors que ` +
            `la structure en annonce ${declared}. La valeur a probablement été copiée ` +
            `incomplètement — recopiez-la intégralement, y compris le « == » final.`
        );
    }

    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
        const asn1 = forge.asn1.fromDer(forge.util.createBuffer(buf.toString('binary')));
        p12 = forge.pkcs12.pkcs12FromAsn1(asn1, (process.env.SIGNING_CERT_PASSPHRASE || '').trim());
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new SigningError(
            /password|mac/i.test(msg)
                ? 'SIGNING_CERT_PASSPHRASE ne correspond pas au certificat fourni.'
                : `Certificat de signature illisible : ${msg}`
        );
    }

    // ── Sujet du certificat : ASCII obligatoire ──────────────────────────────
    // Un caractère accentué rend TOUTES les signatures invérifiables :
    // `@signpdf/signer-p12` ré-encode en UTF-8, pour construire le `SignerInfo`,
    // un nom qui contient déjà des octets UTF-8. L'émetteur y occupe alors plus
    // d'octets que dans le certificat, et plus aucun validateur ne peut relier
    // les deux — OpenSSL répond « signer certificate not found », Acrobat
    // « erreurs relatives aux informations contenues dans cette signature ».
    //
    // Le piège est que les condensats restent corrects : le défaut est invisible
    // à toute vérification maison, et n'apparaît que dans un vrai lecteur PDF.
    const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag];
    const cert = certBags?.[0]?.cert;
    if (!cert) throw new SigningError('Le certificat ne contient aucune entrée exploitable.');

    for (const attr of cert.subject.attributes) {
        const value = String(attr.value ?? '');
        if (/[^\x20-\x7e]/.test(value)) {
            throw new SigningError(
                `Le sujet du certificat contient un caractère non-ASCII dans « ${attr.name ?? attr.type} » : ` +
                `« ${value} ». Les signatures produites seraient invérifiables. ` +
                `Régénérez le certificat avec un sujet sans accent ` +
                `(npx tsx scripts/generate-signing-cert.ts).`
            );
        }
    }

    // Le signer lui-même doit pouvoir être instancié.
    freshSigner();
}

export interface SealOptions {
    /** Motif affiché dans le panneau Signatures. */
    reason: string;
    /** Nom du signataire. */
    name: string;
    /**
     * Horodatage de la signature.
     *
     * ⚠️ Passé DEUX FOIS, volontairement : à la pose de l'emplacement (qui écrit
     * `/M`, la date que les lecteurs PDF affichent) ET à `sign()` (qui la place
     * dans les attributs authentifiés PKCS#7). Les régler séparément les ferait
     * diverger silencieusement entre l'affichage et la preuve cryptographique.
     */
    signingTime: Date;
    /** Nom du champ à remplir — créé en amont par `addSignatureFields`. */
    fieldName: string;
    /** Niveau DocMDP — signature de certification (la 1re) uniquement. */
    docMdpLevel?: 1 | 2 | 3;
    /** Tracé manuscrit rendu dans le widget. Le champ doit avoir une surface. */
    appearancePng?: Buffer;
}

/**
 * Applique une passe de scellement.
 *
 * @throws {SigningError} si la configuration ou les options sont incohérentes.
 * @throws {IncrementalUpdateError} si le résultat n'est pas une extension stricte.
 */
export async function sealPdf(input: Buffer, opts: SealOptions): Promise<Buffer> {
    // Tout le contenu de la révision — DocMDP et apparence compris — est écrit
    // AVANT sign() : le /ByteRange doit être calculé sur le buffer définitif.
    const withPlaceholder = await addPlaceholderToField(input, {
        fieldName: opts.fieldName,
        reason: opts.reason,
        contactInfo: 'notes-de-frais@croix-rouge.fr',
        name: opts.name,
        location: 'France',
        signingTime: opts.signingTime,
        signatureLength: SIGNATURE_LENGTH,
        docMdpLevel: opts.docMdpLevel,
        appearancePng: opts.appearancePng,
    });

    const signed = await new SignPdf().sign(withPlaceholder, freshSigner(), opts.signingTime);

    // Garde-fou : refuse de rendre un buffer qui aurait réécrit le passé.
    assertIncrementalAppend(input, signed);
    return signed;
}

/** Décode l'image base64 d'une signature front (`data:image/png;base64,…`). */
export function decodeSignatureImage(dataUrl: string | null | undefined): Buffer | null {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const comma = dataUrl.indexOf(',');
    const payload = dataUrl.startsWith('data:') && comma !== -1 ? dataUrl.slice(comma + 1) : dataUrl;
    try {
        const buf = Buffer.from(payload, 'base64');
        return buf.length ? buf : null;
    } catch {
        return null;
    }
}

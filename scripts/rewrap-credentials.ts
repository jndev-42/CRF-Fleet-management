/**
 * Rotation de la clé de chiffrement — re-chiffre les secrets encore protégés
 * par `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` avec la clé courante.
 *
 * C'est LE mécanisme de sortie de rotation, et le seul déterministe : le
 * rewrap paresseux du chemin applicatif ne touche que les credentials
 * réellement lus, donc jamais ceux d'une UL sans véhicule connecté.
 *
 * Procédure complète :
 *   1. nouvelle clé en `CREDENTIALS_ENCRYPTION_KEY`, ancienne en
 *      `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS` — sur Production, Preview ET
 *      Development. Redéployer.
 *   2. `npx tsx scripts/rewrap-credentials.ts` puis `--apply`.
 *   3. Relancer jusqu'à « 0 ligne à re-chiffrer », puis SEULEMENT alors
 *      supprimer `CREDENTIALS_ENCRYPTION_KEY_PREVIOUS`.
 *
 * ⚠️ Le critère « `updatedAt` antérieur à la rotation » est volontairement
 * ABANDONNÉ : il ne converge jamais pour une UL jamais lue, et descend à tort
 * dès qu'un PATCH sans rapport touche `updatedAt`. Le seul critère fiable est
 * `needsRewrap()`, qui interroge le payload lui-même.
 *
 * ⚠️ Aucun clair n'est journalisé, à aucun moment.
 *
 * Usage :
 *   npx tsx scripts/rewrap-credentials.ts            # dry-run (défaut)
 *   npx tsx scripts/rewrap-credentials.ts --apply    # exécution réelle
 */
import { createClient } from '@libsql/client';
import { decryptSecret, encryptSecret, keyFingerprint, needsRewrap } from '../src/lib/crypto';
import { getErrorMessage } from '../src/lib/utils/error';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

const APPLY = process.argv.includes('--apply');

async function run() {
    console.log(`\n▶ Rotation des secrets BrandCredential (${APPLY ? 'APPLY' : 'dry-run'})...`);
    console.log(`  Clé courante : keyFingerprint = ${keyFingerprint()}`);
    if (!process.env.CREDENTIALS_ENCRYPTION_KEY_PREVIOUS) {
        console.log('  ℹ CREDENTIALS_ENCRYPTION_KEY_PREVIOUS non définie : rien ne peut nécessiter un rewrap.');
    }

    const rows = await db.execute(
        'SELECT "id", "ulId", "brand", "passwordEncrypted" FROM "BrandCredential"'
    );

    let upToDate = 0;
    let rewrapped = 0;
    let failed = 0;

    for (const row of rows.rows) {
        const id = String(row.id);
        const label = `${row.ulId}/${row.brand}`;
        try {
            if (!needsRewrap(String(row.passwordEncrypted))) {
                upToDate++;
                continue;
            }

            if (!APPLY) {
                rewrapped++;
                console.log(`  ▶ ${label} : serait re-chiffrée avec la clé courante`);
                continue;
            }

            // Le clair ne quitte pas cette portée et n'est jamais journalisé.
            const fresh = encryptSecret(decryptSecret(String(row.passwordEncrypted)));
            await db.execute({
                sql: 'UPDATE "BrandCredential" SET "passwordEncrypted" = ?, "updatedAt" = ? WHERE "id" = ?',
                args: [fresh, new Date().toISOString(), id],
            });
            rewrapped++;
            console.log(`  ✓ ${label} : re-chiffrée`);
        } catch (e: unknown) {
            // Non fatal : une ligne illisible ne doit pas empêcher les autres
            // d'être remises à jour. Elle est comptée et reste visible.
            failed++;
            console.error(`  ✗ ${label} : ${getErrorMessage(e)}`);
        }
    }

    console.log(`\n  Déjà à jour            : ${upToDate}`);
    console.log(`  ${APPLY ? 'Re-chiffrées           ' : 'À re-chiffrer          '}: ${rewrapped}`);
    console.log(`  Illisibles (à traiter) : ${failed}`);

    if (APPLY && rewrapped === 0 && failed === 0) {
        console.log('\n✅ Aucune ligne restante : CREDENTIALS_ENCRYPTION_KEY_PREVIOUS peut être supprimée.\n');
    } else if (APPLY) {
        console.log('\n✅ Rotation appliquée. Relancez jusqu\'à « 0 à re-chiffrer » avant de supprimer _PREVIOUS.\n');
    } else {
        console.log('\nDry-run terminé. Relancez avec --apply pour écrire.\n');
    }

    if (failed > 0) process.exit(1);
}

run().catch((e: unknown) => {
    console.error('Erreur fatale :', getErrorMessage(e));
    process.exit(1);
});

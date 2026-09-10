/**
 * Migration prod : table `StellantisSession` (cache de jetons OAuth PSA).
 *
 * Dry-run par défaut ; `--apply` pour écrire.
 *
 * ## Pourquoi une table, et pas `RenaultSession`
 *
 * `RenaultSession` porte `idToken` et `accountId` : deux notions Gigya/Kamereon
 * sans équivalent PSA, qui a besoin d'un `accessToken` **et** d'un
 * `refreshToken`. Y ranger des jetons PSA reviendrait à détourner le sens de
 * colonnes existantes — un choix invisible à la lecture, et le premier à casser
 * au refactor suivant.
 *
 * Une table distincte laisse en outre le chemin Renault **strictement
 * inchangé** : aucune requête existante n'est touchée, donc aucun risque de
 * régression sur une flotte en production.
 *
 * ## Note sur la spec
 *
 * L'étude de faisabilité annonçait « aucune migration SQL » — vrai pour
 * `BrandCredential.brand` et `VehicleConnection.brand`, qui sont TEXT et
 * absorbent PSA tels quels, mais le cache de session avait été négligé.
 */
import { db } from '../src/lib/db';

const APPLY = process.argv.includes('--apply');

const STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS "StellantisSession" (
        "credentialId"  TEXT NOT NULL PRIMARY KEY REFERENCES "BrandCredential"("id") ON DELETE CASCADE,
        "accessToken"   TEXT NOT NULL,
        "refreshToken"  TEXT,
        "expiresAt"     INTEGER NOT NULL,
        "updatedAt"     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    // Le cache est purgé avec le compte : un jeton orphelin ne serait jamais
    // relu mais survivrait indéfiniment en base.
    `CREATE INDEX IF NOT EXISTS "StellantisSession_expiresAt_idx" ON "StellantisSession" ("expiresAt")`,
];

async function main(): Promise<void> {
    const existing = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'StellantisSession'`,
        args: [],
    });

    if (existing.rows.length > 0) {
        console.log('✅ StellantisSession existe déjà — rien à faire.');
        return;
    }

    console.log(APPLY ? '▶ Application de la migration…' : '▶ Dry-run (ajouter --apply pour écrire)\n');
    for (const sql of STATEMENTS) {
        console.log(sql.trim().split('\n')[0] + ' …');
        if (APPLY) await db.execute({ sql, args: [] });
    }

    console.log(
        APPLY
            ? '\n✅ StellantisSession créée.'
            : '\n⚠️ Rien écrit. Relancer avec --apply.'
    );
}

main().catch((e: unknown) => {
    console.error('❌ Migration en échec :', e instanceof Error ? e.message : String(e));
    process.exitCode = 1;
});

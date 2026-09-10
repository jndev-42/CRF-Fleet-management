/**
 * Porte G-4 — vérification LECTURE SEULE de la migration « connexion des
 * véhicules ». Aucune écriture, aucun login constructeur : ce script est sûr à
 * relancer autant de fois que nécessaire, y compris en production.
 *
 * Il est bloquant : tant qu'il n'est pas vert, pas de merge sur `main`.
 *
 * Contrôles :
 *   1. autant de VehicleConnection que de véhicules à VIN non vide ;
 *   2. chaque VehicleConnection.credentialId pointe sur une BrandCredential
 *      existante — les clés étrangères n'étant PAS appliquées dans ce repo, la
 *      cohérence référentielle doit être vérifiée à la main ;
 *   3. round-trip de déchiffrement ✓/✗ par ligne, sans jamais afficher le clair ;
 *   4. RenaultSession à credentialId NULL : 1 attendue avant le contract, 0 après ;
 *   5. plus aucune lecture de RENAULT_MAIL / RENAULT_PASS dans le code applicatif.
 *
 * Usage :
 *   npx tsx scripts/verify-vehicle-connections.ts
 */
import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';
import { decryptSecret, keyFingerprint } from '../src/lib/crypto';
import { getErrorMessage } from '../src/lib/utils/error';

const url = process.env.TURSO_DATABASE_URL;
const authToken = process.env.TURSO_AUTH_TOKEN;

if (!url || url.startsWith('file:')) {
    console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
    process.exit(1);
}

const db = createClient({ url, authToken });

let failures = 0;

function ok(message: string) {
    console.log(`  ✓ ${message}`);
}

function ko(message: string) {
    failures++;
    console.error(`  ✗ ${message}`);
}

/** 1 — comptages croisés. */
async function checkCounts() {
    console.log('\n▶ 1. Comptage véhicules à VIN vs VehicleConnection');

    const vehicles = await db.execute(`
        SELECT "id", "name", "ulId", "vin" FROM "Vehicle"
        WHERE "vin" IS NOT NULL AND TRIM("vin") != ''
    `);
    const connections = await db.execute('SELECT "vehicleId" FROM "VehicleConnection"');

    const connected = new Set(connections.rows.map(r => String(r.vehicleId)));
    const missing = vehicles.rows.filter(v => !connected.has(String(v.id)));

    console.log(`  Véhicules à VIN : ${vehicles.rows.length} · VehicleConnection : ${connections.rows.length}`);

    if (missing.length === 0 && vehicles.rows.length === connections.rows.length) {
        ok('Comptages alignés');
        return;
    }

    for (const v of missing) {
        // Cas P4 : un VIN sans connexion rend le kilométrage inaccessible.
        ko(`Véhicule ${v.id} (${v.name}, ul=${v.ulId}) a un VIN mais aucune VehicleConnection`);
    }
    if (missing.length === 0) {
        ko(`Écart de comptage sans véhicule manquant : ${connections.rows.length - vehicles.rows.length} connexion(s) orpheline(s) de véhicule`);
    }
}

/** 2 — intégrité référentielle, les FK n'étant pas appliquées. */
async function checkCredentialIntegrity() {
    console.log('\n▶ 2. Intégrité VehicleConnection.credentialId → BrandCredential.id');

    const orphans = await db.execute(`
        SELECT vc."id" AS id, vc."vehicleId" AS vehicleId, vc."credentialId" AS credentialId
        FROM "VehicleConnection" vc
        LEFT JOIN "BrandCredential" bc ON bc."id" = vc."credentialId"
        WHERE bc."id" IS NULL
    `);

    if (orphans.rows.length === 0) {
        ok('Aucun credentialId orphelin');
        return;
    }
    for (const r of orphans.rows) {
        ko(`VehicleConnection ${r.id} (véhicule ${r.vehicleId}) référence un credential inexistant`);
    }
}

/** 3 — déchiffrabilité de chaque secret, sans jamais exposer le clair. */
async function checkDecryption() {
    console.log('\n▶ 3. Round-trip de déchiffrement des BrandCredential');
    console.log(`  keyFingerprint = ${keyFingerprint()}`);

    const creds = await db.execute('SELECT "id", "ulId", "brand", "login", "passwordEncrypted" FROM "BrandCredential"');
    if (creds.rows.length === 0) {
        ko('Aucune BrandCredential en base');
        return;
    }

    for (const c of creds.rows) {
        const label = `${c.ulId}/${c.brand} (${c.login})`;
        try {
            // La longueur seule est journalisée : jamais le clair, jamais un extrait.
            const clear = decryptSecret(String(c.passwordEncrypted));
            if (clear.length === 0) {
                ko(`${label} : secret déchiffré vide`);
            } else {
                ok(`${label} : déchiffrable (${clear.length} caractères)`);
            }
        } catch (e: unknown) {
            ko(`${label} : ${getErrorMessage(e)}`);
        }
    }
}

/** 4 — état du contract sur RenaultSession. */
async function checkRenaultSession() {
    console.log('\n▶ 4. RenaultSession — lignes héritées (credentialId NULL)');

    const res = await db.execute('SELECT COUNT(*) AS n FROM "RenaultSession" WHERE "credentialId" IS NULL');
    const n = Number(res.rows[0]?.n ?? 0);

    if (n === 0) {
        ok('0 ligne héritée : le contract a été passé');
    } else if (n === 1) {
        ok('1 ligne héritée : attendu avant le contract (l\'ancien code garde son cache)');
    } else {
        ko(`${n} lignes héritées : une seule est attendue (ligne id = 1)`);
    }
}

/** 5 — plus aucune lecture d'identifiants de compte dans le code applicatif. */
function checkNoEnvCredentials() {
    console.log('\n▶ 5. Absence de RENAULT_MAIL / RENAULT_PASS dans le code applicatif');

    // Grep RESTREINT à src/app, src/lib et src/components : les tests
    // positionnent puis suppriment ces variables pour prouver que la lib n'en
    // dépend plus, un grep sur src/ entier serait donc faux.
    try {
        const out = execFileSync(
            'grep',
            ['-rn', 'RENAULT_MAIL\\|RENAULT_PASS', 'src/app/', 'src/lib/', 'src/components/'],
            { encoding: 'utf8' }
        );
        for (const line of out.trim().split('\n')) {
            ko(`Référence résiduelle : ${line}`);
        }
    } catch (e: unknown) {
        // grep sort en 1 quand il ne trouve rien : c'est précisément le succès.
        const status = (e as { status?: number }).status;
        if (status === 1) {
            ok('Aucune référence résiduelle');
        } else {
            ko(`grep a échoué : ${getErrorMessage(e)}`);
        }
    }
}

async function run() {
    await checkCounts();
    await checkCredentialIntegrity();
    await checkDecryption();
    await checkRenaultSession();
    checkNoEnvCredentials();

    if (failures === 0) {
        console.log('\n✅ Porte G-4 VERTE — la migration est cohérente.\n');
        return;
    }
    console.error(`\n❌ Porte G-4 ROUGE — ${failures} contrôle(s) en échec. Pas de merge.\n`);
    process.exit(1);
}

run().catch((e: unknown) => {
    console.error('Erreur fatale :', getErrorMessage(e));
    process.exit(1);
});

/**
 * Migration de production — Connexion des véhicules connectés (multi-marques).
 *
 * Crée `BrandCredential` (un compte constructeur par UL × marque, mot de passe
 * chiffré AES-256-GCM) et `VehicleConnection` (véhicule ↔ compte, VIN, statut),
 * puis ajoute la colonne additive `RenaultSession.credentialId` et son index
 * unique PARTIEL. Enfin, elle transpose le compte MyRenault global —
 * aujourd'hui en variables d'environnement `RENAULT_MAIL` / `RENAULT_PASS` —
 * en une `BrandCredential` par UL, et crée une `VehicleConnection` pour chaque
 * véhicule ayant déjà un VIN.
 *
 * ⚠️ CE SCRIPT N'EST PAS EN LECTURE SEULE, MÊME EN DRY-RUN.
 * La DDL s'exécute dans les deux modes : elle est idempotente et non
 * destructrice, et sans les tables le dry-run ne pourrait rien compter. Seules
 * les écritures de données sont gardées par `--apply`.
 *
 * ⚠️ Expand-only. Rien n'est supprimé : la ligne `RenaultSession id = 1`
 * survit, l'ancien code garde donc son cache pendant tout le rollout. Le
 * `contract` (`DELETE FROM RenaultSession WHERE credentialId IS NULL`) est une
 * étape distincte, différée à J+1.
 *
 * ⚠️ Porte anti-amplification Gigya : le compte MyRenault physique est unique
 * et verrouillable. Une `BrandCredential` par UL signifie une session Gigya par
 * UL, donc N logins en rafale au premier passage du cron. `--ul=<id>` est donc
 * OBLIGATOIRE en `--apply`, et le script REFUSE d'écrire si deux ULs ou plus
 * ont des véhicules à VIN (ce cas relève d'un plan distinct).
 * Histogramme prod du 2026-09-09 : N = 1 (`ul-paris-18`, 2 véhicules à VIN
 * sur 9) — la porte est un filet de sécurité si la prod change entre-temps.
 *
 * ⚠️ À lancer HORS de la fenêtre du cron `daily-mileage-check` (`59 23 * * *`) :
 * la vérification effectue elle-même un login Gigya, qui s'ajoute à ceux de
 * l'ancien code encore actif.
 *
 * Ordre de mise en service : dry-run prod → `--apply` prod → phase G
 * (`verify-vehicle-connections.ts`) → PUIS merge sur `main`.
 *
 * Usage :
 *   npx tsx scripts/add-vehicle-connections.ts                        # dry-run (défaut)
 *   npx tsx scripts/add-vehicle-connections.ts --apply --ul=ul-paris-18
 *   npx tsx scripts/add-vehicle-connections.ts --no-verify            # saute le login Gigya
 *
 * Variables requises : TURSO_DATABASE_URL (libsql://, jamais file:),
 * TURSO_AUTH_TOKEN, CREDENTIALS_ENCRYPTION_KEY, et — hors `--no-verify` ou en
 * `--apply` — RENAULT_MAIL, RENAULT_PASS, GIGYA_API_KEY.
 */
import { createClient, type Client } from '@libsql/client';
import { randomUUID } from 'node:crypto';
import { GigyaApi } from '@remscodes/renault-api';
import { decryptSecret, encryptSecret, keyFingerprint } from '../src/lib/crypto';
import { getErrorMessage } from '../src/lib/utils/error';

export const BRAND = 'RENAULT';

export interface MigrationOptions {
    /** `false` = dry-run : la DDL passe, aucune donnée n'est écrite. */
    apply: boolean;
    /** UL cible — obligatoire en `--apply` (porte anti-amplification). */
    ulId?: string;
}

export interface MigrationResult {
    /** Histogramme des véhicules à VIN par UL (`null` = véhicule sans UL). */
    histogram: { ulId: string | null; vehicles: number }[];
    credentialsCreated: number;
    credentialsSkipped: number;
    connectionsCreated: number;
    connectionsSkipped: number;
    /** Véhicules à VIN écartés : `ulId` NULL, ou hors de l'UL ciblée. */
    vehiclesIgnored: number;
}

/**
 * DDL idempotente et non destructrice, exécutée dans les deux modes.
 *
 * Les `REFERENCES` sont DOCUMENTAIRES : les clés étrangères ne sont pas
 * activées dans ce repo (aucun `PRAGMA foreign_keys`, cf. `src/lib/db.ts`).
 * Toute vérification d'unicité doit donc porter sur l'index unique, jamais
 * sur la FK.
 */
export async function ensureSchema(db: Client): Promise<void> {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS "BrandCredential" (
            "id"                TEXT NOT NULL PRIMARY KEY,
            "ulId"              TEXT NOT NULL REFERENCES "UniteLocale"("id") ON DELETE CASCADE,
            "brand"             TEXT NOT NULL,
            "login"             TEXT NOT NULL,
            "passwordEncrypted" TEXT NOT NULL,
            "createdAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "updatedAt"         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
    `);
    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "BrandCredential_ulId_brand_idx"
        ON "BrandCredential"("ulId", "brand")
    `);
    console.log('  ✓ Table BrandCredential et index BrandCredential_ulId_brand_idx prêts');

    await db.execute(`
        CREATE TABLE IF NOT EXISTS "VehicleConnection" (
            "id"            TEXT NOT NULL PRIMARY KEY,
            "vehicleId"     TEXT NOT NULL REFERENCES "Vehicle"("id") ON DELETE CASCADE,
            "credentialId"  TEXT NOT NULL REFERENCES "BrandCredential"("id"),
            "brand"         TEXT NOT NULL,
            "vin"           TEXT NOT NULL,
            "status"        TEXT NOT NULL DEFAULT 'CONNECTED',
            "lastError"     TEXT,
            "connectedAt"   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            "lastCheckedAt" DATETIME
        )
    `);
    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "VehicleConnection_vehicleId_idx"
        ON "VehicleConnection"("vehicleId")
    `);
    await db.execute(`
        CREATE INDEX IF NOT EXISTS "VehicleConnection_credentialId_idx"
        ON "VehicleConnection"("credentialId")
    `);
    console.log('  ✓ Table VehicleConnection et ses index prêts');

    // ── RenaultSession : colonne additive, jamais de reconstruction ───────────
    // La ligne `id = 1` doit survivre : c'est elle qui garde son cache à
    // l'ancien code pendant le déploiement Vercel, qui n'est pas atomique.
    const sessionTable = await db.execute({
        sql: `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
        args: ['RenaultSession'],
    });
    if (sessionTable.rows.length === 0) {
        console.log('  ⚠ Table RenaultSession absente : colonne credentialId et index partiel ignorés');
        return;
    }

    const cols = await db.execute(`PRAGMA table_info("RenaultSession")`);
    if (cols.rows.some(r => r.name === 'credentialId')) {
        console.log('  ℹ Colonne RenaultSession.credentialId déjà présente');
    } else {
        await db.execute(`ALTER TABLE "RenaultSession" ADD COLUMN "credentialId" TEXT`);
        console.log('  ✓ Colonne RenaultSession.credentialId ajoutée');
    }

    // Index unique PARTIEL : la ligne héritée `id = 1` a `credentialId` NULL et
    // ne doit pas entrer en conflit avec les lignes du nouveau cache.
    await db.execute(`
        CREATE UNIQUE INDEX IF NOT EXISTS "RenaultSession_credentialId_idx"
        ON "RenaultSession"("credentialId") WHERE "credentialId" IS NOT NULL
    `);
    console.log('  ✓ Index partiel RenaultSession_credentialId_idx prêt');
}

/** Round-trip de chiffrement : échoue AVANT toute écriture si la clé est absente ou fausse. */
function assertCryptoUsable(): void {
    const probe = `probe-${randomUUID()}`;
    if (decryptSecret(encryptSecret(probe)) !== probe) {
        throw new Error('Round-trip de chiffrement incohérent : migration interrompue');
    }
    console.log(`  ✓ Round-trip de chiffrement OK — keyFingerprint = ${keyFingerprint()}`);
}

/**
 * Login Gigya RÉEL, en lecture seule. Aucune écriture n'a lieu ici : la
 * fonction ne fait que prouver que le couple identifiant/mot de passe sur le
 * point d'être chiffré est bien accepté par le fournisseur.
 */
export async function verifyGigyaLogin(login: string, password: string, apiKey: string): Promise<void> {
    const loginUrl = new URL(GigyaApi.LOGIN_URL);
    loginUrl.searchParams.set('apikey', apiKey);
    loginUrl.searchParams.set('loginID', login);
    loginUrl.searchParams.set('password', password);

    const res = await fetch(loginUrl, { method: 'POST' }).then(r => r.json());
    if (res.errorCode !== 0) {
        // `errorMessage` est un libellé Gigya ; le mot de passe n'y figure jamais.
        throw new Error(`Identifiants MyRenault refusés par Gigya : ${res.errorMessage}`);
    }
}

/** Une seule instruction, paramétrée, insérant si et seulement si l'unicité le permet. */
const INSERT_CREDENTIAL = `
    INSERT INTO "BrandCredential" ("id", "ulId", "brand", "login", "passwordEncrypted", "createdAt", "updatedAt")
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE NOT EXISTS (SELECT 1 FROM "BrandCredential" WHERE "ulId" = ? AND "brand" = ?)
`;

const INSERT_CONNECTION = `
    INSERT INTO "VehicleConnection" ("id", "vehicleId", "credentialId", "brand", "vin", "status", "connectedAt")
    SELECT ?, ?, ?, ?, ?, 'CONNECTED', ?
    WHERE NOT EXISTS (SELECT 1 FROM "VehicleConnection" WHERE "vehicleId" = ?)
`;

/**
 * Exécute la migration. Exportée pour être importable en test sans déclencher
 * `main()` — voir le garde en bas de fichier.
 *
 * Idempotence : `BrandCredential` n'est JAMAIS ré-écrite (un ré-chiffrement
 * produirait un ciphertext différent pour rien et écraserait un mot de passe
 * éventuellement mis à jour depuis l'UI) ; une `VehicleConnection` existante
 * est sautée. Une réexécution produit donc zéro écriture.
 */
export async function runMigration(db: Client, options: MigrationOptions): Promise<MigrationResult> {
    const { apply, ulId } = options;

    console.log(`\n▶ Migration : connexion des véhicules (${apply ? 'APPLY' : 'dry-run'})...`);
    if (!apply) {
        console.log('  ℹ Mode dry-run : les tables, index et colonnes sont créés, aucune donnée n\'est écrite.');
    }

    await ensureSchema(db);
    assertCryptoUsable();

    // ── Histogramme : véhicules à VIN par UL ──────────────────────────────────
    const histo = await db.execute(`
        SELECT "ulId" AS ulId, COUNT(*) AS n
        FROM "Vehicle"
        WHERE "vin" IS NOT NULL AND TRIM("vin") != ''
        GROUP BY "ulId"
    `);
    const histogram = histo.rows.map(r => ({
        ulId: r.ulId === null ? null : String(r.ulId),
        vehicles: Number(r.n ?? 0),
    }));

    console.log('\n  Véhicules à VIN par UL :');
    if (histogram.length === 0) {
        console.log('    (aucun)');
    }
    for (const h of histogram) {
        console.log(`    ulId=${h.ulId ?? '(NULL)'}   vehicules_avec_vin=${h.vehicles}`);
    }

    const withUl = histogram.filter(h => h.ulId !== null);
    const orphans = histogram.find(h => h.ulId === null);
    if (orphans) {
        console.log(`  ⚠ ${orphans.vehicles} véhicule(s) à VIN sans ulId : listés et IGNORÉS (les rattacher à une UL au préalable si besoin)`);
    }

    // ── Portes anti-amplification Gigya ───────────────────────────────────────
    // Elles ne bloquent que l'écriture : le dry-run doit pouvoir afficher
    // l'histogramme, c'est même sa raison d'être.
    if (apply) {
        if (withUl.length >= 2) {
            throw new Error(
                `Refus d'écrire : ${withUl.length} ULs ont des véhicules à VIN (${withUl.map(h => h.ulId).join(', ')}). ` +
                'Une BrandCredential par UL signifierait autant de sessions Gigya concurrentes sur un compte ' +
                'MyRenault unique et verrouillable. Ce cas relève d\'un plan distinct.'
            );
        }
        if (!ulId) {
            throw new Error(
                'Refus d\'écrire : --ul=<id> est obligatoire en --apply. ' +
                `UL attendue : ${withUl[0]?.ulId ?? '(aucune UL n\'a de véhicule à VIN)'}`
            );
        }
        if (!withUl.some(h => h.ulId === ulId)) {
            throw new Error(`Refus d'écrire : l'UL « ${ulId} » n'a aucun véhicule à VIN.`);
        }
    }

    const targetUls = ulId ? withUl.filter(h => h.ulId === ulId) : withUl;
    const ignoredByFilter = withUl
        .filter(h => !targetUls.includes(h))
        .reduce((sum, h) => sum + h.vehicles, 0);

    const result: MigrationResult = {
        histogram,
        credentialsCreated: 0,
        credentialsSkipped: 0,
        connectionsCreated: 0,
        connectionsSkipped: 0,
        vehiclesIgnored: (orphans?.vehicles ?? 0) + ignoredByFilter,
    };

    // Le compte global à transposer. Requis dès qu'une écriture est possible.
    const login = (process.env.RENAULT_MAIL || '').trim();
    const password = process.env.RENAULT_PASS || '';
    if (apply && (!login || !password)) {
        throw new Error('RENAULT_MAIL et RENAULT_PASS doivent être définis : ce sont les identifiants à transposer en BrandCredential.');
    }

    const now = new Date().toISOString();

    for (const { ulId: targetUl } of targetUls) {
        if (targetUl === null) continue;

        const vehicles = await db.execute({
            sql: `SELECT "id", "vin" FROM "Vehicle"
                  WHERE "ulId" = ? AND "vin" IS NOT NULL AND TRIM("vin") != ''`,
            args: [targetUl],
        });

        const existingCred = await db.execute({
            sql: `SELECT "id" FROM "BrandCredential" WHERE "ulId" = ? AND "brand" = ?`,
            args: [targetUl, BRAND],
        });
        const credentialExists = existingCred.rows.length > 0;

        if (!apply) {
            if (credentialExists) {
                result.credentialsSkipped++;
                console.log(`  ℹ UL ${targetUl} : BrandCredential ${BRAND} déjà présente, jamais ré-écrite`);
            } else {
                result.credentialsCreated++;
                console.log(`  ▶ UL ${targetUl} : une BrandCredential ${BRAND} serait créée`);
            }
            for (const v of vehicles.rows) {
                const vehicleId = String(v.id);
                const existing = await db.execute({
                    sql: `SELECT 1 FROM "VehicleConnection" WHERE "vehicleId" = ?`,
                    args: [vehicleId],
                });
                if (existing.rows.length > 0) {
                    result.connectionsSkipped++;
                } else {
                    result.connectionsCreated++;
                    console.log(`  ▶ Véhicule ${vehicleId} : une VehicleConnection serait créée`);
                }
            }
            continue;
        }

        // Credential et connexions dans UNE transaction : c'est cette propriété
        // qui garantit qu'aucune VehicleConnection ne référence un credential
        // absent, les FK n'étant pas appliquées.
        const tx = await db.transaction('write');
        try {
            const credentialId = credentialExists ? String(existingCred.rows[0].id) : randomUUID();

            if (!credentialExists) {
                await tx.execute({
                    sql: INSERT_CREDENTIAL,
                    args: [credentialId, targetUl, BRAND, login, encryptSecret(password), now, now, targetUl, BRAND],
                });
                result.credentialsCreated++;
                console.log(`  ✓ UL ${targetUl} : BrandCredential ${BRAND} créée`);
            } else {
                result.credentialsSkipped++;
                console.log(`  ℹ UL ${targetUl} : BrandCredential ${BRAND} déjà présente, jamais ré-écrite`);
            }

            for (const v of vehicles.rows) {
                const vehicleId = String(v.id);
                const vin = String(v.vin).trim();
                const inserted = await tx.execute({
                    sql: INSERT_CONNECTION,
                    args: [randomUUID(), vehicleId, credentialId, BRAND, vin, now, vehicleId],
                });
                if (Number(inserted.rowsAffected) > 0) {
                    result.connectionsCreated++;
                    console.log(`  ✓ Véhicule ${vehicleId} : VehicleConnection créée`);
                } else {
                    result.connectionsSkipped++;
                    console.log(`  ℹ Véhicule ${vehicleId} : VehicleConnection déjà présente, ignorée`);
                }
            }

            await tx.commit();
        } catch (e: unknown) {
            await tx.rollback();
            throw new Error(`UL ${targetUl} : migration annulée — ${getErrorMessage(e)}`);
        }
    }

    console.log(`\n  BrandCredential ${apply ? 'créées' : 'à créer'}   : ${result.credentialsCreated}`);
    console.log(`  BrandCredential ignorées : ${result.credentialsSkipped}`);
    console.log(`  VehicleConnection ${apply ? 'créées' : 'à créer'} : ${result.connectionsCreated}`);
    console.log(`  VehicleConnection ignorées : ${result.connectionsSkipped}`);
    console.log(`  Véhicules à VIN écartés  : ${result.vehiclesIgnored}`);

    if (apply) {
        console.log('\n✅ Migration terminée. Lancez scripts/verify-vehicle-connections.ts (phase G) avant le merge.\n');
    } else {
        console.log('\nDry-run terminé. Relancez avec --apply --ul=<id> pour écrire.\n');
    }

    return result;
}

function parseUlId(argv: string[]): string | undefined {
    const flag = argv.find(a => a.startsWith('--ul='));
    const value = flag?.slice('--ul='.length).trim();
    return value ? value : undefined;
}

async function main(): Promise<void> {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || url.startsWith('file:')) {
        console.error('❌ TURSO_DATABASE_URL must be set to a remote libsql:// URL');
        process.exit(1);
    }

    const apply = process.argv.includes('--apply');
    const ulId = parseUlId(process.argv);
    const verify = !process.argv.includes('--no-verify');

    if (verify) {
        const login = (process.env.RENAULT_MAIL || '').trim();
        const password = process.env.RENAULT_PASS || '';
        const apiKey = (process.env.GIGYA_API_KEY || '').trim();
        if (!login || !password || !apiKey) {
            console.error('❌ RENAULT_MAIL, RENAULT_PASS et GIGYA_API_KEY sont requis (ou lancez avec --no-verify)');
            process.exit(1);
        }
        try {
            // Lecture seule, AVANT toute écriture : on ne chiffre jamais un
            // couple que le fournisseur refuse.
            await verifyGigyaLogin(login, password, apiKey);
            console.log(`  ✓ Login Gigya vérifié pour ${login}`);
        } catch (e: unknown) {
            console.error(`❌ Vérification Gigya échouée : ${getErrorMessage(e)}`);
            process.exit(1);
        }
    } else {
        console.log('  ⚠ Vérification Gigya sautée (--no-verify)');
    }

    const db = createClient({ url, authToken });
    await runMigration(db, { apply, ulId });
}

// Ne s'exécute que lancé directement, pour rester importable par les tests.
// `require.main` n'existe pas en ESM : le repo compare `process.argv[1]`.
if (process.argv[1] && process.argv[1].endsWith('add-vehicle-connections.ts')) {
    main().catch((e: unknown) => {
        console.error('❌ Migration échouée :', getErrorMessage(e));
        process.exit(1);
    });
}

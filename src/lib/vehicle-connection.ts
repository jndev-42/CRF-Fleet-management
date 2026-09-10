/**
 * Résolution du contexte de connexion d'un véhicule et effets de bord métier.
 *
 * Ce module est la **seule** couche autorisée à écrire `VehicleConnection.status`.
 * `src/lib/renault.ts` reste un client de fetch qui lève des erreurs typées et
 * n'écrit aucun statut ; c'est ici qu'on décide ce qu'une erreur signifie.
 *
 * ⚠️ Module **serveur** : il importe `@/lib/db`. Ne jamais l'importer depuis un
 * Client Component — cela tirerait `@libsql/client` dans le bundle navigateur.
 * Le prédicat client équivalent est `isVehicleConnected(vehicle)` dans
 * `src/app/vehicles/[id]/utils.ts`.
 */
import { db } from '@/lib/db';
import { decryptSecret, encryptSecret, needsRewrap } from '@/lib/crypto';
import { BrandAuthError, type BrandVehicleData, type ConnectionContext } from '@/lib/brand-contract';
import { fetchRenaultVehicleData, type RenaultVehicleData } from '@/lib/renault';
import { fetchStellantisVehicleData } from '@/lib/stellantis';
import { isPsaBrand } from '@/lib/brands';
import { getErrorMessage } from '@/lib/utils/error';

/**
 * Le véhicule n'a aucune connexion constructeur.
 *
 * **État métier normal, jamais un `500`.** Un véhicule non connecté se comporte
 * exactement comme un véhicule sans VIN avant la refonte — à l'exception de
 * `PATCH /api/vehicles/[id]/metrics`, où il redevient éditable manuellement.
 */
export class VehicleNotConnectedError extends Error {
    constructor(message = 'Véhicule non connecté') {
        super(message);
        this.name = 'VehicleNotConnectedError';
    }
}

/** Statuts pour lesquels une connexion existe et la télémétrie est le chemin nominal. */
const ACTIVE_STATUSES = ['CONNECTED', 'ERROR'] as const;

export interface FetchOptions {
    /**
     * Credentials ayant déjà échoué en authentification **dans ce run**.
     *
     * À créer par l'appelant (`new Set<string>()` en tête de route ou de run de
     * cron), **jamais au niveau module** : un `Set` de module survivrait sur une
     * lambda tiède et bloquerait un credential jusqu'au prochain démarrage à
     * froid, y compris après correction du mot de passe. C'est le seul rempart
     * contre la rafale Gigya depuis la suppression du backoff.
     */
    failedCredentials?: Set<string>;
}

/**
 * Charge le contexte de connexion d'un véhicule, mot de passe déchiffré compris.
 *
 * Lève `VehicleNotConnectedError` si aucune connexion n'existe.
 */
export async function resolveVehicleConnection(vehicleId: string): Promise<ConnectionContext> {
    const res = await db.execute({
        // `Vehicle` est joint pour `maxFuelCapacity` seul : PSA exprime le
        // carburant en pourcentage et la conversion en litres a besoin de la
        // capacité. La faire remonter par le contexte laisse les clients de
        // marque ignorants du domaine — cf. `brand-contract.ts`.
        sql: `SELECT vc.vehicleId, vc.credentialId, vc.brand, vc.vin,
                     bc.login, bc.passwordEncrypted, v.maxFuelCapacity
              FROM VehicleConnection vc
              JOIN BrandCredential bc ON bc.id = vc.credentialId
              JOIN Vehicle v ON v.id = vc.vehicleId
              WHERE vc.vehicleId = ?`,
        args: [vehicleId],
    });

    const row = res.rows[0];
    if (!row) throw new VehicleNotConnectedError();

    const brand = String(row.brand);

    const credentialId = String(row.credentialId);
    const payload = String(row.passwordEncrypted);
    const password = decryptSecret(payload);

    // Rewrap paresseux : confort, jamais une condition de succès. Le mécanisme
    // de sortie de rotation est `scripts/rewrap-credentials.ts`.
    try {
        if (needsRewrap(payload)) {
            await db.execute({
                sql: `UPDATE BrandCredential SET passwordEncrypted = ?, updatedAt = ? WHERE id = ?`,
                args: [encryptSecret(password), new Date().toISOString(), credentialId],
            });
        }
    } catch (e: unknown) {
        // Le clair est déjà en main, la lecture a réussi : un throw ici
        // basculerait en ERROR une connexion parfaitement valide.
        console.error('[vehicle-connection] rewrap opportuniste échoué (non fatal):', getErrorMessage(e));
    }

    return {
        vehicleId: String(row.vehicleId),
        credentialId,
        brand,
        vin: String(row.vin),
        login: String(row.login),
        password,
        maxFuelCapacity: row.maxFuelCapacity === null ? null : Number(row.maxFuelCapacity),
    };
}

/**
 * Écrit le statut au **grain credential** : `WHERE credentialId = ?`, jamais
 * `WHERE vehicleId = ?`.
 *
 * Un mot de passe changé côté constructeur casse les N véhicules de l'UL ; n'en
 * marquer qu'un afficherait « Connecté » en mentant sur les N−1 autres, et les
 * ferait basculer un par un au prix d'un login refusé chacun.
 *
 * Écriture **non fatale** : jamais de `throw`, qui masquerait l'erreur d'origine.
 */
async function markCredentialError(credentialId: string, lastError: string): Promise<void> {
    try {
        await db.execute({
            sql: `UPDATE VehicleConnection SET status = 'ERROR', lastError = ?, lastCheckedAt = ? WHERE credentialId = ?`,
            args: [lastError, new Date().toISOString(), credentialId],
        });
    } catch (e: unknown) {
        console.error('[vehicle-connection] écriture du statut ERROR impossible (non fatal):', getErrorMessage(e));
    }
}

async function markCredentialConnected(credentialId: string): Promise<void> {
    try {
        await db.execute({
            sql: `UPDATE VehicleConnection SET status = 'CONNECTED', lastError = NULL, lastCheckedAt = ? WHERE credentialId = ?`,
            args: [new Date().toISOString(), credentialId],
        });
    } catch (e: unknown) {
        console.error('[vehicle-connection] écriture du statut CONNECTED impossible (non fatal):', getErrorMessage(e));
    }
}

/**
 * Relève la télémétrie d'un véhicule à partir de son **UUID** (jamais son VIN,
 * jamais son nom).
 *
 * Seul `BrandAuthError` bascule le credential en `ERROR` ; `BrandTransientError`
 * et `VinNotOnAccountError` remontent sans toucher au statut — un incident
 * réseau chez le constructeur ne doit pas faire passer toute la flotte en rouge.
 */
/**
 * Aiguillage vers le client de marque.
 *
 * **Le seul endroit du code qui connaisse la correspondance marque → client.**
 * Ajouter un constructeur = une entrée ici, une dans `brands.ts`, un module de
 * fetch. Aucune route, aucun cron, aucun composant n'a à savoir laquelle il
 * interroge.
 */
export function fetchBrandData(ctx: ConnectionContext): Promise<BrandVehicleData> {
    if (isPsaBrand(ctx.brand)) return fetchStellantisVehicleData(ctx);
    if (ctx.brand === 'RENAULT') return fetchRenaultVehicleData(ctx);
    return Promise.reject(new Error(`Marque non prise en charge : ${ctx.brand}`));
}

export async function getRenaultVehicleData(
    vehicleId: string,
    options: FetchOptions = {}
): Promise<RenaultVehicleData> {
    const ctx = await resolveVehicleConnection(vehicleId);
    const failed = options.failedCredentials;

    if (failed?.has(ctx.credentialId)) {
        // Statut déjà écrit lors du premier refus de ce run : on ne relance pas
        // de login pour ne pas amplifier le risque de verrouillage du compte.
        throw new BrandAuthError('Identifiants refusés — compte déjà en échec sur ce run');
    }

    try {
        const data = await fetchBrandData(ctx);
        await markCredentialConnected(ctx.credentialId);
        return data;
    } catch (e: unknown) {
        if (e instanceof BrandAuthError) {
            failed?.add(ctx.credentialId);
            await markCredentialError(ctx.credentialId, e.message);
        }
        throw e;
    }
}

/**
 * Prédicat **serveur** : le véhicule a-t-il une connexion constructeur ?
 *
 * `CONNECTED` et `ERROR` comptent tous deux comme « connecté » : une connexion
 * en erreur reste une connexion, elle doit être retentée et interdit toujours
 * l'édition manuelle des métriques.
 */
export async function isConnectedInDb(vehicleId: string): Promise<boolean> {
    const res = await db.execute({
        sql: `SELECT 1 FROM VehicleConnection WHERE vehicleId = ? AND status IN ('CONNECTED','ERROR')`,
        args: [vehicleId],
    });
    return res.rows.length > 0;
}

export { ACTIVE_STATUSES };

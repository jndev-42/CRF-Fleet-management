/**
 * Garde serveur des papiers de conduite, partagée par toutes les routes d'emprunt
 * (`POST /api/trips`, `POST /api/qr/[token]/checkout`) et de désignation d'un
 * conducteur (`PATCH /api/trips/[id]/checkout`, `PATCH /api/trips/[id]/second-driver`).
 *
 * Aucune dispense par rôle : quiconque prend le volant doit avoir des papiers
 * valides, gestionnaire compris. La décision est rejouée en lecture seule via
 * `getLicenseStatus` — seule `GET /api/me/license-check` matérialise l'invalidation.
 */
import { db } from '@/lib/db';
import { getLicenseStatus, type LicenseRow } from '@/lib/licenseStatus';

/** Refus adressé au conducteur connecté. */
export const LICENSE_BLOCKED_MESSAGE =
    "Vos papiers n'ont pas été validés dans les délais — emprunt impossible";

/** Refus adressé au gestionnaire qui désigne un autre conducteur. */
export const OTHER_DRIVER_LICENSE_BLOCKED_MESSAGE =
    "Les papiers de ce conducteur n'ont pas été validés dans les délais — emprunt impossible";

/**
 * `true` si ce compte ne peut pas prendre le volant. Fermé par défaut : un
 * identifiant absent ou sans ligne `User` est considéré comme bloqué.
 */
export async function isLicenseBlocked(userId: string | null | undefined): Promise<boolean> {
    if (!userId) return true;
    const res = await db.execute({
        sql: `SELECT papiers_valides, last_validation, start_date_invalidation_process
              FROM "User" WHERE id = ?`,
        args: [userId],
    });
    const row = res.rows[0] as unknown as LicenseRow | undefined;
    if (!row) return true;
    const today = new Date().toISOString().slice(0, 10);
    return getLicenseStatus(row, today).blocked;
}

/**
 * Contrôle des papiers du 2ème conducteur, commun aux deux parcours d'emprunt
 * (`POST /api/trips` et `POST /api/qr/[token]/checkout`) : à appeler après
 * `secondDriverError` (rôle, compte actif). Renvoie le message du 403, ou `null`.
 */
export async function secondDriverLicenseError(secondDriverId: string): Promise<string | null> {
    return (await isLicenseBlocked(secondDriverId)) ? OTHER_DRIVER_LICENSE_BLOCKED_MESSAGE : null;
}

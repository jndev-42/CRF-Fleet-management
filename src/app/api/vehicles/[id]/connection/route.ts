/**
 * Connexion d'un véhicule à un compte constructeur (`POST` / `PATCH` / `DELETE`).
 *
 * ⚠️ `[id]` est l'**UUID** du véhicule, jamais son nom : cette route lie un
 * secret, et `Vehicle.name` n'a aucune contrainte UNIQUE.
 *
 * ⚠️ Aucune réponse de ce fichier ne contient `password`, `passwordEncrypted`
 * ni `credentialId`.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { auth } from '@/auth';
import { db } from '@/lib/db';
import { isAdmin, isSuperAdmin } from '@/lib/roles';
import { unauthorizedResponse, forbiddenResponse } from '@/lib/apiAuth';
import { decryptSecret, encryptSecret } from '@/lib/crypto';
import { BRAND_ACCOUNT_LABELS, type Brand } from '@/lib/brands';
import {
    BrandAuthError,
    BrandTransientError,
    VinNotOnAccountError,
    fetchRenaultVehicleData,
    type ConnectionContext,
    type RenaultVehicleData,
} from '@/lib/renault';
import { getErrorMessage } from '@/lib/utils/error';

// ── Schémas ───────────────────────────────────────────────────────────────────

/** VIN : 11 à 17 caractères, alphabet VIN (ni I, ni O, ni Q). */
const VinSchema = z.string().trim().toUpperCase().min(11).max(17).regex(/^[A-HJ-NPR-Z0-9]+$/);

const PAIR_MESSAGE = 'Identifiant et mot de passe doivent être fournis ensemble';

/**
 * Le couple identifiant/mot de passe est indivisible : un login seul écraserait
 * le compte de l'UL avec un mot de passe fantôme, un mot de passe seul serait
 * appliqué à un login que l'utilisateur n'a pas vu.
 */
const bothOrNeither = (d: { login?: string; password?: string }) =>
    (d.login === undefined) === (d.password === undefined);

const ConnectSchema = z.object({
    brand: z.enum(['RENAULT']),
    vin: VinSchema,
    login: z.string().trim().email().optional(),
    password: z.string().min(1).optional(),
}).refine(bothOrNeither, { message: PAIR_MESSAGE });

/** `PATCH` : même schéma, `vin` optionnel (celui de la connexion existante est conservé). */
const UpdateConnectionSchema = z.object({
    brand: z.enum(['RENAULT']),
    vin: VinSchema.optional(),
    login: z.string().trim().email().optional(),
    password: z.string().min(1).optional(),
}).refine(bothOrNeither, { message: PAIR_MESSAGE });

// ── Erreurs locales ───────────────────────────────────────────────────────────

/**
 * Échec du module de chiffrement (clé absente/invalide, ou payload illisible).
 * Traduit en `500 { error: 'Configuration de chiffrement invalide' }` sans
 * jamais détailler l'environnement à l'appelant.
 */
class CryptoConfigError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CryptoConfigError';
    }
}

function guardCrypto<T>(fn: () => T): T {
    try {
        return fn();
    } catch (e: unknown) {
        throw new CryptoConfigError(getErrorMessage(e));
    }
}

// ── Chargement et autorisation ────────────────────────────────────────────────

interface VehicleRow {
    id: string;
    ulId: string | null;
    vin: string | null;
}

type Guard =
    | { ok: true; vehicle: VehicleRow }
    | { ok: false; response: NextResponse };

/**
 * `auth()` → chargement du véhicule par **UUID strict** → contrôle d'accès.
 *
 * Le patron `WHERE name = ? OR id = ?` des routes voisines est délibérément
 * rejeté ici : `Vehicle.name` n'a aucune contrainte UNIQUE, un `OR` peut donc
 * matcher plusieurs lignes et rattacher un credential au véhicule d'une autre
 * unité locale.
 */
async function authorize(id: string): Promise<Guard> {
    const session = await auth();
    if (!session?.user) return { ok: false, response: unauthorizedResponse() };

    const res = await db.execute({
        sql: `SELECT id, ulId, vin FROM Vehicle WHERE id = ?`,
        args: [id],
    });
    const row = res.rows[0];
    if (!row) {
        return { ok: false, response: NextResponse.json({ error: 'Véhicule non trouvé' }, { status: 404 }) };
    }

    const vehicle: VehicleRow = {
        id: String(row.id),
        ulId: row.ulId === null ? null : String(row.ulId),
        vin: row.vin === null ? null : String(row.vin),
    };

    // Plus strict que /api/renault/[vin], qui autorise tout membre de l'UL sans
    // contrôle de rôle : lire un kilométrage et écrire un credential n'appellent
    // pas le même seuil. `isAdminOrAbove` ne convient pas — il ignore la portée
    // UL et donnerait à un ADMIN accès aux credentials de toutes les ULs.
    const roles = session.user.roles || [];
    if (!isSuperAdmin(roles) && !(isAdmin(roles) && session.user.ulId === vehicle.ulId)) {
        return { ok: false, response: forbiddenResponse() };
    }

    return { ok: true, vehicle };
}

// ── Résolution du credential ──────────────────────────────────────────────────

interface ResolvedCredential {
    credentialId: string;
    login: string;
    password: string;
    /** Le couple était dans la requête ⇒ il sera écrit et écrasera celui de l'UL. */
    provided: boolean;
    /** Aucune ligne `BrandCredential` n'existe encore pour ce couple (UL, marque). */
    isNew: boolean;
}

type CredentialResolution =
    | { ok: true; credential: ResolvedCredential }
    | { ok: false; response: NextResponse };

async function resolveCredential(
    ulId: string,
    brand: Brand,
    input: { login?: string; password?: string }
): Promise<CredentialResolution> {
    const res = await db.execute({
        sql: `SELECT id, login, passwordEncrypted FROM BrandCredential WHERE ulId = ? AND brand = ?`,
        args: [ulId, brand],
    });
    const existing = res.rows[0];

    if (input.login !== undefined && input.password !== undefined) {
        return {
            ok: true,
            credential: {
                // Réutiliser l'id existant garde la connexion des autres
                // véhicules de l'UL rattachée à la même ligne.
                credentialId: existing ? String(existing.id) : crypto.randomUUID(),
                login: input.login,
                password: input.password,
                provided: true,
                isNew: !existing,
            },
        };
    }

    if (!existing) {
        return {
            ok: false,
            response: NextResponse.json(
                { error: `Aucun compte ${BRAND_ACCOUNT_LABELS[brand]} enregistré pour cette UL` },
                { status: 400 }
            ),
        };
    }

    return {
        ok: true,
        credential: {
            credentialId: String(existing.id),
            login: String(existing.login),
            password: guardCrypto(() => decryptSecret(String(existing.passwordEncrypted))),
            provided: false,
            isNew: false,
        },
    };
}

// ── Validation live ───────────────────────────────────────────────────────────

type Validation =
    | { ok: true; data: RenaultVehicleData }
    | { ok: false; response: NextResponse };

/**
 * Authentifie et relève la télémétrie **avant toute écriture**.
 *
 * Aucune transaction n'est encore ouverte à ce stade : sur refus, `BrandCredential`
 * et `VehicleConnection` sont strictement inchangées.
 */
async function validateLive(ctx: ConnectionContext, brand: Brand): Promise<Validation> {
    const label = BRAND_ACCOUNT_LABELS[brand];
    try {
        return { ok: true, data: await fetchRenaultVehicleData(ctx) };
    } catch (e: unknown) {
        if (e instanceof BrandAuthError) {
            return {
                ok: false,
                response: NextResponse.json({ error: `Identifiants ${label} refusés` }, { status: 400 }),
            };
        }
        if (e instanceof VinNotOnAccountError) {
            return {
                ok: false,
                response: NextResponse.json({ error: `VIN introuvable sur ce compte ${label}` }, { status: 400 }),
            };
        }
        if (e instanceof BrandTransientError) {
            // Ni les identifiants ni le VIN ne sont en cause : ne rien écrire et
            // ne rien reprocher à l'utilisateur.
            console.error('[vehicle-connection] service constructeur indisponible:', getErrorMessage(e));
            return {
                ok: false,
                response: NextResponse.json(
                    { error: `Service ${label} momentanément indisponible, réessayez plus tard` },
                    { status: 502 }
                ),
            };
        }
        throw e;
    }
}

// ── Écriture ──────────────────────────────────────────────────────────────────

interface ConnectInput {
    brand: Brand;
    vin: string;
    login?: string;
    password?: string;
}

/**
 * Séquence commune à `POST` et `PATCH` : résolution du credential → validation
 * live → écriture transactionnelle → réponse.
 */
async function connectVehicle(
    vehicle: VehicleRow,
    input: ConnectInput,
    successStatus: 200 | 201
): Promise<NextResponse> {
    if (!vehicle.ulId) {
        // Le credential est porté par l'UL : sans UL, il n'a nulle part où vivre.
        return NextResponse.json(
            { error: "Véhicule sans unité locale : impossible d'y rattacher un compte constructeur" },
            { status: 400 }
        );
    }

    const resolution = await resolveCredential(vehicle.ulId, input.brand, input);
    if (!resolution.ok) return resolution.response;
    const credential = resolution.credential;

    const validation = await validateLive(
        {
            vehicleId: vehicle.id,
            credentialId: credential.credentialId,
            brand: input.brand,
            vin: input.vin,
            login: credential.login,
            password: credential.password,
        },
        input.brand
    );
    if (!validation.ok) return validation.response;

    const now = new Date().toISOString();
    const passwordEncrypted = credential.provided
        ? guardCrypto(() => encryptSecret(credential.password))
        : null;

    // ⚠️ INVARIANT F11 — À NE JAMAIS CASSER : l'écriture du credential et celle
    // de la connexion restent dans UNE SEULE transaction. C'est cette propriété,
    // et elle seule, qui rend sûre la suppression d'orphelin du DELETE (« plus
    // aucune connexion sur ce credential ⇒ le credential est supprimable »).
    // Un refactor qui les séparerait réintroduirait une vraie course — une
    // connexion pourrait pointer un credential déjà purgé — sans que personne
    // ne le voie.
    let credentialId = credential.credentialId;
    const tx = await db.transaction('write');
    try {
        if (passwordEncrypted !== null) {
            if (credential.isNew) {
                // `ON CONFLICT` couvre la course avec une requête concurrente
                // ayant créé le compte de l'UL entre le SELECT et ici ; le
                // `RETURNING` rend alors l'id réellement retenu.
                const inserted = await tx.execute({
                    sql: `INSERT INTO BrandCredential (id, ulId, brand, login, passwordEncrypted, createdAt, updatedAt)
                          VALUES (?, ?, ?, ?, ?, ?, ?)
                          ON CONFLICT(ulId, brand) DO UPDATE SET
                              login = excluded.login,
                              passwordEncrypted = excluded.passwordEncrypted,
                              updatedAt = excluded.updatedAt
                          RETURNING id`,
                    args: [credentialId, vehicle.ulId, input.brand, credential.login, passwordEncrypted, now, now],
                });
                const insertedId = inserted.rows[0]?.id;
                if (insertedId != null) credentialId = String(insertedId);
            } else {
                // Ligne connue : un INSERT réintroduirait un conflit de clé
                // primaire que `ON CONFLICT(ulId, brand)` ne couvre pas.
                await tx.execute({
                    sql: `UPDATE BrandCredential SET login = ?, passwordEncrypted = ?, updatedAt = ? WHERE id = ?`,
                    args: [credential.login, passwordEncrypted, now, credentialId],
                });
            }
        }

        await tx.execute({
            sql: `INSERT INTO VehicleConnection (id, vehicleId, credentialId, brand, vin, status, lastError, connectedAt, lastCheckedAt)
                  VALUES (?, ?, ?, ?, ?, 'CONNECTED', NULL, ?, ?)
                  ON CONFLICT(vehicleId) DO UPDATE SET
                      credentialId = excluded.credentialId,
                      brand = excluded.brand,
                      vin = excluded.vin,
                      status = 'CONNECTED',
                      lastError = NULL,
                      lastCheckedAt = excluded.lastCheckedAt`,
            args: [crypto.randomUUID(), vehicle.id, credentialId, input.brand, input.vin, now, now],
        });

        await tx.execute({
            sql: `UPDATE Vehicle SET vin = ?, updatedAt = ? WHERE id = ?`,
            args: [input.vin, now, vehicle.id],
        });

        await tx.commit();
    } catch (e) {
        await tx.rollback();
        throw e;
    }

    const stored = await db.execute({
        sql: `SELECT brand, vin, status, connectedAt FROM VehicleConnection WHERE vehicleId = ?`,
        args: [vehicle.id],
    });
    const row = stored.rows[0];

    return NextResponse.json(
        {
            success: true,
            connection: {
                brand: String(row.brand),
                vin: String(row.vin),
                status: String(row.status),
                connectedAt: String(row.connectedAt),
            },
            data: validation.data,
        },
        { status: successStatus }
    );
}

// ── Réponse d'erreur commune ──────────────────────────────────────────────────

function serverError(context: string, e: unknown): NextResponse {
    if (e instanceof CryptoConfigError) {
        console.error(`[vehicle-connection] ${context} — chiffrement:`, e.message);
        return NextResponse.json({ error: 'Configuration de chiffrement invalide' }, { status: 500 });
    }
    console.error(`[vehicle-connection] ${context}:`, getErrorMessage(e));
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
}

function invalidBody(e: unknown): NextResponse {
    if (e instanceof z.ZodError) {
        return NextResponse.json({ error: 'Données invalides', details: e.issues }, { status: 400 });
    }
    return NextResponse.json({ error: 'Corps invalide' }, { status: 400 });
}

// ── Verbes ────────────────────────────────────────────────────────────────────

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        const guard = await authorize(id);
        if (!guard.ok) return guard.response;

        let data: z.infer<typeof ConnectSchema>;
        try {
            data = ConnectSchema.parse(await request.json());
        } catch (e) {
            return invalidBody(e);
        }

        return await connectVehicle(guard.vehicle, data, 201);
    } catch (e: unknown) {
        return serverError('POST', e);
    }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        const guard = await authorize(id);
        if (!guard.ok) return guard.response;

        const existing = await db.execute({
            sql: `SELECT vin FROM VehicleConnection WHERE vehicleId = ?`,
            args: [guard.vehicle.id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non connecté' }, { status: 404 });
        }

        let data: z.infer<typeof UpdateConnectionSchema>;
        try {
            data = UpdateConnectionSchema.parse(await request.json());
        } catch (e) {
            return invalidBody(e);
        }

        return await connectVehicle(
            guard.vehicle,
            { ...data, vin: data.vin ?? String(existing.rows[0].vin) },
            200
        );
    } catch (e: unknown) {
        return serverError('PATCH', e);
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;

        const guard = await authorize(id);
        if (!guard.ok) return guard.response;

        const existing = await db.execute({
            sql: `SELECT credentialId FROM VehicleConnection WHERE vehicleId = ?`,
            args: [guard.vehicle.id],
        });
        if (existing.rows.length === 0) {
            return NextResponse.json({ error: 'Véhicule non connecté' }, { status: 404 });
        }
        const credentialId = String(existing.rows[0].credentialId);

        // `Vehicle.vin` est CONSERVÉ : c'est une donnée d'identification du
        // véhicule, pas un artefact de la connexion. Un VIN sans connexion est
        // un état supporté (métriques éditables manuellement).
        let credentialDeleted = false;
        const tx = await db.transaction('write');
        try {
            await tx.execute({
                sql: `DELETE FROM VehicleConnection WHERE vehicleId = ?`,
                args: [guard.vehicle.id],
            });

            const remaining = await tx.execute({
                sql: `SELECT COUNT(*) AS n FROM VehicleConnection WHERE credentialId = ?`,
                args: [credentialId],
            });

            if (Number(remaining.rows[0].n) === 0) {
                // Le cache de session doit partir AVANT le compte : l'inverse
                // laisserait une session orpheline utilisable.
                await tx.execute({
                    sql: `DELETE FROM RenaultSession WHERE credentialId = ?`,
                    args: [credentialId],
                });
                await tx.execute({
                    sql: `DELETE FROM BrandCredential WHERE id = ?`,
                    args: [credentialId],
                });
                credentialDeleted = true;
            }

            await tx.commit();
        } catch (e) {
            await tx.rollback();
            throw e;
        }

        return NextResponse.json({ success: true, credentialDeleted });
    } catch (e: unknown) {
        return serverError('DELETE', e);
    }
}

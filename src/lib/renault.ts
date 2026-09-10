/**
 * Client de fetch Renault Connect (Gigya → Kamereon).
 *
 * ⚠️ **Ce module ne connaît pas le domaine.** Il ne lit ni `Vehicle`, ni
 * `VehicleConnection`, ni `BrandCredential`, et n'écrit **aucun statut** : sa
 * seule écriture est le cache de session, explicitement non fatale. La
 * résolution du contexte de connexion et l'écriture de `status`/`lastError`
 * vivent dans `src/lib/vehicle-connection.ts`. Y ajouter un `UPDATE
 * VehicleConnection` ferait de ce module un mutateur de domaine importé par
 * sept routes dont un cron — contraire au contrat « errors are non-fatal in
 * most contexts » documenté dans `src/lib/CLAUDE.md`.
 *
 * ⚠️ **Aucun compte n'est lu dans l'environnement.** Les identifiants arrivent
 * par `ConnectionContext`, porté par la donnée. Seule `GIGYA_API_KEY` reste en
 * variable d'environnement : c'est une constante de configuration marque à
 * valeur publique, pas un secret par compte.
 *
 * ⚠️ Aucun log de ce module ne contient `password`, `login_token` ni `idToken`.
 */
import { GigyaApi, KamereonApi } from '@remscodes/renault-api';
import { db } from '@/lib/db';
import { getErrorMessage } from '@/lib/utils/error';

/** Durée de vie du cache de session — le JWT Gigya est demandé pour 15 min. */
const SESSION_TTL_MS = 14 * 60_000;
/** Marge avant expiration en dessous de laquelle on ré-authentifie. */
const SESSION_SKEW_MS = 60_000;

/**
 * Contexte de connexion d'un véhicule — déclaré **ici** et importé par
 * `vehicle-connection.ts`, jamais l'inverse : ce sens évite le cycle entre le
 * client de fetch et la couche métier qui le pilote.
 */
export interface ConnectionContext {
    vehicleId: string;
    credentialId: string;
    brand: 'RENAULT';
    vin: string;
    login: string;
    /** Déchiffré en mémoire par `vehicle-connection.ts`, jamais journalisé. */
    password: string;
}

/**
 * Identifiants explicitement refusés par Gigya (`errorCode !== 0`).
 *
 * **Seul** cas qui autorise l'appelant à basculer un credential en `ERROR`.
 * Élargir ce déclencheur ferait basculer toute la flotte en bandeau rouge au
 * premier incident réseau chez Renault : le grain credential n'est sûr que
 * parce que ce déclencheur est étroit.
 */
export class BrandAuthError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BrandAuthError';
    }
}

/**
 * Tout le reste : réseau, 5xx, `personId`/JWT/compte MYRENAULT absents,
 * configuration marque manquante. **N'écrit ni ne justifie aucun statut.**
 */
export class BrandTransientError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BrandTransientError';
    }
}

/**
 * Le VIN n'est pas (ou plus) rattaché au compte constructeur. Spécifique au
 * véhicule — contrairement à `BrandAuthError`, qui est une propriété du compte.
 */
export class VinNotOnAccountError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'VinNotOnAccountError';
    }
}

export interface BrandSession {
    idToken: string;
    accountId: string;
    expiresAt: number;
}

/**
 * Mémoïsation de process, **au niveau module** : c'est un cache de sessions, il
 * doit survivre entre invocations sur une lambda tiède. Clefée par
 * `credentialId`, comme la ligne `RenaultSession` correspondante.
 *
 * À ne pas confondre avec le `Set` des credentials en échec d'authentification,
 * qui est au contraire créé à chaque run (cf. `vehicle-connection.ts`).
 */
const sessionCache = new Map<string, BrandSession>();

function isFresh(session: BrandSession): boolean {
    return Date.now() < session.expiresAt - SESSION_SKEW_MS;
}

/** Lecture du cache DB — non fatale : un échec conduit simplement à ré-authentifier. */
async function readCachedSession(credentialId: string): Promise<BrandSession | null> {
    try {
        const cached = await db.execute({
            sql: `SELECT idToken, accountId, expiresAt FROM RenaultSession WHERE credentialId = ?`,
            args: [credentialId],
        });
        const row = cached.rows[0];
        if (!row) return null;
        return {
            idToken: String(row.idToken),
            accountId: String(row.accountId),
            expiresAt: Number(row.expiresAt),
        };
    } catch (e: unknown) {
        console.error('[renault-auth] lecture du cache de session impossible, ré-authentification:', getErrorMessage(e));
        return null;
    }
}

/**
 * Upsert atomique sur l'index unique partiel `RenaultSession_credentialId_idx`.
 *
 * Volontairement **pas** un `DELETE` + `INSERT` : la fenêtre entre les deux
 * instructions permettrait à deux invocations serverless concurrentes de violer
 * l'index unique. Écriture non fatale, comme avant la refonte.
 */
async function writeCachedSession(credentialId: string, session: BrandSession): Promise<void> {
    try {
        await db.execute({
            sql: `INSERT INTO RenaultSession (credentialId, idToken, accountId, expiresAt)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(credentialId) WHERE credentialId IS NOT NULL
                  DO UPDATE SET idToken = excluded.idToken, accountId = excluded.accountId, expiresAt = excluded.expiresAt`,
            args: [credentialId, session.idToken, session.accountId, session.expiresAt],
        });
    } catch (e: unknown) {
        console.error('[renault-auth] écriture du cache de session impossible (non fatal):', getErrorMessage(e));
    }
}

/** Enveloppe un `fetch` : toute erreur réseau devient un `BrandTransientError`. */
async function postJson(url: URL, step: string): Promise<Record<string, unknown>> {
    try {
        const res = await fetch(url, { method: 'POST' });
        return await res.json();
    } catch (e: unknown) {
        throw new BrandTransientError(`Renault indisponible (${step}) : ${getErrorMessage(e)}`);
    }
}

/**
 * Authentifie un compte constructeur et renvoie une session utilisable.
 *
 * Classification stricte des échecs : `BrandAuthError` **uniquement** sur
 * `errorCode !== 0`, tout le reste est transitoire.
 */
export async function authenticateBrand(ctx: ConnectionContext): Promise<BrandSession> {
    const memo = sessionCache.get(ctx.credentialId);
    if (memo && isFresh(memo)) return memo;

    const cached = await readCachedSession(ctx.credentialId);
    if (cached && isFresh(cached)) {
        sessionCache.set(ctx.credentialId, cached);
        return cached;
    }

    const apiKey = process.env.GIGYA_API_KEY;
    if (!apiKey) {
        // Constante de configuration marque, pas un secret de compte : son
        // absence est un défaut de déploiement, jamais un refus d'identifiants.
        throw new BrandTransientError('GIGYA_API_KEY absente : configuration Renault incomplète');
    }

    // Étape 1 — login Gigya. Le SEUL point qui peut lever BrandAuthError.
    const loginUrl = new URL(GigyaApi.LOGIN_URL);
    loginUrl.searchParams.set('apikey', apiKey);
    loginUrl.searchParams.set('loginID', ctx.login);
    loginUrl.searchParams.set('password', ctx.password);
    const loginRes = await postJson(loginUrl, 'login') as {
        errorCode?: number;
        errorMessage?: string;
        sessionInfo?: { cookieValue?: string };
    };
    if (loginRes.errorCode !== 0) {
        throw new BrandAuthError(`Identifiants MyRenault refusés : ${loginRes.errorMessage || 'erreur inconnue'}`);
    }
    const loginToken = loginRes.sessionInfo?.cookieValue;
    if (!loginToken) {
        throw new BrandTransientError('Jeton de session Gigya absent de la réponse de login');
    }

    // Étape 2 — personId.
    const accountUrl = new URL(GigyaApi.GET_ACCOUNT_INFO_URL);
    accountUrl.searchParams.set('apikey', apiKey);
    accountUrl.searchParams.set('login_token', loginToken);
    const accountRes = await postJson(accountUrl, 'account-info') as { data?: { personId?: string } };
    const personId = accountRes.data?.personId;
    if (!personId) {
        throw new BrandTransientError('personId introuvable dans la réponse Gigya');
    }

    // Étape 3 — JWT (15 min).
    const jwtUrl = new URL(GigyaApi.GET_JWT_URL);
    jwtUrl.searchParams.set('apikey', apiKey);
    jwtUrl.searchParams.set('login_token', loginToken);
    jwtUrl.searchParams.set('fields', 'data.personId,data.gigyaDataCenter');
    jwtUrl.searchParams.set('expiration', '900');
    const jwtRes = await postJson(jwtUrl, 'jwt') as { id_token?: string };
    const idToken = jwtRes.id_token;
    if (!idToken) {
        throw new BrandTransientError('JWT Gigya absent de la réponse');
    }

    // Étape 4 — accountId Kamereon.
    const personUrl = new URL(KamereonApi.PERSON_URL(personId));
    personUrl.searchParams.set('country', 'FR');
    let personRes: { accounts?: { accountType: string; accountId: string }[] };
    try {
        const res = await fetch(personUrl, { headers: { apikey: KamereonApi.KEY, 'x-gigya-id_token': idToken } });
        personRes = await res.json();
    } catch (e: unknown) {
        throw new BrandTransientError(`Renault indisponible (person) : ${getErrorMessage(e)}`);
    }
    const myAccount = personRes.accounts?.find(a => a.accountType === 'MYRENAULT');
    if (!myAccount) {
        throw new BrandTransientError('Aucun compte MYRENAULT sur cet identifiant');
    }

    const session: BrandSession = {
        idToken,
        accountId: myAccount.accountId,
        expiresAt: Date.now() + SESSION_TTL_MS,
    };

    await writeCachedSession(ctx.credentialId, session);
    sessionCache.set(ctx.credentialId, session);

    return session;
}

export interface RenaultVehicleData {
    vin: string;
    // Cockpit data (v1)
    totalMileage: number | null;
    fuelQuantity: number | null;
    fuelAutonomy: number | null;
    // Battery data (electric only)
    batteryLevel: number | null;
    batteryAutonomy: number | null;
    chargingStatus: number | null;
    plugStatus: number | null;
    // Meta
    cockpitTimestamp: string | null;
    batteryTimestamp: string | null;
    isElectric: boolean;
}

/**
 * Relève la télémétrie d'un véhicule pour un contexte de connexion donné.
 *
 * Dégradation identique à l'existant : cockpit et batterie indisponibles
 * laissent des champs `null` plutôt que de lever. **Seule exception**, un `404`
 * sur le cockpit ⇒ `VinNotOnAccountError` : c'est le signal dont la route de
 * connexion a besoin pour refuser un VIN étranger au compte avant toute
 * écriture. Un `404` sur la batterie est au contraire le cas nominal d'un
 * véhicule thermique.
 */
export async function fetchRenaultVehicleData(ctx: ConnectionContext): Promise<RenaultVehicleData> {
    const { idToken, accountId } = await authenticateBrand(ctx);
    const vin = ctx.vin;

    const headers = {
        apikey: KamereonApi.KEY,
        'x-gigya-id_token': idToken,
    };

    const result: RenaultVehicleData = {
        vin,
        totalMileage: null,
        fuelQuantity: null,
        fuelAutonomy: null,
        batteryLevel: null,
        batteryAutonomy: null,
        chargingStatus: null,
        plugStatus: null,
        cockpitTimestamp: null,
        batteryTimestamp: null,
        isElectric: false,
    };

    // Cockpit v1 (tous véhicules)
    let cockpitStatus: number | null = null;
    try {
        const cockpitUrl = `https://api-wired-prod-1-euw1.wrd-aws.com/commerce/v1/accounts/${accountId}/kamereon/kca/car-adapter/v1/cars/${vin}/cockpit?country=FR`;
        const cockpitRes = await fetch(cockpitUrl, { headers });
        cockpitStatus = cockpitRes.status;
        if (cockpitRes.ok) {
            const cockpitData = await cockpitRes.json();
            const attrs = cockpitData.data?.attributes;
            if (attrs) {
                result.totalMileage = attrs.totalMileage ?? null;
                result.fuelQuantity = attrs.fuelQuantity ?? null;
                result.fuelAutonomy = attrs.fuelAutonomy ?? null;
                result.cockpitTimestamp = attrs.timestamp ?? null;
            }
        }
    } catch (e: unknown) {
        console.error('[renault] cockpit indisponible:', getErrorMessage(e));
    }

    if (cockpitStatus === 404) {
        throw new VinNotOnAccountError('VIN introuvable sur ce compte MyRenault');
    }

    // Batterie (véhicules électriques) — un 404 ici est le cas nominal thermique.
    try {
        const battUrl = new URL(KamereonApi.READ_BATTERY_STATUS_URL(accountId, vin));
        battUrl.searchParams.set('country', 'FR');
        const battRes = await fetch(battUrl, { headers });
        if (battRes.ok) {
            const battData = await battRes.json();
            const attrs = battData.data?.attributes;
            if (attrs && attrs.batteryLevel !== undefined) {
                result.isElectric = true;
                result.batteryLevel = attrs.batteryLevel ?? null;
                result.batteryAutonomy = attrs.batteryAutonomy ?? null;
                result.chargingStatus = attrs.chargingStatus ?? null;
                result.plugStatus = attrs.plugStatus ?? null;
                result.batteryTimestamp = attrs.timestamp ?? null;
            }
        }
    } catch (e: unknown) {
        console.error('[renault] batterie indisponible:', getErrorMessage(e));
    }

    return result;
}

/**
 * Vide la mémoïsation de process. Réservé aux tests — aucun appel applicatif.
 */
export function __clearSessionCache(): void {
    sessionCache.clear();
}

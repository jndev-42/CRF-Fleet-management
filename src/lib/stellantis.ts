/**
 * Client de fetch PSA / Stellantis (worker Playwright → API Connected Car).
 *
 * ⚠️ **Ce module ne connaît pas le domaine.** Comme `renault.ts`, il ne lit ni
 * `Vehicle`, ni `VehicleConnection`, ni `BrandCredential`, et n'écrit **aucun
 * statut** : sa seule écriture est le cache de jetons, explicitement non fatale.
 * La décision de ce qu'une erreur signifie vit dans `vehicle-connection.ts`.
 *
 * ⚠️ Aucun log de ce module ne contient `password`, `accessToken` ni
 * `refreshToken`.
 *
 * ## Pourquoi un worker externe
 *
 * Stellantis délègue son identité à Gigya, qui impose un captcha à
 * `accounts.login` — validé **avant** le mot de passe, donc infranchissable en
 * `fetch`. Et aucun `redirect_uri` https n'est enregistré pour le client PSA :
 * le code OAuth ne peut atterrir que sur `mymap://`, un scheme d'application
 * mobile. Un navigateur réel est indispensable, et Vercel n'exécute pas
 * Chromium. Le worker (`worker/`, hébergé) fait ce seul travail.
 *
 * **Il n'est pas sur le chemin du cron.** L'acquisition initiale des jetons
 * passe par lui ; le rafraîchissement et toute la télémétrie sont de simples
 * `fetch` depuis Vercel. Un worker endormi empêche de créer une connexion,
 * jamais de relever un kilométrage.
 */
import { db } from '@/lib/db';
import { isPsaBrand, type PsaBrand } from '@/lib/brands';
import {
    BrandAuthError,
    BrandTransientError,
    VinNotOnAccountError,
    type BrandVehicleData,
    type ConnectionContext,
} from '@/lib/brand-contract';
import { getErrorMessage } from '@/lib/utils/error';

// ── Configuration marque ──────────────────────────────────────────────────────

interface StellantisBrandConfig {
    idpHost: string;
    realm: string;
    clientId: string;
}

/**
 * `realm` relevé sur `GET https://<idpHost>/am/json/serverinfo/*` pour chaque
 * marque. `clientId` vérifié en sonde pour Peugeot ; les autres proviennent de
 * la même table publique et suivent le même format.
 *
 * Le `client_secret` n'est **pas** ici : c'est une constante d'application
 * mobile, tenue hors du dépôt, dans une variable par marque
 * (`PEUGEOT_CLIENT_SECRET`, `CITROEN_CLIENT_SECRET`, …).
 */
const BRAND_CONFIG: Record<PsaBrand, StellantisBrandConfig> = {
    PEUGEOT: { idpHost: 'idpcvs.peugeot.com', realm: 'clientsB2CPeugeot', clientId: '1eebc2d5-5df3-459b-a624-20abfcf82530' },
    CITROEN: { idpHost: 'idpcvs.citroen.com', realm: 'clientsB2CCitroen', clientId: '5364defc-80e6-447b-bec6-4af8d1542cae' },
    DS: { idpHost: 'idpcvs.driveds.com', realm: 'clientsB2CDS', clientId: 'cbf74ee7-a303-4c3d-aba3-29f5994e2dfa' },
    OPEL: { idpHost: 'idpcvs.opel.com', realm: 'clientsB2COpel', clientId: '07364655-93cb-4194-8158-6b035ac2c24c' },
};

const TELEMETRY_HOST = 'https://api.groupe-psa.com';

/**
 * Marge avant expiration en dessous de laquelle on rafraîchit.
 *
 * Le TTL, lui, n'est **pas** une constante : PSA renvoie `expires_in` à chaque
 * échange (3599 s à la dernière mesure, contre 15 min chez Renault). Le figer
 * ferait mentir le cache le jour où Stellantis change la durée, sans que rien ne
 * le signale.
 */
const SESSION_SKEW_MS = 60_000;

// ── Cache de session ──────────────────────────────────────────────────────────

interface StellantisSession {
    accessToken: string;
    refreshToken: string | null;
    expiresAt: number;
}

/**
 * Mémoïsation de process, **au niveau module** : c'est un cache de sessions, il
 * doit survivre entre invocations sur une lambda tiède. Clefée par
 * `credentialId`, comme la ligne `StellantisSession` correspondante.
 */
const sessionCache = new Map<string, StellantisSession>();

/**
 * Vide la mémoïsation de process — **tests uniquement**.
 *
 * Le cache est volontairement au niveau module pour survivre entre invocations
 * sur une lambda tiède ; il survit donc aussi entre cas de test, où une session
 * laissée par le cas précédent court-circuite le login et décale les réponses
 * mockées. Même sortie de secours que `renault.ts`.
 */
export function __clearSessionCache(): void {
    sessionCache.clear();
}

function isFresh(session: StellantisSession): boolean {
    return Date.now() < session.expiresAt - SESSION_SKEW_MS;
}

/** Lecture du cache DB — non fatale : un échec conduit simplement à ré-authentifier. */
async function readCachedSession(credentialId: string): Promise<StellantisSession | null> {
    try {
        const res = await db.execute({
            sql: `SELECT accessToken, refreshToken, expiresAt FROM StellantisSession WHERE credentialId = ?`,
            args: [credentialId],
        });
        const row = res.rows[0];
        if (!row) return null;
        return {
            accessToken: String(row.accessToken),
            refreshToken: row.refreshToken === null ? null : String(row.refreshToken),
            expiresAt: Number(row.expiresAt),
        };
    } catch (e: unknown) {
        console.error('[stellantis] lecture du cache impossible, ré-authentification:', getErrorMessage(e));
        return null;
    }
}

/**
 * Upsert atomique. Volontairement **pas** un `DELETE` + `INSERT` : la fenêtre
 * entre les deux instructions permettrait à deux invocations serverless
 * concurrentes de violer la clé primaire. Écriture non fatale.
 */
async function writeCachedSession(credentialId: string, session: StellantisSession): Promise<void> {
    try {
        await db.execute({
            sql: `INSERT INTO StellantisSession (credentialId, accessToken, refreshToken, expiresAt, updatedAt)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(credentialId)
                  DO UPDATE SET accessToken = excluded.accessToken,
                                refreshToken = excluded.refreshToken,
                                expiresAt = excluded.expiresAt,
                                updatedAt = excluded.updatedAt`,
            args: [credentialId, session.accessToken, session.refreshToken, session.expiresAt, new Date().toISOString()],
        });
    } catch (e: unknown) {
        console.error('[stellantis] écriture du cache impossible (non fatal):', getErrorMessage(e));
    }
}

// ── Authentification ──────────────────────────────────────────────────────────

/**
 * Secret du client OAuth, **une variable par marque**.
 *
 * `client_id` et `client_secret` forment une paire indissociable : un secret
 * apparié à un autre identifiant est refusé en `invalid_client`. Une variable
 * unique pour les quatre marques aurait donc donné le secret Peugeot à Citroën,
 * DS et Opel — un échec systématique, et opaque.
 *
 * Les accès sont écrits en toutes lettres, jamais en
 * `process.env[`${brand}_CLIENT_SECRET`]` : Next.js analyse `process.env.X`
 * statiquement, et un accès dynamique est une fragilité gratuite pour un
 * ensemble fermé de quatre marques.
 */
const CLIENT_SECRETS: Record<PsaBrand, () => string | undefined> = {
    PEUGEOT: () => process.env.PEUGEOT_CLIENT_SECRET,
    CITROEN: () => process.env.CITROEN_CLIENT_SECRET,
    DS: () => process.env.DS_CLIENT_SECRET,
    OPEL: () => process.env.OPEL_CLIENT_SECRET,
};

function resolveBrand(brand: string): { cfg: StellantisBrandConfig; clientSecret: string } {
    if (!isPsaBrand(brand)) throw new BrandTransientError(`Marque non gérée par ce client : ${brand}`);
    const clientSecret = CLIENT_SECRETS[brand]();
    if (!clientSecret) {
        throw new BrandTransientError(`${brand}_CLIENT_SECRET absent de la configuration`);
    }
    return { cfg: BRAND_CONFIG[brand], clientSecret };
}

/**
 * Rafraîchissement du jeton — `client_secret_basic`, `client_id` **uniquement**
 * dans l'en-tête.
 *
 * Le dupliquer dans le corps fait répondre à ForgeRock « Client authentication
 * failed », un message qui désigne les identifiants alors que le défaut est
 * l'ambiguïté. `client_secret_post` est refusé par ce client, quelle que soit la
 * forme.
 *
 * Renvoie `null` sur refus : un refresh mort n'est **pas** une erreur
 * d'identifiants, il déclenche un nouveau login complet par le worker.
 */
async function refreshSession(
    cfg: StellantisBrandConfig,
    clientSecret: string,
    refreshToken: string
): Promise<StellantisSession | null> {
    try {
        const res = await fetch(`https://${cfg.idpHost}/am/oauth2/access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        });
        if (!res.ok) return null;

        const body = (await res.json()) as Record<string, unknown>;
        if (typeof body.access_token !== 'string') return null;

        return {
            accessToken: body.access_token,
            // PSA ne renvoie pas toujours un nouveau refresh_token : conserver
            // l'ancien évite de perdre le seul lien de survie de la connexion.
            refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : refreshToken,
            expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in : 3600) * 1000,
        };
    } catch (e: unknown) {
        console.error('[stellantis] rafraîchissement impossible:', getErrorMessage(e));
        return null;
    }
}

/**
 * Login complet, délégué au worker.
 *
 * Le worker distingue les deux échecs par le code HTTP : `401` pour des
 * identifiants refusés, `502` pour tout le reste. Ce contrat est ce qui permet à
 * `vehicle-connection.ts` de ne basculer un credential en `ERROR` que sur un
 * vrai refus — un worker endormi ne doit pas faire rougir la flotte.
 */
async function loginViaWorker(ctx: ConnectionContext): Promise<StellantisSession> {
    const workerUrl = process.env.PSA_WORKER_URL;
    const workerSecret = process.env.PSA_WORKER_SECRET;
    if (!workerUrl || !workerSecret) {
        throw new BrandTransientError('PSA_WORKER_URL ou PSA_WORKER_SECRET absent de la configuration');
    }

    let res: Response;
    try {
        res = await fetch(`${workerUrl.replace(/\/$/, '')}/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${workerSecret}` },
            body: JSON.stringify({ brand: ctx.brand, login: ctx.login, password: ctx.password, country: 'fr' }),
        });
    } catch (e: unknown) {
        throw new BrandTransientError(`Service d'authentification injoignable : ${getErrorMessage(e)}`);
    }

    const body = (await res.json().catch(() => ({}))) as { message?: string; accessToken?: unknown; refreshToken?: unknown; expiresIn?: unknown };

    if (res.status === 401) {
        throw new BrandAuthError(body.message ?? 'Identifiants du compte constructeur refusés');
    }
    if (!res.ok || typeof body.accessToken !== 'string') {
        throw new BrandTransientError(body.message ?? `Service d'authentification en erreur (${res.status})`);
    }

    return {
        accessToken: body.accessToken,
        refreshToken: typeof body.refreshToken === 'string' ? body.refreshToken : null,
        expiresAt: Date.now() + (typeof body.expiresIn === 'number' ? body.expiresIn : 3600) * 1000,
    };
}

/**
 * Session valide pour un contexte donné.
 *
 * Ordre décidé au round 7 de l'interview : mémoire → cache DB → rafraîchissement
 * → login complet. Un rafraîchissement qui échoue ne bascule **jamais** en
 * `ERROR` — il retombe silencieusement sur le login, exactement comme Renault se
 * re-logue quand sa session Gigya expire.
 */
export async function authenticateBrand(ctx: ConnectionContext): Promise<string> {
    const { cfg, clientSecret } = resolveBrand(ctx.brand);

    const memo = sessionCache.get(ctx.credentialId);
    if (memo && isFresh(memo)) return memo.accessToken;

    const cached = await readCachedSession(ctx.credentialId);
    if (cached && isFresh(cached)) {
        sessionCache.set(ctx.credentialId, cached);
        return cached.accessToken;
    }

    if (cached?.refreshToken) {
        const refreshed = await refreshSession(cfg, clientSecret, cached.refreshToken);
        if (refreshed) {
            sessionCache.set(ctx.credentialId, refreshed);
            await writeCachedSession(ctx.credentialId, refreshed);
            return refreshed.accessToken;
        }
    }

    const fresh = await loginViaWorker(ctx);
    sessionCache.set(ctx.credentialId, fresh);
    await writeCachedSession(ctx.credentialId, fresh);
    return fresh.accessToken;
}

// ── Télémétrie ────────────────────────────────────────────────────────────────

interface PsaEnergy {
    type?: string;
    level?: number;
    autonomy?: number;
    createdAt?: string;
    extension?: { electric?: { charging?: { plugged?: boolean; status?: string } } };
}

interface PsaStatus {
    odometer?: { mileage?: number; createdAt?: string };
    energies?: PsaEnergy[];
    service?: { type?: string };
}

/**
 * Résolution VIN → identifiant PSA.
 *
 * Contrairement à Kamereon, l'API PSA n'adresse pas les véhicules par leur VIN
 * mais par un identifiant opaque de ~380 caractères. Le résoudre à chaque relevé
 * coûte un appel supplémentaire par véhicule et par passage du cron, et évite
 * une colonne de plus — arbitrage tranché à l'étude de faisabilité.
 */
async function resolveVehicleId(accessToken: string, cfg: StellantisBrandConfig, vin: string): Promise<string> {
    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'x-introspect-realm': cfg.realm,
        Accept: 'application/hal+json',
    };
    const res = await fetch(`${TELEMETRY_HOST}/connectedcar/v4/user/vehicles?client_id=${cfg.clientId}`, { headers });

    if (res.status === 401 || res.status === 403) {
        throw new BrandAuthError('Accès au compte constructeur refusé');
    }
    if (!res.ok) {
        throw new BrandTransientError(`Liste des véhicules indisponible (${res.status})`);
    }

    const body = (await res.json()) as { _embedded?: { vehicles?: { id?: string; vin?: string }[] } };
    const found = body._embedded?.vehicles?.find((v) => v.vin === vin);
    if (!found?.id) {
        throw new VinNotOnAccountError(`Le VIN ${vin} n'est pas rattaché à ce compte constructeur`);
    }
    return found.id;
}

/**
 * Relève la télémétrie d'un véhicule PSA.
 *
 * Dégradation identique à Renault : une donnée absente laisse un champ `null`
 * plutôt que de lever. **Seule exception**, un VIN étranger au compte ⇒
 * `VinNotOnAccountError` : c'est le signal dont la route de connexion a besoin
 * pour refuser un VIN avant toute écriture.
 */
export async function fetchStellantisVehicleData(ctx: ConnectionContext): Promise<BrandVehicleData> {
    const { cfg } = resolveBrand(ctx.brand);
    const accessToken = await authenticateBrand(ctx);
    const vehicleId = await resolveVehicleId(accessToken, cfg, ctx.vin);

    const res = await fetch(
        `${TELEMETRY_HOST}/connectedcar/v4/user/vehicles/${vehicleId}/status?client_id=${cfg.clientId}`,
        {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'x-introspect-realm': cfg.realm,
                Accept: 'application/hal+json',
            },
        }
    );
    if (res.status === 401 || res.status === 403) {
        throw new BrandAuthError('Accès au compte constructeur refusé');
    }
    if (!res.ok) {
        throw new BrandTransientError(`Télémétrie indisponible (${res.status})`);
    }

    return mapStatus(await res.json() as PsaStatus, ctx);
}

/**
 * Traduction de la réponse PSA vers la forme commune.
 *
 * Exporté pour les tests : c'est ici que vivent les deux conversions risquées,
 * et elles doivent être vérifiables sans réseau.
 */
export function mapStatus(status: PsaStatus, ctx: ConnectionContext): BrandVehicleData {
    const energies = status.energies ?? [];
    const electric = energies.find((e) => e.type === 'Electric');
    const fuel = energies.find((e) => e.type === 'Fuel');
    const charging = electric?.extension?.electric?.charging;

    // `service.type` seul ne suffit pas : il vaut « Electric » sur un hybride
    // rechargeable, qui a pourtant un réservoir. La présence d'une énergie
    // `Fuel` tranche.
    const isElectric = electric !== undefined && fuel === undefined;

    /**
     * PSA exprime le niveau en **pourcentage** ; l'application manipule des
     * **litres** (sept sites font `fuelQuantity / maxFuelCapacity × 100`).
     * Recopier la valeur telle quelle afficherait un véhicule à 64 % comme
     * plein — sur-déclaration systématique du carburant, consultée avant de
     * partir en mission. La division faite en aval redonne le pourcentage exact.
     *
     * ⚠️ **Hypothèse non vérifiée** : qu'`energies[type=Fuel].level` soit un
     * pourcentage. Fondée sur le fait que le même champ vaut `64.0` pour
     * l'électrique, dans le même tableau. Aucun véhicule PSA thermique n'était
     * disponible à l'étude. À confronter au tableau de bord du premier connecté.
     */
    const fuelQuantity =
        fuel?.level === undefined ? null : (fuel.level / 100) * (ctx.maxFuelCapacity ?? 50);

    return {
        vin: ctx.vin,
        totalMileage: status.odometer?.mileage ?? null,
        fuelQuantity,
        fuelAutonomy: fuel?.autonomy ?? null,
        batteryLevel: electric?.level ?? null,
        batteryAutonomy: electric?.autonomy ?? null,
        // Booléen PSA → entier Renault : `plugStatus` est consommé comme un
        // drapeau, la valeur exacte n'est jamais lue.
        plugStatus: charging?.plugged === undefined ? null : charging.plugged ? 1 : 0,
        chargingStatus: charging?.status === undefined ? null : charging.status === 'InProgress' ? 1 : 0,
        cockpitTimestamp: status.odometer?.createdAt ?? null,
        batteryTimestamp: electric?.createdAt ?? null,
        isElectric,
    };

    // `lastPosition` (latitude, longitude, altitude, horodatées) est **ignoré
    // délibérément**, et non par oubli : conserver la position des véhicules
    // d'une association revient à tracer les déplacements de bénévoles
    // identifiables. Renault n'expose rien de tel, et aucun besoin métier ne le
    // réclame. Ne pas « compléter » ce mapping sans décision explicite.
}

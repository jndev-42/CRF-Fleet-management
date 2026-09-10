/**
 * Serveur HTTP du worker — `node:http`, sans framework.
 *
 * Deux routes, un seul appelant (l'application Next.js), aucun rendu : une
 * dépendance web ici serait du poids d'image sans contrepartie, sur un plan
 * gratuit où l'image conditionne déjà la durée du réveil.
 *
 * ⚠️ Aucun identifiant n'est journalisé, ni persisté. Ils traversent ce service
 * en mémoire, le temps d'un login, et rien d'autre.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { acquireTokens } from './acquire.js';
import { WorkerError } from './errors.js';
import { isSupportedBrand } from './brands.js';

const PORT = Number(process.env.PORT ?? 10_000);
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET ?? '';
const MAX_BODY_BYTES = 8 * 1024;

if (!SHARED_SECRET) {
    // Arrêt immédiat plutôt que démarrage inutile : sans secret, chaque appel
    // serait rejeté en 401 et le service donnerait l'illusion de fonctionner.
    console.error('[worker] WORKER_SHARED_SECRET absent — tout appel serait rejeté. Arrêt.');
    process.exit(1);
}

/**
 * Comparaison à temps constant.
 *
 * Un `===` sur un secret partagé fuit sa longueur et son préfixe par le temps de
 * réponse. Le coût de l'alternative est nul, et le service est public.
 */
function secretMatches(provided: string): boolean {
    const a = Buffer.from(provided);
    const b = Buffer.from(SHARED_SECRET);
    return a.length === b.length && timingSafeEqual(a, b);
}

function json(res: ServerResponse, status: number, payload: unknown): void {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
}

async function readBody(req: IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
        size += (chunk as Buffer).length;
        if (size > MAX_BODY_BYTES) throw new Error('Corps de requête trop volumineux');
        chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks).toString('utf8');
}

/**
 * Sérialisation des logins.
 *
 * Le plan gratuit de Render offre 512 Mo : deux Chromium simultanés font tomber
 * le service. Connecter un véhicule est de toute façon une action ponctuelle
 * d'administrateur — la file d'attente ne se verra jamais.
 */
let inFlight: Promise<unknown> = Promise.resolve();
function serialize<T>(task: () => Promise<T>): Promise<T> {
    const next = inFlight.then(task, task);
    inFlight = next.catch(() => undefined);
    return next;
}

const server = createServer((req, res) => {
    void (async () => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);

        // Sert de sonde à Render et de préchauffage : le service dort après
        // 15 min d'inactivité et met ~50 s à revenir. L'application appelle cette
        // route à l'ouverture de la modale, pendant que l'admin saisit — le
        // réveil est ainsi absorbé par le temps de frappe.
        if (req.method === 'GET' && url.pathname === '/health') {
            json(res, 200, { status: 'ok', uptime: Math.round(process.uptime()) });
            return;
        }

        if (req.method !== 'POST' || url.pathname !== '/connect') {
            json(res, 404, { error: 'Route inconnue' });
            return;
        }

        const auth = req.headers.authorization ?? '';
        const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!provided || !secretMatches(provided)) {
            json(res, 401, { error: 'Secret partagé invalide' });
            return;
        }

        let payload: { brand?: unknown; login?: unknown; password?: unknown; country?: unknown };
        try {
            payload = JSON.parse(await readBody(req)) as typeof payload;
        } catch {
            json(res, 400, { error: 'Corps JSON invalide' });
            return;
        }

        const { brand, login, password, country } = payload;
        if (!isSupportedBrand(brand) || typeof login !== 'string' || typeof password !== 'string' || !login || !password) {
            json(res, 400, { error: 'brand, login et password sont requis' });
            return;
        }

        // Journal volontairement pauvre : marque et fin d'horodatage, jamais
        // l'identifiant — les journaux Render sont lisibles par tout membre du
        // compte.
        const startedAt = Date.now();
        console.log(`[connect] ${brand} — début`);

        try {
            const result = await serialize(() =>
                acquireTokens({
                    brand,
                    login,
                    password,
                    country: typeof country === 'string' ? country : undefined,
                })
            );
            console.log(`[connect] ${brand} — succès en ${Math.round((Date.now() - startedAt) / 1000)} s`);
            json(res, 200, {
                accessToken: result.accessToken,
                refreshToken: result.refreshToken,
                expiresIn: result.expiresIn,
                trace: result.trace,
            });
        } catch (e: unknown) {
            const kind = e instanceof WorkerError ? e.kind : 'TRANSIENT';
            const message = e instanceof Error ? e.message : String(e);
            console.error(`[connect] ${brand} — échec ${kind} en ${Math.round((Date.now() - startedAt) / 1000)} s : ${message}`);
            // 401 pour AUTH, 502 pour TRANSIENT : l'appelant distingue les deux
            // sans lire le corps, et seul AUTH l'autorise à basculer en ERROR.
            const trace = e instanceof WorkerError ? e.trace : [];
            json(res, kind === 'AUTH' ? 401 : 502, { error: kind, message, trace });
        }
    })();
});

/**
 * Bind explicite sur `0.0.0.0`.
 *
 * Sans hôte, Node écoute sur `::` quand IPv6 est disponible. Le détecteur de
 * ports de Render sonde l'IPv4, et signale alors « No open ports detected » sur
 * un service qui tourne pourtant — un symptôme qui ne désigne pas sa cause.
 */
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[worker] à l'écoute sur 0.0.0.0:${PORT} — mode ${process.env.HEADED === '1' ? 'headful' : 'headless'}`);
});

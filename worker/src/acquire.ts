/**
 * Acquisition des jetons OAuth Stellantis dans un vrai navigateur.
 *
 * ## Pourquoi un navigateur
 *
 * La question a été tranchée par le spike `scripts/stellantis-login-test.ts` du
 * dépôt principal, et par preuve plutôt que par déduction :
 *
 *   - Stellantis délègue son identité à **Gigya** (SAP CDC) ; ForgeRock ne fait
 *     que fédérer par-dessus.
 *   - `accounts.login` répond `400006 Invalid CaptchaType / Invalid CaptchaToken`
 *     avec de vrais identifiants comme avec un appel vide : la validation du
 *     captcha **précède** celle du mot de passe. La variante `sdk=js_latest`
 *     déclenche en prime la détection de robots.
 *   - Aucun `redirect_uri` en `https` n'est enregistré pour le `client_id` PSA :
 *     quatre variantes testées, quatre `redirect_uri_mismatch`. Le code ne peut
 *     donc pas atterrir sur un domaine que l'on contrôle.
 *
 * Un navigateur réel franchit le captcha comme un utilisateur, et c'est la seule
 * voie qui préserve l'UX « email + mot de passe, rien d'autre ».
 *
 * ## Le point délicat
 *
 * La redirection finale vise `<scheme>://oauth2redirect/<pays>?code=…`, un scheme
 * que Chromium ne sait pas ouvrir. On ne peut donc **pas** attendre une
 * navigation : on lit le `Location` de la réponse `302` au vol, avant que le
 * navigateur n'échoue à la suivre. C'est exactement ce que la voie « popup »
 * envisagée au round 1 ne pouvait pas faire depuis le navigateur de l'admin —
 * ici on est du bon côté de la frontière d'origine.
 */
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { BRAND_CONFIG, readBrandEnv } from './brands.js';
import { authError, transientError } from './errors.js';

export interface AcquireInput {
    brand: string;
    login: string;
    password: string;
    country?: string;
}

export interface AcquireResult {
    accessToken: string;
    refreshToken: string | null;
    expiresIn: number | null;
    /** Journal des étapes — la seule sortie exploitable quand un sélecteur bouge. */
    trace: string[];
}

/** Délai maximal du parcours de login, préchauffage exclu. */
const LOGIN_TIMEOUT_MS = 90_000;

/**
 * Sélecteurs candidats du formulaire Gigya.
 *
 * Une « screenset » Gigya est configurée par le client : Peugeot, Citroën et Opel
 * n'exposent pas forcément les mêmes attributs. On essaie donc plusieurs formes
 * plutôt que d'en figer une, et on journalise celle qui a fonctionné pour que la
 * liste puisse être réduite une fois les cinq marques observées.
 */
const LOGIN_SELECTORS = [
    'input[name="username"]',
    'input[name="loginID"]',
    'input[type="email"]',
    'input[name="email"]',
];
const PASSWORD_SELECTORS = ['input[name="password"]', 'input[type="password"]'];
const SUBMIT_SELECTORS = [
    'input[type="submit"]',
    'button[type="submit"]',
    '.gigya-input-submit',
    'button:has-text("Connexion")',
    'button:has-text("Se connecter")',
];
/**
 * Boutons des étapes intermédiaires **après** le login.
 *
 * Stellantis intercale une page de consentement OAuth
 * (`/index/authorize-consentments`) entre l'authentification et la redirection
 * finale. Elle n'apparaît pas sur tous les comptes ni à chaque connexion, d'où
 * un franchissement opportuniste plutôt qu'une étape obligatoire du parcours.
 */
const CONTINUE_SELECTORS = [
    'button:has-text("Continuer")',
    'input[value="Continuer"]',
    'button:has-text("Continue")',
    'button:has-text("Accepter")',
    'button:has-text("Autoriser")',
    'a:has-text("Continuer")',
];

/**
 * Marqueurs d'un contrôle anti-robot **visible**.
 *
 * Leur présence change la nature de l'échec : un captcha n'est pas un refus
 * d'identifiants. Les confondre ferait basculer en `ERROR` tous les véhicules de
 * l'UL — bandeau rouge, invitation à « reconnecter » — pour un compte dont le
 * mot de passe est parfaitement valide.
 */
const CAPTCHA_MARKERS = [
    'iframe[src*="recaptcha"]',
    'iframe[title*="captcha" i]',
    '.g-recaptcha',
    '.gigya-captcha',
    '[class*="captcha" i]',
];

/** Bandeaux de consentement cookies — Didomi chez Stellantis, OneTrust en repli. */
const CONSENT_SELECTORS = [
    '#didomi-notice-agree-button',
    'button#onetrust-accept-btn-handler',
    'button:has-text("Tout accepter")',
];

function makePkce(): { verifier: string; challenge: string } {
    const verifier = randomBytes(48).toString('base64url');
    return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

/**
 * Premier élément **visible** correspondant à l'un des sélecteurs.
 *
 * Le `:visible` n'est pas un raffinement, c'est la condition de correction. Une
 * screenset Gigya rend *tous* ses écrans dans le DOM — connexion, inscription,
 * mot de passe oublié, mise à jour de profil — et n'en montre qu'un. Le premier
 * spike l'a appris à ses dépens : `input[name="username"]` était bien présent,
 * mais sa première occurrence appartenait à un écran masqué, et un `.first()`
 * sans filtre attendait indéfiniment un élément qui ne s'afficherait jamais.
 *
 * Renvoie le `Locator` retenu, et non le sélecteur : l'appelant doit agir sur
 * l'élément exact qui a matché, pas re-résoudre le sélecteur et retomber sur une
 * occurrence cachée.
 */
async function firstVisible(
    scope: Page | Locator,
    selectors: string[],
    timeoutMs: number
): Promise<{ locator: Locator; selector: string } | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        for (const selector of selectors) {
            const locator = scope.locator(`${selector}:visible`).first();
            if (await locator.isVisible().catch(() => false)) return { locator, selector };
        }
        await ('waitForTimeout' in scope ? scope.waitForTimeout(300) : new Promise((r) => setTimeout(r, 300)));
    }
    return null;
}

export async function acquireTokens(input: AcquireInput): Promise<AcquireResult> {
    const base = BRAND_CONFIG[input.brand];
    if (!base) throw authError(`Marque non prise en charge : ${input.brand}`);

    /**
     * `client_id` et `client_secret` forment une **paire** : un secret apparié à
     * un autre identifiant est rejeté en `invalid_client`. Les surcharger
     * ensemble, et non l'un sans l'autre, est donc la seule manœuvre correcte —
     * d'où la surcharge de `clientId` ici, à côté de celle du secret.
     */
    const env = readBrandEnv(input.brand);
    const cfg = {
        ...base,
        clientId: env.clientId ?? base.clientId,
        clientSecret: env.clientSecret ?? base.clientSecret,
    };
    if (!cfg.clientId) {
        throw transientError(`Aucun client_id connu pour ${input.brand} — fournir ${input.brand}_CLIENT_ID.`);
    }

    const country = (input.country ?? 'fr').toLowerCase();
    const redirectUri = `${cfg.scheme}://oauth2redirect/${country}`;
    const { verifier, challenge } = makePkce();
    const trace: string[] = [];

    const authorizeUrl = new URL(`https://${cfg.idpHost}/am/oauth2/authorize`);
    authorizeUrl.searchParams.set('client_id', cfg.clientId);
    authorizeUrl.searchParams.set('response_type', 'code');
    authorizeUrl.searchParams.set('scope', 'openid profile');
    authorizeUrl.searchParams.set('redirect_uri', redirectUri);
    authorizeUrl.searchParams.set('code_challenge', challenge);
    authorizeUrl.searchParams.set('code_challenge_method', 'S256');
    authorizeUrl.searchParams.set('state', randomUUID());

    let browser: Browser | null = null;
    try {
        /**
         * Le mode headful exige un affichage. Le réclamer sans `DISPLAY` ferait
         * échouer le lancement de Chromium, donc **toutes** les connexions —
         * pour un réglage qui n'est qu'une optimisation anti-détection.
         *
         * On dégrade donc en headless, mais la trace le dit : une dégradation
         * silencieuse laisserait croire que le levier `HEADED=1` est actif alors
         * qu'il ne l'est pas, et ferait chercher la cause d'un échec ailleurs.
         */
        const wantsHeaded = process.env.HEADED === '1';
        const canRunHeaded = wantsHeaded && Boolean(process.env.DISPLAY);
        if (wantsHeaded && !canRunHeaded) {
            trace.push('⚠️ HEADED=1 sans DISPLAY — repli en headless (Xvfb absent ou non démarré)');
        }

        browser = await chromium.launch({
            headless: !canRunHeaded,
            slowMo: process.env.SLOWMO ? Number(process.env.SLOWMO) : undefined,
            args: [
                // Render, plan gratuit : 512 Mo et un /dev/shm minuscule. Sans
                // `--disable-dev-shm-usage`, Chromium meurt en cours de rendu.
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                // Retire `navigator.webdriver`, le marqueur d'automatisation le
                // plus trivialement lisible. Gigya applique un contrôle
                // anti-robot au risque : un navigateur qui s'annonce piloté part
                // avec un handicap qu'aucun identifiant valide ne rattrape.
                '--disable-blink-features=AutomationControlled',
            ],
        });
        const context = await browser.newContext({
            locale: country === 'fr' ? 'fr-FR' : 'en-GB',
            timezoneId: 'Europe/Paris',
            viewport: { width: 1280, height: 900 },
            // Chromium headless annonce « HeadlessChrome » dans son User-Agent.
            // Le remplacer ne rend pas le navigateur indétectable — ce n'est pas
            // le but — mais évite le signalement le plus grossier.
            userAgent:
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
                '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        });
        const page = await context.newPage();

        // Capture du code au vol : la réponse 302 passe avant l'échec de
        // navigation vers un scheme inconnu, jamais après.
        let capturedCode: string | null = null;
        page.on('response', (response) => {
            if (capturedCode) return;
            const location = response.headers()['location'];
            if (!location?.startsWith(`${cfg.scheme}://`)) return;
            const parsed = new URL(location.replace(`${cfg.scheme}://`, 'https://'));
            capturedCode = parsed.searchParams.get('code');
            if (capturedCode) trace.push(`code capturé sur ${response.url().split('?')[0]}`);
        });

        trace.push('navigation vers /am/oauth2/authorize');
        await page.goto(authorizeUrl.toString(), { waitUntil: 'domcontentloaded', timeout: 45_000 });

        const consent = await firstVisible(page, CONSENT_SELECTORS, 4_000);
        if (consent) {
            await consent.locator.click({ timeout: 5_000 }).catch(() => {});
            trace.push(`bandeau de consentement accepté (${consent.selector})`);
        }

        const loginField = await firstVisible(page, LOGIN_SELECTORS, 25_000);
        if (!loginField) {
            // On ne journalise que les champs **visibles** : la liste complète du
            // DOM d'une screenset dépasse la centaine d'entrées et noie le signal.
            const names = await page
                .locator('input:visible')
                .evaluateAll((els) =>
                    els.map((e) => (e as HTMLInputElement).name || (e as HTMLInputElement).type).filter(Boolean)
                )
                .catch(() => [] as string[]);
            throw transientError(
                `Champ identifiant introuvable sur ${page.url().split('?')[0]}. ` +
                `Champs visibles : ${names.join(', ') || '(aucun)'}. ` +
                'Relancer avec HEADED=1 SLOWMO=250 et compléter LOGIN_SELECTORS.'
            );
        }
        trace.push(`formulaire détecté (${loginField.selector})`);

        /**
         * Écran actif de la screenset, s'il est identifiable.
         *
         * Restreindre la suite à ce conteneur n'est pas cosmétique : l'écran
         * d'inscription possède lui aussi `password` et `submit`, et remplir le
         * mauvais formulaire créerait un compte au lieu d'ouvrir une session.
         */
        const activeScreen = page.locator('.gigya-screen:visible').first();
        const scope: Page | Locator = (await activeScreen.count().catch(() => 0)) > 0 ? activeScreen : page;
        if (scope !== page) trace.push('recherche restreinte à l’écran Gigya actif');

        await loginField.locator.fill(input.login);
        const passwordField = await firstVisible(scope, PASSWORD_SELECTORS, 10_000);
        if (!passwordField) throw transientError('Champ mot de passe introuvable dans l’écran actif.');
        await passwordField.locator.fill(input.password);

        const submitButton = await firstVisible(scope, SUBMIT_SELECTORS, 5_000);
        if (submitButton) {
            await submitButton.locator.click({ timeout: 10_000 }).catch(() => {});
            trace.push(`soumission via ${submitButton.selector}`);
        } else {
            await passwordField.locator.press('Enter');
            trace.push('soumission via Entrée');
        }
        // Longueurs seulement, jamais les valeurs : de quoi distinguer un champ
        // resté vide d'un champ correctement rempli, sans rien journaliser.
        trace.push(
            `champs remplis — identifiant ${input.login.length} car., mot de passe ${input.password.length} car.`
        );

        // Attente du code, en surveillant en parallèle un message d'erreur Gigya :
        // sans ça, un mot de passe erroné se traduirait par 90 s de silence puis
        // un TRANSIENT, là où l'appelant a besoin d'un AUTH pour basculer le
        // credential en ERROR.
        const deadline = Date.now() + LOGIN_TIMEOUT_MS;
        /**
         * URLs dont l'étape intermédiaire a déjà été franchie.
         *
         * Sans ce garde-fou, un bouton qui reste affiché après le clic — le temps
         * que la navigation parte — serait recliqué à chaque tour de boucle, deux
         * fois par seconde.
         */
        const handledSteps = new Set<string>();

        while (!capturedCode && Date.now() < deadline) {
            // Erreurs Gigya uniquement : un `[role="alert"]` générique existe sur
            // la page de consentement et ferait passer pour un refus
            // d'identifiants un parcours qui se déroule normalement.
            const errorText = await page
                .locator('.gigya-error-msg-active:visible, .gigya-composite-control-form-error:visible')
                .first()
                .textContent({ timeout: 500 })
                .catch(() => null);
            if (errorText && errorText.trim().length > 3) {
                /**
                 * Le message de Gigya ne dit pas *pourquoi* le formulaire est
                 * refusé : « Il y a des erreurs dans votre formulaire » sort
                 * aussi bien pour un mot de passe faux que pour un contrôle
                 * anti-robot. Sonder la page est le seul moyen de distinguer les
                 * deux, et la distinction n'est pas cosmétique : seul `AUTH`
                 * autorise l'appelant à faire rougir toute l'UL.
                 */
                const captcha = await firstVisible(page, CAPTCHA_MARKERS, 500);
                if (captcha) {
                    throw transientError(
                        `Contrôle anti-robot déclenché (${captcha.selector}) — les identifiants ne sont pas en cause. ` +
                        'Message affiché : ' + errorText.trim().slice(0, 120),
                        trace
                    );
                }
                throw authError(`Identifiants refusés : ${errorText.trim().slice(0, 200)}`, trace);
            }

            // `?? page.url()` : sous `noUncheckedIndexedAccess`, `split()[0]` est
            // typé `string | undefined`, et un Set typé n'accepte pas l'incertitude.
            const currentUrl = page.url().split('?')[0] ?? page.url();
            if (!handledSteps.has(currentUrl)) {
                const next = await firstVisible(page, CONTINUE_SELECTORS, 700);
                if (next) {
                    handledSteps.add(currentUrl);
                    await next.locator.click({ timeout: 5_000 }).catch(() => {});
                    trace.push(`étape intermédiaire franchie sur ${currentUrl} (${next.selector})`);
                }
            }

            await page.waitForTimeout(400);
        }

        if (!capturedCode) {
            throw transientError(
                `Aucun code capturé en ${LOGIN_TIMEOUT_MS / 1000} s (page : ${page.url().split('?')[0]}). ` +
                `Étapes franchies : ${[...handledSteps].join(', ') || 'aucune'}. ` +
                'Une étape intermédiaire non reconnue subsiste — relancer avec HEADED=1 ' +
                'et compléter CONTINUE_SELECTORS avec le libellé du bouton bloquant.',
                trace
            );
        }

        const code: string = capturedCode;
        trace.push(`code obtenu (${code.length} caractères)`);
        await browser.close();
        browser = null;

        // ── Échange PKCE — plus besoin de navigateur à partir d'ici ────────────
        const clientSecret = cfg.clientSecret;
        if (!clientSecret) {
            throw transientError(
                `${input.brand}_CLIENT_SECRET absent. L'IdP annonce ` +
                '`token_endpoint_auth_methods_supported: [client_secret_post, private_key_jwt, ' +
                'client_secret_basic]` — `none` en est absent, donc PKCE seul ne suffit pas. ' +
                'Le secret est une constante d’application mobile, publiée dans psa_car_controller.'
            );
        }

        /**
         * Les deux méthodes annoncées par l'IdP, essayées dans l'ordre.
         *
         * `invalid_client` ne dit pas *laquelle* il attend, et un déploiement
         * ForgeRock peut n'en accepter qu'une selon la configuration du client.
         * Deux tentatives coûtent une requête ; deviner coûterait un aller-retour
         * avec un vrai compte à chaque essai.
         */
        /**
         * Une seule méthode, `client_secret_basic`, et **sans `client_id` dans le
         * corps**.
         *
         * Établi par matrice de tests sur un code bidon — si l'authentification du
         * client passe, l'IdP répond `invalid_grant` (le code est faux) au lieu de
         * `invalid_client` :
         *
         *   basic, sans client_id au corps  → invalid_grant   ✅
         *   basic, avec client_id au corps  → « Client authentication failed »
         *   client_secret_post              → « Invalid authentication method »
         *
         * Le `client_id` dupliqué entre l'en-tête `Authorization` et le corps est
         * rejeté comme ambigu ; c'est ce qui faisait passer une authentification
         * valide pour un échec. Le paramètre `realm` a été testé dans les deux
         * sens : il ne change rien ici, et n'est donc pas transmis.
         */
        const tokenRes = await fetch(`https://${cfg.idpHost}/am/oauth2/access_token`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${Buffer.from(`${cfg.clientId}:${clientSecret}`).toString('base64')}`,
            },
            body: new URLSearchParams({
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
                code_verifier: verifier,
            }),
        });
        const tokenBody = (await tokenRes.json()) as Record<string, unknown>;
        if (!tokenRes.ok || typeof tokenBody.access_token !== 'string') {
            throw transientError(
                `Échange refusé (${tokenRes.status}) : ${JSON.stringify(tokenBody).slice(0, 200)}`,
                trace
            );
        }
        trace.push('jetons obtenus');

        return {
            accessToken: tokenBody.access_token,
            refreshToken: typeof tokenBody.refresh_token === 'string' ? tokenBody.refresh_token : null,
            expiresIn: typeof tokenBody.expires_in === 'number' ? tokenBody.expires_in : null,
            trace,
        };
    } finally {
        await browser?.close().catch(() => {});
    }
}

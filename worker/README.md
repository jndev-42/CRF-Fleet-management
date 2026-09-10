# Worker d'authentification PSA / Stellantis

Service séparé dont l'unique rôle est d'**obtenir un jeton OAuth Stellantis dans un
vrai navigateur**. L'application Next.js ne peut pas le faire elle-même : Vercel
n'exécute pas Chromium en fonction serverless.

## Pourquoi ce service existe

Établi par preuve dans `scripts/stellantis-login-test.ts` (dépôt principal), pas par
supposition :

| Constat | Preuve |
|---|---|
| Stellantis délègue son identité à **Gigya** | `/am/json/authenticate` ne rend qu'un `RedirectCallback` vers `fidm.eu1.gigya.com` |
| Le captcha est **inconditionnel** | `accounts.login` → `400006 Invalid CaptchaType`, identique à vide et avec de vrais identifiants |
| Aucun `redirect_uri` https n'est enregistré | 4 variantes testées → `redirect_uri_mismatch` ; seul `mymap://` est accepté |

Un navigateur réel franchit le captcha comme un utilisateur. C'est la seule voie qui
préserve l'UX « email + mot de passe, rien d'autre ».

## Ce qu'il ne fait pas

**Il n'est pas sur le chemin des relevés quotidiens.** Une fois les jetons obtenus,
l'application lit la télémétrie directement depuis Vercel. Un worker en panne, ou
endormi, empêche de créer une *nouvelle* connexion — jamais de relever un kilométrage.
Le cron ne dépend pas de lui.

Il ne persiste rien : les identifiants le traversent en mémoire, le temps d'un login.

## Prérequis : un `client_secret` par marque

La découverte OIDC de l'IdP annonce :

```
token_endpoint_auth_methods_supported: [client_secret_post, private_key_jwt, client_secret_basic]
```

`none` en est **absent** : PKCE seul ne suffit pas à l'échange, bien que l'étape
d'autorisation accepte `code_challenge`. Sans secret, le token endpoint répond
`400 invalid_client — Invalid authentication method for accessing this endpoint`.

Ce n'est pas un secret de compte mais une **constante d'application mobile**.

`psa_car_controller` ne la stocke pas : il l'extrait de l'application mobile au moment
de la configuration (`psa_car_controller/psa/setup/apk_parser.py`, `app_decoder.py`).
Elle est en revanche lisible telle quelle dans l'intégration Home Assistant :

```
andreadegiovine/homeassistant-stellantis-vehicles
  branche develop  ←  et non main
  custom_components/stellantis_vehicles/configs.json
```

⚠️ **`client_id` et `client_secret` forment une paire.** Si le `client_id` de ce fichier
diffère de celui codé dans `brands.ts`, reprendre **les deux** — d'où les surcharges
`<MARQUE>_CLIENT_ID`, qui vont de pair avec `<MARQUE>_CLIENT_SECRET`.

Elle reste hors du dépôt, dans une variable **par marque** — `PEUGEOT_CLIENT_SECRET`,
`CITROEN_CLIENT_SECRET`, `DS_CLIENT_SECRET`, `OPEL_CLIENT_SECRET` — déclarées `sync: false`
dans `render.yaml`, donc saisies dans l'interface Render.

Une variable unique pour les quatre marques donnerait le secret Peugeot à Citroën, DS et
Opel : `client_id` et `client_secret` forment une paire, et le dépareillage est refusé en
`invalid_client`. Seul Peugeot est requis aujourd'hui ; les autres marques échouent avec un
message explicite tant que leur secret n'est pas fourni.

L'échange se fait en **`client_secret_basic`**, et **sans répéter le `client_id` dans le
corps** de la requête : l'IdP rejette la duplication entre l'en-tête `Authorization` et le
corps, avec un message (« Client authentication failed ») qui désigne à tort les
identifiants. `client_secret_post` est refusé par ce client, quelle que soit la forme.

## 1. Spike local — à faire AVANT de déployer

```bash
cd worker
npm install
npx playwright install chromium
PSA_MAIL=… PSA_PASS=… PEUGEOT_CLIENT_SECRET=… HEADED=1 SLOWMO=250 npm run spike -- --brand PEUGEOT
```

`HEADED=1` ouvre un navigateur visible : au premier essai, c'est le seul moyen de voir
où le parcours s'arrête si un sélecteur Gigya a bougé.

**Ne rien provisionner tant que ce spike n'est pas vert.** Si le captcha se révèle
visible plutôt qu'invisible, le worker ne résout rien et il faut rouvrir la question.

À reporter dans la spec en cas de succès : la valeur de `expires_in`, et le sélecteur
retenu (visible dans la trace).

## 2. Déploiement sur Render — plan gratuit

1. Pousser la branche sur GitHub.
2. Render → **New +** → **Blueprint** → sélectionner le dépôt, puis la branche.
   `render.yaml` (à la **racine** du dépôt — Render ne le cherche que là) est
   détecté ; son `rootDir: worker` fait que l'application Next.js n'est ni
   construite ni déployée.
3. Render génère `WORKER_SHARED_SECRET`. **Le copier** (Environment → Reveal).
4. Attendre la fin du build (image Playwright ≈ 2 Go, comptez 5–10 min la première fois).
5. Vérifier : `curl https://<service>.onrender.com/health` → `{"status":"ok",…}`.

### Variables côté Vercel (étape suivante, pas encore câblée)

| Variable | Valeur |
|---|---|
| `PSA_WORKER_URL` | `https://<service>.onrender.com` |
| `PSA_WORKER_SECRET` | le `WORKER_SHARED_SECRET` copié à l'étape 3 |

Et côté Render, à saisir manuellement : `PEUGEOT_CLIENT_SECRET` (et le secret de chaque autre marque utilisée).

## Si l'authentification échoue depuis Render mais passe en local

Symptôme : `échec AUTH … Il y a des erreurs dans votre formulaire`.

Le message de Gigya est ambigu — il sort aussi bien pour un mot de passe faux que
pour un contrôle anti-robot. Le worker sonde donc la page avant de conclure : un
captcha visible produit un `TRANSIENT` explicite, **jamais** un `AUTH`. La
distinction compte, seul `AUTH` faisant basculer toute l'UL en bandeau rouge.

Si les identifiants sont vérifiés en local, deux causes restent :

| Cause | Levier |
|---|---|
| Chromium headless est détectable | `HEADED=1` (déjà posé dans `render.yaml`) : Xvfb fournit un affichage virtuel et le navigateur tourne headful |
| L'IP d'un datacenter est mal notée | aucun levier côté code — l'acquisition devrait alors se faire depuis un poste, cf. l'option « helper local » écartée à l'étude |

Le worker journalise la longueur des champs remplis, jamais leur valeur : un
`mot de passe 0 car.` désignerait un défaut de remplissage plutôt qu'un refus.

## Contraintes du plan gratuit, et comment on fait avec

| Contrainte | Conséquence | Traitement |
|---|---|---|
| Veille après 15 min d'inactivité | réveil ≈ 50 s | `GET /health` appelé à l'ouverture de la modale : le réveil est absorbé par le temps de saisie de l'admin |
| 512 Mo de RAM | deux Chromium simultanés font tomber le service | logins sérialisés (`serialize()` dans `server.ts`) + `--disable-dev-shm-usage` |
| Pas de disque persistant | — | sans objet : le worker ne persiste rien |
| Build lent | premier déploiement long | sans objet : on ne déploie pas souvent |

Le réveil de 50 s est la seule vraie gêne, et elle ne frappe que la **première**
connexion après une longue inactivité — soit une fois par UL, à la création.

## API

### `GET /health`
Sonde Render et préchauffage. → `{ "status": "ok", "uptime": 42 }`

### `POST /connect`

```
Authorization: Bearer <WORKER_SHARED_SECRET>
Content-Type: application/json

{ "brand": "PEUGEOT", "login": "…", "password": "…", "country": "fr" }
```

| Réponse | Sens |
|---|---|
| `200 { accessToken, refreshToken, expiresIn, trace }` | succès |
| `401 { error: "AUTH", message }` | identifiants refusés — **seul cas** autorisant l'appelant à basculer le credential en `ERROR` |
| `502 { error: "TRANSIENT", message }` | réseau, délai dépassé, sélecteur introuvable — ne rien basculer |

Cette distinction reprend le contrat de `src/lib/renault.ts` : élargir le déclencheur
`AUTH` ferait passer toute la flotte en bandeau rouge au premier incident réseau.

## Marques

| Marque | `client_id` | Statut |
|---|---|---|
| PEUGEOT | `1eebc2d5-…` | vérifié en sonde |
| VAUXHALL | `122f3511-…` | vérifié en sonde |
| CITROEN · DS · OPEL | — | `client_id` à relever ; le service refuse explicitement plutôt que d'échouer en `redirect_uri_mismatch` |

Realms et `idpHost` sont vérifiés pour les cinq marques.

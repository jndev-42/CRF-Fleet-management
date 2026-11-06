<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-11-06 -->

# Demo Mode

## Purpose
Mode démo sur une **base démo Turso partagée**, distincte de la prod et recopiée chaque nuit depuis la prod. En démo, les requêtes API lisent et écrivent dans cette base : les actions s'appliquent vraiment (réserver, valider…), sans jamais toucher la prod. Tous les utilisateurs en démo voient les modifications des autres jusqu'à la recopie suivante.

## Key Files
| File | Description |
|------|-------------|
| `readOnly.ts` | Source unique, pure (partagée client/serveur/proxy) : cookie, en-tête `x-crf-demo`, clé localStorage, événement, `DEMO_EXTERNAL_WRITE_ROUTES`, `isDemoExternalWrite`, `isDemoEligibleApi`, `isDemoDbConfigured` (faux si l'URL démo = la prod), `isDemoDbSameAsProd`, `isDemoBlockedRequest(path, method, demoDbConfigured)`, `isQrPage` |
| `server.ts` | Serveur uniquement : `isDemoRequest()` (en-tête `x-crf-demo: 1` posé par le proxy ET base démo configurée ; hors requête → faux), `getDemoClient()` (`null` si non configurée ou égale à la prod) |
| `cloneDatabase.ts` | `cloneDatabase(source, target)` : recopie schéma, lignes (pages, `INSERT OR REPLACE`, parents d'abord), index, vues, déclencheurs, puis index FTS du référentiel reconstruit. Source : `SELECT` seuls. `DemoMeta` (`refreshing` → `ready` + `refreshedAt`, lu par `readDemoState`). `DEMO_SCHEMA_ONLY_TABLES` (`BrandCredential`, `RenaultSession`, `McpToken`, `PushSubscription`) et leurs dépendantes par clé étrangère (`VehicleConnection`) : schéma sans lignes |
| `fetchInterceptor.ts` | Enveloppe `window.fetch` : simule les seules écritures de `DEMO_EXTERNAL_WRITE_ROUTES` (hors pages QR), émet `crf-demo-simulated` |

## Mise en place (une fois)
1. `turso db create crf-demo` puis `turso db tokens create crf-demo`.
2. Variables Vercel (prod et preview) : `TURSO_DEMO_DATABASE_URL`, `TURSO_DEMO_AUTH_TOKEN`.
3. La base se remplit à la recopie suivante (fin du cron `/api/cron/daily-mileage-check`, 23h59). Sans ces variables, `GET /api/demo/status` répond `{ available: false }` et le bouton d'activation est masqué.

## For AI Agents
- **Aiguillage dans `src/lib/db.ts` uniquement** : `db` résout le client à chaque appel (`headers()` de `next/headers`). Le cookie est partagé entre onglets ; l'en-tête `x-crf-demo: 1`, lui, n'est posé par `src/proxy.ts` que sur une API hors QR (`/api/qr*`) et hors `/api/auth/`, et toute valeur envoyée par le client est retirée. Le cookie reste posé sur les pages QR (aligné sur la démo choisie, pas sur la page). Jamais de choix de base route par route. `prodDb` = toujours la prod (auth, crons, recopie) ; `demoDb` = base démo ou `null`.
- `src/auth.ts` (utilisateur, rôles, UL de session) lit toujours `prodDb`. Un compte créé en prod après la dernière recopie n'a ses données démo qu'après la recopie suivante.
- Effets externes neutralisés en démo, côté lib : pas de Web Push (`push.ts`, la notification in-app reste en base démo), pas d'e-mail (`email.ts`), aucune suppression Drive (`deleteDriveFolder`), R2 transparent sous le préfixe `demo/` (`putObject` écrit `demo/<clé>`, les lectures — `getObject`, `headObject`, `getObjectSize`, `getObjectRange`, `presignUrl` GET/HEAD — lisent `demo/<clé>` puis la vraie clé, `deleteObject` ne supprime que `demo/<clé>`, `presignUrl('PUT')` refusé ; `purgeDemoObjects()` vide `demo/` chaque nuit après la recopie) — la base démo référence les fichiers de la prod. Aucun appel Renault : `authenticateBrand` lève `BrandTransientError('… indisponible en mode démo')`, sans changement de statut.
- **Toute nouvelle route qui écrit hors base (Drive, R2, API externe) doit rejoindre `DEMO_EXTERNAL_WRITE_ROUTES`** : elle est alors simulée côté client et refusée (403) par `src/proxy.ts`.
- Garde-fou : base démo non configurée + cookie de démo → `src/proxy.ts` refuse toute écriture `/api/` non exemptée (403 `{ error: 'Mode démo : lecture seule', demo: true }`). Le proxy tourne sous Node (Next 16) et lit `process.env.TURSO_DEMO_DATABASE_URL` à chaque requête.
- Recopie : `refreshDemoDatabase()` en fin de `/api/cron/daily-mileage-check`, après le contrôle kilométrique, dans un `try/catch` journalisé (`[demo] …`) ; la réponse du cron ne change pas. Refusée si l'URL démo désigne la prod. Non atomique : un échec laisse `DemoMeta.state = 'refreshing'`, et `GET /api/demo/status` répond `available: false` jusqu'à la recopie réussie suivante.
- Statut conservé dans `localStorage` (`crf_is_demo_mode`) **et** dans le cookie `crf_demo_mode=1` (`path=/`, `SameSite=Lax`), synchronisés par `DemoContext`, qui expose aussi `isDemoAvailable` (`GET /api/demo/status`) et quitte une démo devenue indisponible.
- Pages QR (`/qr`, `/qr-ul`, `/qr-stock`, `/qr-uniforms`) : démo désactivée (prod, pas de bandeau).
- Un formulaire qui lit un champ de la réponse d'une route externe simulée doit tolérer `simulated: true` (pas d'`id`, pas de `token`).

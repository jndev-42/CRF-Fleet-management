---
title: 'Mode démo : base démo partagée, recopiée chaque nuit depuis la prod'
type: 'feature'
created: '2026-11-06'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'd42ce6b370a64186ac22cab191243ec7aaa6a8ee'
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la v5.40.0 (PR #158), le mode démo montre les vraies données en lecture seule et simule les écritures : rien ne change à l'écran, donc on ne peut pas s'entraîner sur un parcours complet (réserver, voir la réservation, la valider…).

**Approach:** En démo, les requêtes API lisent et écrivent dans une **base démo Turso partagée**, distincte de la prod et recopiée chaque nuit depuis la prod. Les écritures s'appliquent donc vraiment, sans jamais toucher la base de production.

**Décisions (utilisateur, 2026-11-06) :**
- Une seule base démo, partagée par tous les utilisateurs en démo : chacun voit les modifications des autres jusqu'à la recopie suivante. Pas de purge à la sortie individuelle. Pas de copie par session, pas de rejeu sur la prod, pas de mémoire navigateur.
- La base est créée une fois à la main (`turso db create`) et configurée par `TURSO_DEMO_DATABASE_URL` / `TURSO_DEMO_AUTH_TOKEN`. Sans ces variables, l'activation de la démo est masquée.
- Recopie prod → démo à la fin du cron quotidien existant `/api/cron/daily-mileage-check` (23h59), sans cron supplémentaire. Elle **ne doit pas bloquer la prod** : lectures paginées, aucune transaction ni écriture sur la prod, exécution après le contrôle kilométrique. Un échec de recopie est journalisé sans changer la réponse du cron.
- Pas d'infrastructure ni de service supplémentaire, et rien à maintenir module par module.
- (2026-11-06, après revue) Fichiers R2 en démo : écrits dans le même bucket sous le préfixe `demo/`, jamais à côté des fichiers réels. Une lecture en démo cherche d'abord `demo/<clé>`, puis la clé réelle (lecture seule). Le préfixe est vidé par le cron de 23h59 avec la recopie. Le circuit complet des notes de frais (scellements successifs) fonctionne donc en démo.

## Boundaries & Constraints

**Always:**
- **Aiguillage :** une requête serveur portant le cookie `crf_demo_mode=1` (v5.40.0) utilise le client démo. Sans cookie, ou hors contexte de requête (cron, scripts, tests), c'est la prod.
- **Identité :** l'authentification (`src/auth.ts` : utilisateur, rôles, session) lit toujours la prod.
- **Effets externes neutralisés en démo :** pas d'envoi Web Push ni d'e-mail. La notification in-app est conservée, en base démo. Les uploads vers Google Drive et R2, les appels Renault et le scellement restent simulés (règle « simulée » de la v5.40.0, restreinte à ces routes).
- **Pages QR publiques :** hors démo, inchangé.
- **Garde-fou :** si la base démo n'est pas configurée et qu'un cookie de démo est présent, toute écriture API est refusée (403 de la v5.40.0).

**Never:**
- Aucune écriture sur la prod depuis une requête démo.
- Aucune modification route par route de l'accès à la base : l'aiguillage se fait dans `src/lib/db.ts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Écriture démo | Cookie démo, POST d'une réservation | Ligne créée dans la base démo, visible au rechargement ; prod inchangée | N/A |
| Hors démo | Pas de cookie, même POST | Écrit en prod (inchangé) | N/A |
| Hors requête | Cron ou script appelle `db.execute` | Client prod | `cookies()` indisponible → prod |
| Push en démo | Cookie démo, action qui notifie | Notification in-app en base démo, aucun Web Push | N/A |
| Upload en démo | Cookie démo, POST `/api/drive/upload` | Simulé côté client, 403 côté serveur | N/A |
| Démo non configurée | Variables démo absentes | Bouton d'activation masqué ; cookie résiduel → écritures 403 | N/A |
| Recopie | Cron 23h59 | Contrôle kilométrique d'abord ; base démo remplacée par la prod (schéma, données, index FTS reconstruit) | Erreur journalisée, cron 200 inchangé |
| Nouvel utilisateur | Compte créé en prod après la dernière recopie | Authentifié normalement ; les données démo le concernant n'existent qu'après la recopie suivante | Pas de crash (404 ou listes vides) |

</frozen-after-approval>

## Code Map

- `src/lib/db.ts` -- aujourd'hui un `createClient` unique, importé par 124 fichiers. Méthodes utilisées : `execute` (1328), `transaction` (33), `batch` (9), `executeMultiple` (3), `close` (8, scripts). Exporter un `db` de même interface qui résout le client à chaque appel :
  - `cookies()` de `next/headers` dans un `try` : hors requête, c'est la prod ;
  - cookie de démo et base démo configurée : client démo ;
  - `transaction()` renvoie la transaction du client résolu.
  Exporter aussi `prodDb` (toujours la prod) et `demoDb` (ou `null`) pour la recopie, `auth.ts` et les crons. Le chargement du module ne doit pas lever d'erreur (build).
- `src/auth.ts:126-296` -- passer de `db` à `prodDb` (identité et rôles toujours en prod).
- `scripts/dev-db-init.ts:40-190` (`prodCloneMode`) -- en extraire le cœur réutilisable dans `src/lib/demo/cloneDatabase.ts` : `cloneDatabase(source, target)`, qui fait les étapes suivantes.
  - Énumère `sqlite_master` et ignore `isFtsShadowTable` (`src/lib/referentiel/schema`).
  - Suit l'ordre parents d'abord.
  - Supprime puis recrée les tables cibles.
  - Copie les lignes par pages, en `INSERT OR REPLACE`.
  - Recrée l'index FTS (`REFERENTIEL_FTS_DDL`) et lance `REFERENTIEL_REBUILD_SQL`.
  Le script `dev-db-init` appelle ce module. Côté source, uniquement des `SELECT`, jamais de transaction.
- `src/app/api/cron/daily-mileage-check/route.ts` -- après le traitement existant, si `demoDb` est configuré, `await cloneDatabase(prodDb, demoDb)` dans un `try/catch` journalisé, avec la durée dans les logs. Le statut et le corps de la réponse ne changent pas. Fixer `export const maxDuration` assez haut pour la recopie.
- `src/lib/push.ts` (`sendPushNotification`) -- en démo (même détection que `db.ts`, via un helper commun `isDemoRequest()` dans `src/lib/demo/server.ts`), garder la notification in-app et ne pas envoyer de Web Push.
- `src/lib/email.ts` -- même helper : pas d'envoi en démo.
- `src/lib/demo/readOnly.ts` -- remplacer « toute écriture `/api/` est bloquée » par une liste `DEMO_EXTERNAL_WRITE_ROUTES` (préfixes et motifs) :
  - `/api/drive/upload`, `/api/expenses/upload` ;
  - `/api/referentiel/upload`, `/api/referentiel/process` ;
  - `/api/vehicles/[id]/guide` (POST, DELETE) ;
  - `/api/vehicles/[id]/connection` ;
  - `/api/trips/[id]/refresh-renault` ;
  - `/api/push/subscriptions`.
  Ce sont les seules routes simulées par `fetchInterceptor` et refusées en 403 par `src/proxy.ts` en démo. Quand la base démo n'est pas configurée, le proxy bloque toujours toutes les écritures. Le proxy ne peut pas lire l'environnement serveur côté edge : utiliser `process.env.TURSO_DEMO_DATABASE_URL` (le proxy tourne en Node avec Next 16) et le vérifier au build.
- `src/lib/contexts/DemoContext.tsx`, `src/app/aide/page.tsx`, `src/components/DemoBanner.tsx` -- textes : « Base de démonstration partagée, remise à zéro chaque nuit à partir des vraies données. Vos actions sont réellement enregistrées dans la démo, jamais dans la base réelle. » Bouton d'activation masqué si la démo n'est pas disponible (exposer la disponibilité via `GET /api/demo/status` → `{ available }`, route lue sans auth particulière hors session). Supprimer le message « Action simulée » général, et le garder pour les routes externes.
- Parcours « réponse simulée » de la v5.40.0 (`MissionWizard`, `useMcpTokens`, `ReferentielTab`, `missions/new`) -- conserver la tolérance, sans effet quand la réponse est réelle.
- `CLAUDE.md` (section Commands) et `src/lib/demo/AGENTS.md` -- création de la base démo (`turso db create crf-demo`, `turso db tokens create crf-demo`), variables Vercel, recopie à 23h59, et règle : toute nouvelle route qui écrit hors base (Drive, R2, API externe) doit rejoindre `DEMO_EXTERNAL_WRITE_ROUTES`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/demo/server.ts` -- `isDemoRequest()` (cookie et configuration), `getDemoClient()`.
- [x] `src/lib/db.ts` -- `db` aiguillé, `prodDb`, `demoDb`.
- [x] `src/auth.ts` -- `prodDb`.
- [x] `src/lib/demo/cloneDatabase.ts` + `scripts/dev-db-init.ts` -- extraction et réutilisation.
- [x] `src/app/api/cron/daily-mileage-check/route.ts` -- recopie après le contrôle, sans bloquer.
- [x] `src/lib/push.ts`, `src/lib/email.ts` -- envois neutralisés en démo.
- [x] `src/lib/demo/readOnly.ts`, `src/lib/demo/fetchInterceptor.ts`, `src/proxy.ts` -- simulation et 403 limités aux routes externes, 403 total si la base démo n'est pas configurée.
- [x] `src/app/api/demo/status/route.ts` (NEW, via `/api-route-template`) -- `{ available }`, et `npm run mcp:catalog`.
- [x] `src/lib/contexts/DemoContext.tsx`, `src/components/DemoBanner.tsx`, `src/app/aide/page.tsx` -- disponibilité et textes.
- [x] `CLAUDE.md`, `src/lib/demo/AGENTS.md` -- mise en place et règles.
- [x] Tests :
  - `db.ts` : aiguillage avec et sans cookie, hors requête, démo non configurée, transaction ;
  - `cloneDatabase` : sur deux SQLite en mémoire (schéma, lignes, FTS, idempotence) ;
  - cron : recopie appelée après le contrôle, erreur sans effet sur la réponse ;
  - push et e-mail neutralisés ;
  - proxy et intercepteur : routes externes seulement, 403 total si non configuré ;
  - route `/api/demo/status` ;
  - une intégration : POST en démo écrit dans la base démo et pas en prod.
- [x] `package.json` et `package-lock.json` (5.41.0), `CHANGELOG.md` (en français, orienté utilisateur).

**Acceptance Criteria:**
- Given la démo active, when on crée puis valide une réservation, then elle apparaît et évolue dans la démo, et la prod n'a aucune nouvelle ligne.
- Given un utilisateur hors démo, when il utilise l'application, then aucun comportement ne change.
- Given le cron de 23h59, when la recopie échoue ou dure, then le contrôle kilométrique a déjà été traité et la prod ne subit ni verrou ni écriture.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route |
|---|--------|---------|---------|-------|
| 1 | blind, edge | Cookie partagé entre onglets, effacé sur les pages QR : un onglet resté en démo écrit en prod | high : `setDemoCookie(false)` sur `effectiveDemo` false, et le routage serveur ne lit que le cookie | patch (en-tête posé par le proxy, exemption QR côté serveur) |
| 2 | edge | Navigation vers une page QR : les fetch au montage lisent la base démo | medium : même cause que n° 1 | patch (n° 1) |
| 3 | edge | URL démo égale à l'URL prod : la recopie supprime toutes les tables de prod | high : catastrophique si mal configuré, garde triviale | patch |
| 4 | blind, edge | Recopie interrompue (délai, erreur) : base démo vide toute la journée, mais le statut dit « disponible » | medium : DROP global avant toute copie, aucun indicateur | patch (ligne `DemoMeta`) |
| 5 | blind, edge | Statut « disponible » alors que le client démo n'a pas pu être créé | medium : `isDemoDbConfigured` ne regarde que la variable d'environnement | patch |
| 6 | verif, blind, edge | Le scellement des notes de frais écrit dans le bucket R2 de prod en démo | medium : `persist-seal.ts:72` appelle `putObject` sans garde ; écart à « Always » | patch |
| 7 | blind | Copie des secrets (BrandCredential, McpToken, PushSubscription) ; appels Renault en démo avec ces identifiants | medium : rotation possible des jetons constructeur de prod | patch |
| 8 | verif, blind | Auth sur `prodDb` sans test qui distingue les deux clients | medium : constat pré-vérifié | patch |
| 9 | verif | Branche « fail-closed » de `resolveClient` sans test | medium : constat pré-vérifié | patch |
| 10 | blind | Le test du cron confond `db` et `prodDb` | low : correction directe du test | patch |
| 11 | verif | Affichage conditionnel de la carte démo sur Aide sans test | low : sortie possible par le bandeau | defer |
| 12 | blind | Docs : offre Vercel nécessaire pour `maxDuration` 300, variables à définir aussi en preview, démo indisponible pendant la recopie | medium : fichiers de contexte agent | defer |
| 13 | edge | Pagination par OFFSET pendant que la prod change | low : recopie à 23h59, faible trafic | rejet |
| 14 | edge | Cycles de clés étrangères ou lignes enfants orphelines | false : la copie passe par `migrate`, clés étrangères désactivées | rejet |
| 15 | edge | Taille des requêtes de copie | low : environ 50 pages de quelques Ko | rejet |
| 16 | edge | Utilisateur créé en prod après la recopie | limitation acceptée par l'intention | rejet |
| 17 | edge | `dev-db-init` n'est plus atomique | low : il suffit de relancer `dev:prod` | rejet |
| 18 | blind | Getters `closed` et `protocol` du client aiguillé | low : non utilisés par les routes | rejet |
| 19 | blind | `/api/bugs/report` fonctionne en démo | false : volontaire, les signalements de bug sont souhaités | rejet |
| 20 | blind | Texte du bandeau affiché sans condition | low : la démo est quittée quand le statut dit « indisponible » | rejet |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: tout passe
- `npm run build` -- expected: OK

**Manual checks (if no CLI):**
- Avec une base démo de test (conteneur local libsql comme base « démo »), activer la démo, créer une réservation, vérifier qu'elle existe dans la base démo et pas dans la base principale, puis lancer le cron et vérifier que la base démo est recopiée.

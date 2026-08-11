# Revue de code complète — martine (CRF Fleet Management)

**Date :** 2026-08-11
**Périmètre :** Audit exhaustif, lecture seule (aucune modification de code applicatif ni de `CLAUDE.md`/`.claude/rules/*.md`)
**Méthode :** 4 audits spécialisés en parallèle (sécurité, qualité/architecture, patterns Next.js 16/React 19, couverture de tests), sur l'intégralité du dépôt
**Chiffres réels du dépôt** *(corrigent l'estimation initiale de reconnaissance)* : 73 routes API, 90 composants (58 avec état), 21 modules `src/lib`, 48 fichiers de test, ~49 000 lignes TS/TSX
**Statut lint :** `npm run lint` — 0 erreur, 0 warning (vérifié)
**Statut tests :** `npm run test` — **435 passent, 5 échouent** ⚠️ (voir section Tests — contredit l'hypothèse initiale que la suite passait entièrement)

---

## Résumé exécutif

Le code est globalement discipliné : SQL paramétré presque partout, validation Zod largement présente, rôles centralisés dans `src/lib/roles.ts`, `any` rare et justifié, `npm run lint` propre. Mais l'audit sécurité a mis au jour **3 vulnérabilités critiques** exploitables par n'importe quel utilisateur authentifié, et l'audit qualité confirme un défaut structurel récurrent : l'absence de quelques abstractions partagées (auth/authz, fetch avec annulation, store de jobs d'export) là où le code se répète le plus. Le point commun à la majorité des failles sécurité (Critique #2, #3, Haute #5, #6, #7) est le même : **l'appartenance à une Unité Locale (UL) n'est vérifiée que sur certaines routes, pas sur les routes comparables** — un seul chantier de correction (copier le pattern déjà correct de `banners/[id]`, `users/[email]`, `missions/[id]`) couvrirait la plupart d'entre elles.

**Priorité recommandée avant tout déploiement** (à título indicatif — cet audit ne modifie rien, cf. portée demandée) :
1. Sécurité Critique #1, #2, #3 — risque de fuite de données inter-UL et de prise de contrôle de véhicules à distance
2. Sécurité Haute #4 (`isInactive([])` renvoie `false`) — inverse la politique deny-by-default pour tout compte nouvellement provisionné
3. Les 5 tests actuellement rouges (non détectés faute de CI)

---

## 1. Sécurité

*Audit exhaustif de `src/app/api/**` (73 routes), `src/lib/**`, `src/auth.ts`, `src/proxy.ts`.*

### CRITIQUE

**1. Injection SQL via le paramètre `vehicleId` — contourne l'isolation multi-UL**
`src/app/api/vehicles/calendar/route.ts:94`
```ts
const vehicleFilterClause = vehicleIdParam ? ` AND v.id = '${vehicleIdParam}'` : '';
```
La même valeur est correctement paramétrée 20 lignes plus haut (ligne 74, `AND v.id = ?`) pour la requête véhicules — le bug est que les requêtes réservations/trajets/maintenance la réutilisent en chaîne brute (lignes 103, 138, 174).
**Scénario :** un utilisateur authentifié appelle `GET /api/vehicles/calendar?vehicleId=' OR '1'='1`. Le filtre `AND v.ulId = '<ulId>'` du tenant est contourné, exposant réservations, trajets et maintenance de **toutes** les UL. Une injection `UNION SELECT` permettrait de lire d'autres tables (emails, `RenaultSession.idToken`, `UniteLocale`).

**2. Élévation de privilèges : token QR lisible pour n'importe quel véhicule → prise de contrôle inter-UL**
`src/app/api/vehicles/[id]/qr-token/route.ts:40-69`
`GET`/`POST` exigent seulement `session?.user` — aucun contrôle de rôle, ni d'appartenance à l'UL, ni de statut `isInactive`. Le `GET` crée même le token s'il n'existe pas.
**Scénario :** un utilisateur (même sans rôle, cf. finding #4) énumère des UUID de véhicules (via `/api/vehicles/calendar` ou l'injection SQL ci-dessus), récupère le token QR d'un véhicule d'une autre UL, puis appelle `POST /api/qr/<token>/checkout` — ce endpoint saute délibérément les contrôles UL/rôle car conçu pour un token physiquement détenu. Résultat : checkout d'un véhicule d'une autre UL, mutation de `Vehicle.status`/kilométrage/carburant, création d'un `Trip`. Le `DELETE` du même fichier est bien protégé admin — confirmant que le `GET` aurait dû l'être aussi.

**3. Lecture/écriture arbitraire sur Google Drive via des IDs de dossier/fichier fournis par le client**
Une seule identité OAuth (`src/lib/drive.ts:12-21`) avec accès à tout le drive partagé ; aucune route ne restreint les IDs aux ressources de l'appelant.
- `src/app/api/drive/photos/[fileId]/route.ts:48-57` — auth seule, puis `drive.files.get({fileId})` sur n'importe quel ID.
- `src/app/api/drive/photos/route.ts:42,55,70` — `folderId` interpolé dans la requête Drive `q` (injection de requête Drive possible via `'`).
- `src/app/api/drive/upload/route.ts:61,120,146` et `src/app/api/expenses/upload/route.ts:45,113,140` — `rootFolderId`/`existingFolderId`/`folderId` venant du formData, utilisés sans vérification.
**Scénario :** un CHVL authentifié lit les justificatifs de frais ou photos d'incident d'une autre UL en itérant sur `fileId`, ou écrit des fichiers dans un dossier Drive arbitraire de l'organisation.

### HAUTE

**4. Les comptes sans aucun rôle contournent le contrôle "compte inactif"**
`src/lib/roles.ts:95-97` — `isInactive([])` renvoie **`false`** (vérifié à l'exécution) car `roles.length > 0 && ...`. `src/auth.ts:148-167` auto-crée un `User` pour tout compte Google `@croix-rouge.fr` dès la première connexion, avec `roles = []`. L'idiome défensif `session.user.roles || ['INACTIF']` ne protège pas, car `[]` est *truthy*.
**Scénario :** n'importe quelle boîte `@croix-rouge.fr` se connecte une fois, est auto-provisionnée sans rôle, et passe pour "active" partout — checkout de véhicules, lecture des stats flotte complètes (noms/emails des conducteurs), création d'issues GitHub publiques via `/api/bugs/report`. La politique voulue (deny-by-default) s'inverse en allow-by-default.

**5. IDOR sur les exports PDF — aucun contrôle de propriété**
`src/app/api/expenses/[id]/pdf/route.ts:91-96` et `src/app/api/incidents/[id]/pdf/route.ts:123-128` — auth seule, contrairement à leurs équivalents JSON qui vérifient bien propriétaire/rôle (`src/app/api/expenses/[id]/route.ts:57-62`).
**Scénario :** un CHVL qui reçoit un 403 sur `GET /api/expenses/<id>` obtient le PDF complet (montants, identité, justificatifs) via `GET /api/expenses/<id>/pdf`.

**6. Exposition de données inter-UL sur les routes de détail véhicule**
Aucun filtre `session.user.ulId` sur : `vehicles/[id]/route.ts` (véhicule + 20 derniers trajets, noms ET emails), `vehicles/[id]/desinfections/route.ts`, `incidents/[id]/route.ts` (victimes, dommages), `renault/[vin]/route.ts` (télémétrie live pour tout VIN), `users/route.ts` (annuaire complet toutes UL confondues malgré le gate `canAccessAdminPanel`).
**Scénario :** les routes véhicule clés sur `name` (`WHERE name = ?`), un identifiant court et devinable ("VL1", "VPSP2") — un utilisateur d'une UL peut moissonner des PII de conducteurs d'autres UL.

**7. Actions destructrices inter-UL accessibles à tout admin local**
`isAdminOrAbove()` est vérifié mais l'appartenance UL de la ressource ciblée ne l'est jamais : `vehicles/[id]/trips/route.ts` (supprime tous les trajets **et** les dossiers Drive associés), `vehicles/[id]/route.ts` (PATCH/DELETE), `vehicles/[id]/maintenance*`, `checklist/[itemId]/route.ts`. À contraster avec `users/[email]/route.ts` et `banners/[id]/route.ts`, qui comparent bien `session.user.ulId`.
**Scénario :** un ADMIN d'une petite UL supprime irréversiblement l'historique de trajets (+ preuves photo Drive) d'une autre UL, sans 403 ni trace.

### MOYENNE

**8. Endpoint cron fail-open si `CRON_SECRET` n'est pas défini** — `cron/daily-mileage-check/route.ts:9` : le contrôle est sauté si la variable est absente, alors que le handler exécute ensuite des `DELETE` non conditionnés.
**9. Admin local peut modifier les rôles globaux d'un utilisateur sans UL "home"** — `users/[email]/route.ts:49-53`, le garde-fou inter-UL ne s'applique que si `userHomeUlId` est renseigné.
**10. Valeurs de session/DB interpolées dans du SQL au lieu d'être paramétrées** (non exploitable aujourd'hui, mais fragile) — `vehicles/route.ts:70-97` (un `db.execute(sql)` sans objet `args` du tout), `vehicles/calendar/route.ts:67-68`, `onesignal.ts:42`.
**11. Statistiques flotte complètes accessibles à tout utilisateur non-inactif** — `stats/route.ts:22-25` (gate `isInactive` seul) vs `stats/trips/route.ts:26-28` (gate `canAccessAdminPanel`, plus strict) : incohérence, la version stricte semble être l'intention.
**12. Validation Zod manquante sur plusieurs routes de mutation** — `users/[email]/route.ts`, `ul/[id]`, `trips/[id]`, `notifications/[id]`, `vehicles/[id]/qr-token`, `inventory/{adjust,stocks,batches}`, `missions/[id]`, `users/[email]/validate-papers`, `trips/[id]/refresh-renault`, `vehicles/[id]/trips`, `vehicles/[id]/maintenance/[recordId]`.

### FAIBLE

**13.** Lecture non authentifiée du changelog (`changelog/route.ts`) — reconnaissance uniquement, pas de traversal.
**14.** Erreurs Drive verbeuses journalisées côté serveur (`drive/upload`, `expenses/upload`, `drive/photos`) — réponses client correctement génériques.
**15.** `PUT` aliasé sur `PATCH` piloté par la forme du body (`reservations/[id]/route.ts`, `vehicles/[id]/qr-token/route.ts`) — pas de contournement aujourd'hui mais fragile pour l'avenir.

### Vérifié sain
Aucun `eval`, `new Function`, `child_process`, ou `dangerouslySetInnerHTML`. Aucun secret en dur (hors token de test factice dans les tests). `.env*` ignoré par git, aucune fuite vers `NEXT_PUBLIC_*`. `src/proxy.ts` (middleware renommé en Next 16) exclut correctement `/api` — cohérent avec le `auth()` par route. Notifications, suppression de réservation et historique d'inventaire vérifient correctement la propriété de la ressource.

---

## 2. Qualité & Architecture

*254 fichiers TS/TSX audités, ~49k lignes.*

### HAUTE

**H1 — Store de jobs en mémoire (`global`) incompatible avec le serverless Vercel**
`stats/pdf/route.ts`, `stats/csv/route.ts`, `stats/expenses/pdf/route.ts`, `stats/expenses/csv/route.ts` stockent les buffers générés dans une `Map` globale, puis le client poll un `jobId`. Sur Vercel, le `POST` et le `GET` de poll peuvent atterrir sur des instances lambda différentes → 404 intermittent en production, invisible en local. Nécessite un stockage externe (ligne Turso, blob store) ou une réponse streamée synchrone.

**H2 — Aucun helper d'auth/autorisation partagé : 89 blocs auth faits main sur 68 routes**
6 corps de réponse 401 différents, 22 corps 403 différents (`'Non autorisé'` sert aux deux, empêchant le client de distinguer les deux cas). C'est le mécanisme par lequel une future route peut silencieusement partir sans contrôle de rôle — cf. plusieurs findings sécurité ci-dessus.

**H3 — Aucune annulation de requête ni garde de démontage sur 56 composants**
`AbortController` : 0 occurrence dans tout le dépôt. Un seul composant (`CommunicationBanner.tsx`) utilise un garde `isMounted`. Race condition réelle dans `inventory/page.tsx` : changer rapidement de stock peut afficher les catégories du stock précédent si sa réponse arrive après.

### MOYENNE

- **M1** — Composants "Dieu" avec état local non géré : `vehicles/[id]/page.tsx` (1088 lignes, 35 `useState`), `expenses/page.tsx` (1273 lignes, 17+ `useState`), `qr/[token]/page.tsx` (879 lignes, 21 `useState`), `UsersTab.tsx` (866 lignes, 14 `useState`).
- **M2** — ~36 appels `fetch` sur 141 ne vérifient jamais `res.ok` → une erreur 500/403 devient silencieusement une liste vide sans affordance d'erreur.
- **M3** — Lookups de rôle N+1 dans des transactions d'écriture (`users/route.ts`, `users/[email]/route.ts`, `users/[email]/ul/route.ts`) — un `Map` en cache ou un `WHERE name IN (...)` unique suffirait.
- **M4** — 103 couleurs codées en dur dans des styles inline cassent le système de thème sombre/clair ; bug concret : badge Diesel illisible en dark mode (`VehicleBadges.tsx:112`).
- **M5** — 1415 occurrences de `style={{...}}` sur 85 fichiers, contredisant la convention CSS Modules affichée dans `CLAUDE.md`.
- **M6** — 3 composants récupèrent la session via `fetch('/api/auth/session')` au lieu de `useSession` — copie locale qui ne se met jamais à jour après un changement de rôle en session.
- **M7** — Les "singletons" de `src/lib` (`drive.ts`, `email.ts`) sont en réalité reconstruits à chaque appel, perdant le cache de token OAuth.
- **M8** — 28 composants modaux sans primitive partagée ; `Escape` n'apparaît nulle part dans `src/components` — aucun modal ne se ferme au clavier.

### FAIBLE
- L1 — `CLAUDE.md` référence `src/middleware.ts`, inexistant ; le fichier réel est `src/proxy.ts` (renommé en Next.js 16). *(voir aussi section 4)*
- L2 — Erreurs silencieusement avalées (`.catch(() => {})`) dans `aide/page.tsx`, `inventory/page.tsx`, `UsersTab.tsx`, `imageCompression.ts`.
- L3 — Effet avec dépendance trop large provoquant un refetch redondant (`inventory/page.tsx:73-85`).
- L4 — 9 `console.log` restants en code non-test, dont un qui journalise le corps des requêtes en mode démo (`fetchInterceptor.ts:20`).
- L5 — `src/lib/stats.ts` (614 lignes) mélange deux domaines (trajets + notes de frais) — un split suivrait les conventions existantes.

### Vérifié sain
Aucune injection SQL (les colonnes dynamiques sont contraintes par des schémas Zod stricts). Gestion Zod cohérente (400 uniforme sur 18/20 sites). Usage de `any` réellement très faible (4 occurrences réelles, toutes justifiées par un commentaire `eslint-disable` conforme). Quasi tous les try/catch présents.

---

## 3. Patterns Next.js 16 / React 19

*71 handlers de route, 15 pages, 90 composants audités.*

Point fort majeur : les **38 routes dynamiques** utilisant `params: Promise<{...}>` (breaking change Next 15+) sont **toutes** correctement implémentées avec `await`, sans exception — le changement le plus risqué d'une montée de version a été exécuté sans faute. Le dépôt est aussi propre de toute l'API legacy : aucun `next/head`, `next/router`, `getServerSideProps`/`getStaticProps`, `forwardRef`, aucune API Next dépréciée.

### HAUTE

**1. Import d'un module server-only dans des Client Components — fuite potentielle de credentials au bundle**
`vehicles/page.tsx:7`, `vehicles/[id]/page.tsx:8` importent `RenaultVehicleData` (une interface) depuis `@/lib/renault`, module qui lit `RENAULT_MAIL`/`RENAULT_PASS`/`GIGYA_API_KEY` et importe `@/lib/db`. L'import n'est pas `import type` — actuellement sans danger car SWC élague les imports de type uniquement, mais repose sur une heuristique de transpileur, pas une garantie. Un futur import de valeur (enum, const) depuis ce module ferait fuiter le client libSQL et le code lisant les credentials dans le bundle client. **Correctif d'un mot : `import type`.**

**2. Aucune error boundary dans toute l'App Router**
Zéro `error.tsx`, `global-error.tsx` dans `src/app/`. 77 composants clients affichent des données API sans garde. Une réponse malformée fait remonter jusqu'à la page d'erreur générique de Next (perte de toute la coquille applicative — navbar, bannières). Un `src/app/error.tsx` avec bouton de reset contiendrait les dégâts.

### MOYENNE

- **3.** `inventory/page.tsx:72-84` — l'effet qui charge les stocks liste `activeStockId` dans ses dépendances et le modifie dans son corps → un fetch redondant à chaque changement de stock (même bug que M-quality L3/M3).
- **4.** `CLAUDE.md` documente `src/middleware.ts`, absent — le fichier réel est `src/proxy.ts`.
- **5.** 26 des 29 effets de fetch n'ont aucun nettoyage (`AbortController`) — risque de race condition si l'utilisateur change rapidement de sélection (stock, rapport, statut).
- **6.** 3 désactivations `exhaustive-deps` sans le commentaire de justification requis par `.claude/rules/lint.md` (`IncidentHistoryModal.tsx:38`, `QRCodeModal.tsx:61`, `BannersTab.tsx:87`).
- **7.** `useSearchParams` sans `Suspense` (`NotificationBell.tsx`, `vehicles/[id]/page.tsx`) — inoffensif tant que tout est en rendu dynamique forcé par `auth()`, mais bloquant si PPR/`cacheComponents` est activé un jour.

### FAIBLE
- **8.** `qr/[token]/page.tsx:602-607` utilise `<img>` pour un asset statique local avec un `eslint-disable` qui ne s'applique pas (la dérogation est prévue pour les URLs proxy dynamiques, pas les assets statiques) — devrait utiliser `<Image>`.
- **9.** Timers de toast jamais nettoyés (4 fichiers) — deux toasts rapprochés se tronquent l'un l'autre (pas une fuite, juste un bug d'affichage).
- **10.** `vehicles/[id]/page.tsx:219-229` — effet incluant sa propre sortie (`renaultData`) dans ses dépendances.
- **11.** Un seul `metadata` global (dans `layout.tsx`) — conséquence directe du pattern Client Component accepté (M-4 différé), pas une anomalie.

---

## 4. Couverture de tests

*Comparaison exhaustive routes/lib/composants vs. suite de tests existante.*

⚠️ **`npm run test` ne passe actuellement PAS** : 435 tests passent, **5 échouent** (`PhotoPicker.test.tsx` ×4, `VehicleCalendar.test.tsx` ×1). Aucune régression produit détectée à l'inspection — la logique de limite de taille existe toujours dans `PhotoPicker.tsx`, les échecs pointent vers une interaction React 19/jsdom côté simulation d'input fichier plutôt qu'une perte de fonctionnalité, mais **à trianguler**. Aucune CI n'existe (`.github/workflows/` est vide) et le hook pre-commit ne lance qu'ESLint — rien n'exécute Vitest ou Playwright automatiquement, ce qui explique que ces échecs soient passés inaperçus.

### Tableau de synthèse

| Couche | Couvert | Total | % | Note |
|---|---|---|---|---|
| Routes API | 46 | 71 | 65% | "couvert" = au moins 1 test importe le handler |
| Modules lib | 6 | 21 | 29% | 4 des 15 non couverts sont triviaux |
| Composants avec état | 6 | 58 | 10% | couche la plus faible, de loin |
| Specs e2e utiles | ~2 | 6 fichiers | — | 2 des 5 specs ne testent qu'une redirection de login |

### Routes API sans aucun test (25) — sévérité par criticité métier

**Priorité haute :** `cron/daily-mileage-check` (aucun contrôle d'auth du tout, cf. sécurité finding #8), `incidents/[id]` (GET/PATCH/DELETE), `expenses/[id]/pdf` et `incidents/[id]/pdf` (IDOR non testé, cf. sécurité finding #5), `vehicles/[id]/checklist`, `checklist/[itemId]`, `trips/[id]/second-driver`, `vehicles/[id]/metrics`, `vehicles/[id]/trips` (DELETE destructif).

**Priorité moyenne :** `notifications`, `notifications/[id]`, `vehicles/[id]/qr-token` (cycle de vie du token non testé, cf. sécurité finding #2), `stats/csv`, `stats/pdf`, `stats/trips`, `inventory/batches` (aucun Zod), `trips/[id]/refresh-renault`, `drive/photos` + `[fileId]` (aucun test empêchant de servir un fichier Drive arbitraire, cf. sécurité finding #3).

### Tests existants mais incomplets vis-à-vis de la règle projet (401/403/400/happy path)

- `qr.test.ts` — 0 assertion 401/403/400, alors que QR est la seule surface non authentifiée de l'app.
- `ul-parking.test.ts`, `stats.test.ts`, `repro_bug.test.ts` — 0/0/0.
- `vehicles.test.ts` — bon 403/400, **zéro test 401**.
- `upload-validation.test.ts` — mocke `@/auth` en permanence authentifié, donc `drive/upload` et `expenses/upload` n'ont aucun chemin 401 testé.

### Modules lib non testés (15/21), par taille/risque
`DemoDB.ts` (475 lignes, le plus gros module non testé), `fetchInterceptor.ts` (231 lignes, monkey-patch de `fetch` global), `renault.ts` (163 lignes, API externe), `onesignal.ts` (140 lignes, échecs silencieux en prod), `inventory/stocks.ts` (exécute du DDL à l'exécution), `drive.ts` (`deleteDriveFolder` non testé), `email.ts`, `contexts/ULContext.tsx` (le scoping UL pilote la visibilité des données).

### Composants avec état non testés (52/58), par densité de hooks
`ReservationBlock.tsx` (32 hooks), `CheckInModal.tsx`/`CheckOutModal.tsx` (18/14), `UsersTab.tsx` (18), `BannersTab.tsx` (17), `ExpenseForm.tsx` (14), `MissionWizard.tsx` (11) — les 4 interactions utilisateur les plus fréquentes du produit (réservation, check-in, check-out, note de frais) n'ont aucun test RTL.

### Problèmes de fond identifiés

1. **`zod-schemas.test.ts` teste des copies, pas les vrais schémas** — le fichier redéfinit localement `checkOutSchema`/`checkInSchema` au lieu d'importer ceux de `trips/[id]/checkout/route.ts`. Si le vrai schéma change, ces 14 tests continuent de passer : fausse confiance sur l'exigence de validation 400.
2. **`e2e/verify_user_deletion.test.ts` n'est pas un vrai test** mais Playwright le collecte quand même (glob `**/*.test.ts`) — une IIFE qui lance son propre navigateur avec un `expect` fait main, en doublon (avec des sélecteurs différents) de `verify_user_deletion.spec.ts`.
3. **`e2e/checkout-checkin.spec.ts`**, malgré son nom, ne teste qu'une redirection de login — aucune couverture e2e réelle de réservation, check-in/checkout ou note de frais.
4. `setup.ts` recrée 30 `CREATE TABLE` à la main, maintenus séparément des migrations de prod — peut dériver silencieusement.

### Non trouvé (positif)
Aucun `.skip`, `.only`, `.todo`, `xit`, `xdescribe` — rien n'est désactivé silencieusement.

---

## 5. Incohérences documentaires (CLAUDE.md / .claude/rules) — signalées, non corrigées

Conformément au périmètre "audit only", ces incohérences sont listées mais **non corrigées** :

1. **`CLAUDE.md` référence `src/middleware.ts`** pour la protection des routes — ce fichier n'existe pas. Le fichier réel est `src/proxy.ts` (Next.js 16 a renommé `middleware` en `proxy`). Repéré indépendamment par l'audit qualité et l'audit Next.js/React — risque réel de mal orienter quiconque trace le flux d'auth.
2. **`CLAUDE.md` affirme que `npm run test` doit passer** — au moment de l'audit, la suite a 5 tests en échec (`PhotoPicker.test.tsx`, `VehicleCalendar.test.tsx`). La règle elle-même ("chaque nouvelle feature doit avoir des tests") n'est pas non plus respectée dans les faits : seulement 65% des routes API, 29% des modules lib et 10% des composants avec état ont des tests, malgré la formulation "must" dans `CLAUDE.md`.
3. **AGENTS.md racine** affirme "où les deux existent, `CLAUDE.md` fait autorité" — cohérent avec ce qui a été observé, aucune contradiction trouvée entre le contenu des `AGENTS.md` et `CLAUDE.md` sur les points vérifiés (stack, rôles, conventions).

---

## Annexe — ce qui a été explicitement vérifié comme sain

- Aucune injection SQL en dehors du finding Critique #1 (les constructeurs de colonnes dynamiques sont contraints par Zod).
- Aucun secret en dur, `.env*` correctement ignoré par git.
- Aucun usage de `eval`, `dangerouslySetInnerHTML`, `child_process`.
- Usage de `any` minimal (4 occurrences réelles) et systématiquement justifié.
- `npm run lint` : 0 erreur, 0 warning.
- Les 38 routes dynamiques Next.js 16 gèrent correctement `params` comme une Promise.
- Le pattern Client Component + `useEffect` (M-4 différé) est un choix assumé, non un oubli — non recommandé de le "corriger".

# Revue de code complète — martine (CRF Fleet Management)

**Date :** 2026-08-11
**Périmètre :** Audit exhaustif, lecture seule (aucune modification de code applicatif ni de `CLAUDE.md`/`.claude/rules/*.md`)
**Méthode :** 4 audits spécialisés en parallèle (sécurité, qualité/architecture, patterns Next.js 16/React 19, couverture de tests), sur l'intégralité du dépôt
**Chiffres réels du dépôt à l'audit** *(corrigent l'estimation initiale de reconnaissance)* : 73 routes API, 90 composants (58 avec état), 21 modules `src/lib`, 48 fichiers de test, ~49 000 lignes TS/TSX
**Statut lint à l'audit :** `npm run lint` — 0 erreur, 0 warning (vérifié)
**Statut tests à l'audit :** `npm run test` — **435 passent, 5 échouent** ⚠️ (voir section Tests — contredit l'hypothèse initiale que la suite passait entièrement)

---

## 📋 Mise à jour — 13 août 2026 : état de la remédiation

Le contenu original de l'audit ci-dessous est **conservé intégralement** (findings, scénarios de risque, méthodologie) pour sa valeur de trace historique. Chaque finding numéroté est annoté d'un marqueur de statut (✅ corrigé, ⚠️ partiellement corrigé, ➖ non corrigé — décision assumée) avec la version/le commit qui l'a traité.

**18 commits** sur la branche `feat/audit` ont traité la quasi-totalité des findings, en 3 vagues :

| Vague | Versions | Portée |
|---|---|---|
| Sécurité | v4.8.2 → v4.8.4 | Chapitre 1 |
| Qualité & Architecture + Next.js 16/React 19 | v4.8.5 → v4.8.9 | Chapitres 2 et 3 |
| Couverture de tests | v4.9.0 → v4.9.9 | Chapitres 4 et 5 |

**Mise à jour du 13 août 2026 (soir) : H1 est désormais corrigé lui aussi** (v4.10.0, commit `eb4636e`) — c'était le dernier finding de tout l'audit encore en état de "report". **Le chantier de remédiation est maintenant intégralement clos** : chaque finding est soit corrigé, soit explicitement laissé tel quel par une décision assumée et documentée (plus aucun report en attente).

**État actuel vérifié (2026-08-13) :**
- `npm run lint` — 0 erreur, 0 warning (inchangé, déjà propre à l'audit).
- `npm run test` — **1000 tests, 0 échec** (135 fichiers, contre 46 fichiers/16 échecs — l'audit avait mesuré 435/5 échecs, un décompte différent effectué avant les corrections de sécurité Haute de cette session qui avaient introduit 11 régressions de fixtures, corrigées en v4.9.0 ; le total est repassé de 1008 à 1000 lors du correctif H1, qui a consolidé plusieurs tests en un seul par route désormais synchrone).
- `npx tsc --noEmit` — 105 erreurs préexistantes dans `authCallbacks.test.ts`, antérieures à ce chantier et non liées à l'audit (dette technique hors périmètre, vérifiées identiques avant/après chaque lot de travail, y compris le correctif H1).
- `npm run build` — vérifié localement sans secrets réels (simule l'environnement CI), succès.
- Couverture de tests recomptée sur le code actuel : **70/71 routes API (99%)**, **23/25 modules lib (92%)**, **60/60 composants avec état (100%)**. Détail en fin de chapitre 4.
- **4 bugs de production réels** ont été découverts et corrigés en écrivant les tests du chapitre 4 (non recherchés a priori) — détaillés en fin de chapitre 4.
- Une CI (`.github/workflows/ci.yml`) exécute désormais lint/test/build sur chaque PR et chaque push sur `main`. **Non encore appliquée en "required check"** : la protection de branche sur `main` doit être activée manuellement (réglage GitHub, hors périmètre d'un fichier de code) pour qu'une PR ne puisse pas être mergée si la CI est rouge.

**Dette technique restante, volontairement non traitée :** au-delà des findings sécurité #8/#9/#12 (partiels, différés par choix explicite), 3 points identifiés par l'audit qualité restent ouverts et méritent d'être gardés à l'esprit pour un futur chantier séparé — aucun n'est un bug, ce sont des choix de périmètre assumés :
1. **M5 — 1418 occurrences de `style={{...}}`** contredisant la convention CSS Modules documentée dans `CLAUDE.md` (1415 à l'audit ; la légère hausse vient du nouveau code écrit pendant ce chantier). Jamais engagé, refonte trop large pour ce périmètre de remédiation.
2. **M4 — 115 couleurs hex codées en dur** cassant potentiellement le dark mode ailleurs dans l'app (103 à l'audit). Seul le bug concret démontré par l'audit (badge Diesel illisible) a été corrigé ; le reste n'a pas été audité individuellement.
3. **Couverture e2e quasi nulle** — `checkout-checkin.spec.ts` ne teste qu'une redirection de login ; aucun vrai parcours réservation/check-in/checkout/note de frais n'est couvert par Playwright, contrairement aux 1000 tests Vitest/RTL désormais verts (chapitre 4). Un vrai test e2e nécessite un serveur de dev démarré, jugé hors périmètre d'un chantier de tests unitaires/intégration/composants.

---

## Résumé exécutif

Le code est globalement discipliné : SQL paramétré presque partout, validation Zod largement présente, rôles centralisés dans `src/lib/roles.ts`, `any` rare et justifié, `npm run lint` propre. Mais l'audit sécurité a mis au jour **3 vulnérabilités critiques** exploitables par n'importe quel utilisateur authentifié, et l'audit qualité confirme un défaut structurel récurrent : l'absence de quelques abstractions partagées (auth/authz, fetch avec annulation, store de jobs d'export) là où le code se répète le plus. Le point commun à la majorité des failles sécurité (Critique #2, #3, Haute #5, #6, #7) est le même : **l'appartenance à une Unité Locale (UL) n'est vérifiée que sur certaines routes, pas sur les routes comparables** — un seul chantier de correction (copier le pattern déjà correct de `banners/[id]`, `users/[email]`, `missions/[id]`) couvrirait la plupart d'entre elles.

**Priorité recommandée avant tout déploiement** (à título indicatif — cet audit ne modifie rien, cf. portée demandée) :
1. Sécurité Critique #1, #2, #3 — risque de fuite de données inter-UL et de prise de contrôle de véhicules à distance
2. Sécurité Haute #4 (`isInactive([])` renvoie `false`) — inverse la politique deny-by-default pour tout compte nouvellement provisionné
3. Les 5 tests actuellement rouges (non détectés faute de CI)

> **✅ Mise à jour :** les 3 points ci-dessus sont traités — #1 et #3 corrigés (v4.8.2), #2 confirmé comme comportement voulu (non corrigé intentionnellement), #4 corrigé (v4.8.3), et la suite de tests est passée de 5 échecs à 1000 tests verts (v4.9.0 et suivants). Voir annotations détaillées ci-dessous.

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

> **✅ CORRIGÉ — v4.8.2 (`ae44f92`)** — La valeur `vehicleId` est désormais paramétrée dans les 3 requêtes concernées (réservations, trajets, maintenance), à l'image du pattern déjà correct pour les véhicules.

**2. Élévation de privilèges : token QR lisible pour n'importe quel véhicule → prise de contrôle inter-UL**
`src/app/api/vehicles/[id]/qr-token/route.ts:40-69`
`GET`/`POST` exigent seulement `session?.user` — aucun contrôle de rôle, ni d'appartenance à l'UL, ni de statut `isInactive`. Le `GET` crée même le token s'il n'existe pas.
**Scénario :** un utilisateur (même sans rôle, cf. finding #4) énumère des UUID de véhicules (via `/api/vehicles/calendar` ou l'injection SQL ci-dessus), récupère le token QR d'un véhicule d'une autre UL, puis appelle `POST /api/qr/<token>/checkout` — ce endpoint saute délibérément les contrôles UL/rôle car conçu pour un token physiquement détenu. Résultat : checkout d'un véhicule d'une autre UL, mutation de `Vehicle.status`/kilométrage/carburant, création d'un `Trip`. Le `DELETE` du même fichier est bien protégé admin — confirmant que le `GET` aurait dû l'être aussi.

> **➖ NON CORRIGÉ — comportement volontaire (confirmé v4.8.2, `ae44f92`)** — En traitant les findings #1 et #3, ce comportement a été explicitement examiné et confirmé voulu par conception (accès QR conçu pour un token physiquement détenu, indépendant de l'UL) : laissé tel quel intentionnellement.

**3. Lecture/écriture arbitraire sur Google Drive via des IDs de dossier/fichier fournis par le client**
Une seule identité OAuth (`src/lib/drive.ts:12-21`) avec accès à tout le drive partagé ; aucune route ne restreint les IDs aux ressources de l'appelant.
- `src/app/api/drive/photos/[fileId]/route.ts:48-57` — auth seule, puis `drive.files.get({fileId})` sur n'importe quel ID.
- `src/app/api/drive/photos/route.ts:42,55,70` — `folderId` interpolé dans la requête Drive `q` (injection de requête Drive possible via `'`).
- `src/app/api/drive/upload/route.ts:61,120,146` et `src/app/api/expenses/upload/route.ts:45,113,140` — `rootFolderId`/`existingFolderId`/`folderId` venant du formData, utilisés sans vérification.
**Scénario :** un CHVL authentifié lit les justificatifs de frais ou photos d'incident d'une autre UL en itérant sur `fileId`, ou écrit des fichiers dans un dossier Drive arbitraire de l'organisation.

> **✅ CORRIGÉ — v4.8.2 (`ae44f92`)** — Nouveau module `src/lib/driveAuth.ts` (`canAccessDriveFolder`/`resolveDriveFolderOwner`) : vérifie l'appartenance (UL ou propriétaire) d'un `driveFolderId`/`fileId` avant tout accès. Testé en intégration (`driveAuth.test.ts`, chapitre 4).

### HAUTE

**4. Les comptes sans aucun rôle contournent le contrôle "compte inactif"**
`src/lib/roles.ts:95-97` — `isInactive([])` renvoie **`false`** (vérifié à l'exécution) car `roles.length > 0 && ...`. `src/auth.ts:148-167` auto-crée un `User` pour tout compte Google `@croix-rouge.fr` dès la première connexion, avec `roles = []`. L'idiome défensif `session.user.roles || ['INACTIF']` ne protège pas, car `[]` est *truthy*.
**Scénario :** n'importe quelle boîte `@croix-rouge.fr` se connecte une fois, est auto-provisionnée sans rôle, et passe pour "active" partout — checkout de véhicules, lecture des stats flotte complètes (noms/emails des conducteurs), création d'issues GitHub publiques via `/api/bugs/report`. La politique voulue (deny-by-default) s'inverse en allow-by-default.

> **✅ CORRIGÉ — v4.8.3 (`fe99ba3`)**

**5. IDOR sur les exports PDF — aucun contrôle de propriété**
`src/app/api/expenses/[id]/pdf/route.ts:91-96` et `src/app/api/incidents/[id]/pdf/route.ts:123-128` — auth seule, contrairement à leurs équivalents JSON qui vérifient bien propriétaire/rôle (`src/app/api/expenses/[id]/route.ts:57-62`).
**Scénario :** un CHVL qui reçoit un 403 sur `GET /api/expenses/<id>` obtient le PDF complet (montants, identité, justificatifs) via `GET /api/expenses/<id>/pdf`.

> **✅ CORRIGÉ — v4.8.3 (`fe99ba3`)** — Testé en intégration (`expenses-pdf.test.ts`, `incidents.test.ts`, chapitre 4).

**6. Exposition de données inter-UL sur les routes de détail véhicule**
Aucun filtre `session.user.ulId` sur : `vehicles/[id]/route.ts` (véhicule + 20 derniers trajets, noms ET emails), `vehicles/[id]/desinfections/route.ts`, `incidents/[id]/route.ts` (victimes, dommages), `renault/[vin]/route.ts` (télémétrie live pour tout VIN), `users/route.ts` (annuaire complet toutes UL confondues malgré le gate `canAccessAdminPanel`).
**Scénario :** les routes véhicule clés sur `name` (`WHERE name = ?`), un identifiant court et devinable ("VL1", "VPSP2") — un utilisateur d'une UL peut moissonner des PII de conducteurs d'autres UL.

> **✅ CORRIGÉ — v4.8.3 (`fe99ba3`)** — Filtre UL ajouté sur les routes citées (404 renvoyé pour préserver le fonctionnement de l'accès QR, cf. finding #2). Testé en intégration (`renault-vin.test.ts`, `incidents.test.ts`, chapitre 4).

**7. Actions destructrices inter-UL accessibles à tout admin local**
`isAdminOrAbove()` est vérifié mais l'appartenance UL de la ressource ciblée ne l'est jamais : `vehicles/[id]/trips/route.ts` (supprime tous les trajets **et** les dossiers Drive associés), `vehicles/[id]/route.ts` (PATCH/DELETE), `vehicles/[id]/maintenance*`, `checklist/[itemId]/route.ts`. À contraster avec `users/[email]/route.ts` et `banners/[id]/route.ts`, qui comparent bien `session.user.ulId`.
**Scénario :** un ADMIN d'une petite UL supprime irréversiblement l'historique de trajets (+ preuves photo Drive) d'une autre UL, sans 403 ni trace.

> **✅ CORRIGÉ — v4.8.3 (`fe99ba3`)** — Testé en intégration (`vehicles-trips.test.ts`, chapitre 4 — vérifie explicitement le 403 inter-UL).

### MOYENNE

**8. Endpoint cron fail-open si `CRON_SECRET` n'est pas défini** — `cron/daily-mileage-check/route.ts:9` : le contrôle est sauté si la variable est absente, alors que le handler exécute ensuite des `DELETE` non conditionnés.

> **➖ NON CORRIGÉ — décision assumée** — Comportement volontairement laissé tel quel (décision explicite de l'utilisateur en cours de chantier). Le comportement fail-open est désormais documenté et testé explicitement (`cron-daily-mileage-check.test.ts`, v4.9.2), pour qu'une éventuelle régression future reste visible sans que le comportement lui-même ait été modifié.

**9. Admin local peut modifier les rôles globaux d'un utilisateur sans UL "home"** — `users/[email]/route.ts:49-53`, le garde-fou inter-UL ne s'applique que si `userHomeUlId` est renseigné.

> **➖ NON CORRIGÉ — décision assumée** — Même décision que le finding #8 (confirmé explicitement "volontairement non traité" dans le commit `3c7a9e9`).

**10. Valeurs de session/DB interpolées dans du SQL au lieu d'être paramétrées** (non exploitable aujourd'hui, mais fragile) — `vehicles/route.ts:70-97` (un `db.execute(sql)` sans objet `args` du tout), `vehicles/calendar/route.ts:67-68`, `onesignal.ts:42`.

> **✅ CORRIGÉ — v4.8.4 (`3c7a9e9`)**

**11. Statistiques flotte complètes accessibles à tout utilisateur non-inactif** — `stats/route.ts:22-25` (gate `isInactive` seul) vs `stats/trips/route.ts:26-28` (gate `canAccessAdminPanel`, plus strict) : incohérence, la version stricte semble être l'intention.

> **✅ CORRIGÉ — v4.8.4 (`3c7a9e9`)**

**12. Validation Zod manquante sur plusieurs routes de mutation** — `users/[email]/route.ts`, `ul/[id]`, `trips/[id]`, `notifications/[id]`, `vehicles/[id]/qr-token`, `inventory/{adjust,stocks,batches}`, `missions/[id]`, `users/[email]/validate-papers`, `trips/[id]/refresh-renault`, `vehicles/[id]/trips`, `vehicles/[id]/maintenance/[recordId]`.

> **⚠️ PARTIELLEMENT CORRIGÉ — v4.8.4 (`3c7a9e9`)** — `users/[email]`, `ul/[id]`, `inventory/adjust`, `inventory/stocks`, `inventory/batches` ont désormais un schéma Zod. Les autres routes listées (`trips/[id]`, `notifications/[id]`, `vehicles/[id]/qr-token`, `missions/[id]`, `users/[email]/validate-papers`, `trips/[id]/refresh-renault`, `vehicles/[id]/trips`, `vehicles/[id]/maintenance/[recordId]`) n'ont toujours pas de schéma Zod dédié (vérifié sur le code actuel) — à réévaluer au cas par cas, certaines de ces routes n'ayant pas nécessairement de corps de requête substantiel à valider.

### FAIBLE

**13.** Lecture non authentifiée du changelog (`changelog/route.ts`) — reconnaissance uniquement, pas de traversal.

> **✅ CORRIGÉ — v4.8.4 (`3c7a9e9`)** — La route exige désormais une authentification.

**14.** Erreurs Drive verbeuses journalisées côté serveur (`drive/upload`, `expenses/upload`, `drive/photos`) — réponses client correctement génériques.

> **✅ CORRIGÉ — v4.8.4 (`3c7a9e9`)**

**15.** `PUT` aliasé sur `PATCH` piloté par la forme du body (`reservations/[id]/route.ts`, `vehicles/[id]/qr-token/route.ts`) — pas de contournement aujourd'hui mais fragile pour l'avenir.

> **✅ CORRIGÉ — v4.8.4 (`3c7a9e9`)** — Le branchement `PATCH` de `reservations/[id]` est désormais validé strictement par Zod au lieu d'un routage silencieux basé sur la forme du body.

### Vérifié sain
Aucun `eval`, `new Function`, `child_process`, ou `dangerouslySetInnerHTML`. Aucun secret en dur (hors token de test factice dans les tests). `.env*` ignoré par git, aucune fuite vers `NEXT_PUBLIC_*`. `src/proxy.ts` (middleware renommé en Next 16) exclut correctement `/api` — cohérent avec le `auth()` par route. Notifications, suppression de réservation et historique d'inventaire vérifient correctement la propriété de la ressource.

---

## 2. Qualité & Architecture

*254 fichiers TS/TSX audités, ~49k lignes.*

### HAUTE

**H1 — Store de jobs en mémoire (`global`) incompatible avec le serverless Vercel**
`stats/pdf/route.ts`, `stats/csv/route.ts`, `stats/expenses/pdf/route.ts`, `stats/expenses/csv/route.ts` stockent les buffers générés dans une `Map` globale, puis le client poll un `jobId`. Sur Vercel, le `POST` et le `GET` de poll peuvent atterrir sur des instances lambda différentes → 404 intermittent en production, invisible en local. Nécessite un stockage externe (ligne Turso, blob store) ou une réponse streamée synchrone.

> **✅ CORRIGÉ — v4.10.0 (`eb4636e`)** — Différé un temps (décision assumée en cours de chantier), puis traité : la génération du fichier étant déjà 100% synchrone côté serveur, le `jobId`/`Map` globale ne servait à rien — le `POST` renvoie désormais directement le fichier, le `GET` de polling et le store en mémoire ont été supprimés. Plus aucune requête ne peut atterrir sur la mauvaise instance lambda puisqu'il n'y a plus qu'une seule requête. Client mis à jour pour consommer un `Blob` (`URL.createObjectURL`) et déclencher le téléchargement via un `<a download>`. **Dernier finding de tout l'audit à être passé de "report" à "corrigé" — plus aucun report en attente.**

**H2 — Aucun helper d'auth/autorisation partagé : 89 blocs auth faits main sur 68 routes**
6 corps de réponse 401 différents, 22 corps 403 différents (`'Non autorisé'` sert aux deux, empêchant le client de distinguer les deux cas). C'est le mécanisme par lequel une future route peut silencieusement partir sans contrôle de rôle — cf. plusieurs findings sécurité ci-dessus.

> **✅ CORRIGÉ — v4.8.5 (`a7b6417`)** — Nouveau `src/lib/apiAuth.ts` (`unauthorizedResponse`/`forbiddenResponse`), migré sur 64 routes (vérifié sur le code actuel), unifiant les corps 401/403 en 2 formats canoniques.

**H3 — Aucune annulation de requête ni garde de démontage sur 56 composants**
`AbortController` : 0 occurrence dans tout le dépôt. Un seul composant (`CommunicationBanner.tsx`) utilise un garde `isMounted`. Race condition réelle dans `inventory/page.tsx` : changer rapidement de stock peut afficher les catégories du stock précédent si sa réponse arrive après.

> **✅ CORRIGÉ — v4.8.6 (`1ec16c7`)** — `AbortController` introduit sur les effets de récupération de données pouvant se déclencher plusieurs fois pendant la vie d'un composant : `inventory` (corrige aussi le bug concret cité et la dépendance d'effet trop large du finding M3/L3 ci-dessous), `vehicles/[id]`, `expenses`, `qr/[token]`, `stats`.

### MOYENNE

- **M1** — Composants "Dieu" avec état local non géré : `vehicles/[id]/page.tsx` (1088 lignes, 35 `useState`), `expenses/page.tsx` (1273 lignes, 17+ `useState`), `qr/[token]/page.tsx` (879 lignes, 21 `useState`), `UsersTab.tsx` (866 lignes, 14 `useState`).

  > **✅ CORRIGÉ — v4.8.7 (`f0afbdf`)** — Les 4 composants décomposés en hooks de data-fetching dédiés + sous-composants par section UI : `UsersTab.tsx` (866→204 lignes, sous-composants `UsersTable`, `admin/modals/AddUserModal`, `admin/modals/ManageUserULsModal`), `qr/[token]/page.tsx` (879→259), `vehicles/[id]/page.tsx` (1088→494), `expenses/page.tsx` (1273→370). Un bug préexistant découvert au passage (`EditRevisionIntervalsModal.tsx` appelait l'API avec l'UUID du véhicule au lieu de son nom) a été corrigé.

- **M2** — ~36 appels `fetch` sur 141 ne vérifient jamais `res.ok` → une erreur 500/403 devient silencieusement une liste vide sans affordance d'erreur.

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Les listes UL/utilisateurs/historique journalisent désormais l'erreur au lieu d'un fallback silencieux.

- **M3** — Lookups de rôle N+1 dans des transactions d'écriture (`users/route.ts`, `users/[email]/route.ts`, `users/[email]/ul/route.ts`) — un `Map` en cache ou un `WHERE name IN (...)` unique suffirait.

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Lookups batchés sur `users/[email]` et `users/[email]/ul`.

- **M4** — 103 couleurs codées en dur dans des styles inline cassent le système de thème sombre/clair ; bug concret : badge Diesel illisible en dark mode (`VehicleBadges.tsx:112`).

  > **⚠️ PARTIELLEMENT CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Le bug concret cité (badge Diesel) est corrigé. La refonte systématique n'a pas été engagée : 115 couleurs hex codées en dur subsistent dans des `style={{}}` (recompté sur le code actuel — légère hausse par rapport aux 103 de l'audit, due au nouveau code écrit pendant ce chantier).

- **M5** — 1415 occurrences de `style={{...}}` sur 85 fichiers, contredisant la convention CSS Modules affichée dans `CLAUDE.md`.

  > **➖ NON TRAITÉ** — Refonte hors périmètre du chantier de remédiation, jamais engagée. 1418 occurrences recomptées sur le code actuel (légère hausse, nouveau code de ce chantier).

- **M6** — 3 composants récupèrent la session via `fetch('/api/auth/session')` au lieu de `useSession` — copie locale qui ne se met jamais à jour après un changement de rôle en session.

  > **⚠️ PARTIELLEMENT CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Les pages `qr` et `vehicles` migrées vers `useSession()`. `CheckOutModal.tsx` conserve `fetch('/api/auth/session')` intentionnellement (choix documenté en commit pour le pattern des modals) — vérifié toujours présent sur le code actuel.

- **M7** — Les "singletons" de `src/lib` (`drive.ts`, `email.ts`) sont en réalité reconstruits à chaque appel, perdant le cache de token OAuth.

  > **⚠️ PARTIELLEMENT CORRIGÉ — v4.8.8 (`bbdc6c1`)** — `drive.ts` met désormais son client en cache au niveau module. `email.ts` recrée toujours un transporter Nodemailer à chaque appel (vérifié, non corrigé).

- **M8** — 28 composants modaux sans primitive partagée ; `Escape` n'apparaît nulle part dans `src/components` — aucun modal ne se ferme au clavier.

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Hook `useEscapeKey()` appliqué aux 32 modals du dépôt.

### FAIBLE
- L1 — `CLAUDE.md` référence `src/middleware.ts`, inexistant ; le fichier réel est `src/proxy.ts` (renommé en Next.js 16). *(voir aussi section 4)*

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)**

- L2 — Erreurs silencieusement avalées (`.catch(() => {})`) dans `aide/page.tsx`, `inventory/page.tsx`, `UsersTab.tsx`, `imageCompression.ts`.

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** — `aide/page.tsx`, `UsersTab.tsx` et `inventory/page.tsx` journalisent désormais l'erreur (`console.error`) au lieu de l'avaler. `imageCompression.ts` conserve des `catch` sans log, mais ce sont des fallbacks défensifs volontaires (retry réseau mobile, dégradation gracieuse vers le fichier non compressé), pas des bugs masqués — non modifiés intentionnellement.

- L3 — Effet avec dépendance trop large provoquant un refetch redondant (`inventory/page.tsx:73-85`).

  > **✅ CORRIGÉ — v4.8.6 (`1ec16c7`)**, au passage de la correction H3.

- L4 — 9 `console.log` restants en code non-test, dont un qui journalise le corps des requêtes en mode démo (`fetchInterceptor.ts:20`).

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)**

- L5 — `src/lib/stats.ts` (614 lignes) mélange deux domaines (trajets + notes de frais) — un split suivrait les conventions existantes.

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Scindé en `src/lib/stats-trips.ts` / `src/lib/stats-expenses.ts`.

### Vérifié sain
Aucune injection SQL (les colonnes dynamiques sont contraintes par des schémas Zod stricts). Gestion Zod cohérente (400 uniforme sur 18/20 sites). Usage de `any` réellement très faible (4 occurrences réelles, toutes justifiées par un commentaire `eslint-disable` conforme). Quasi tous les try/catch présents.

---

## 3. Patterns Next.js 16 / React 19

*71 handlers de route, 15 pages, 90 composants audités.*

Point fort majeur : les **38 routes dynamiques** utilisant `params: Promise<{...}>` (breaking change Next 15+) sont **toutes** correctement implémentées avec `await`, sans exception — le changement le plus risqué d'une montée de version a été exécuté sans faute. Le dépôt est aussi propre de toute l'API legacy : aucun `next/head`, `next/router`, `getServerSideProps`/`getStaticProps`, `forwardRef`, aucune API Next dépréciée.

### HAUTE

**1. Import d'un module server-only dans des Client Components — fuite potentielle de credentials au bundle**
`vehicles/page.tsx:7`, `vehicles/[id]/page.tsx:8` importent `RenaultVehicleData` (une interface) depuis `@/lib/renault`, module qui lit `RENAULT_MAIL`/`RENAULT_PASS`/`GIGYA_API_KEY` et importe `@/lib/db`. L'import n'est pas `import type` — actuellement sans danger car SWC élague les imports de type uniquement, mais repose sur une heuristique de transpileur, pas une garantie. Un futur import de valeur (enum, const) depuis ce module ferait fuiter le client libSQL et le code lisant les credentials dans le bundle client. **Correctif d'un mot : `import type`.**

> **✅ CORRIGÉ — v4.8.9 (`15de4fe`)** — `import type` appliqué sur les 4 sites concernés.

**2. Aucune error boundary dans toute l'App Router**
Zéro `error.tsx`, `global-error.tsx` dans `src/app/`. 77 composants clients affichent des données API sans garde. Une réponse malformée fait remonter jusqu'à la page d'erreur générique de Next (perte de toute la coquille applicative — navbar, bannières). Un `src/app/error.tsx` avec bouton de reset contiendrait les dégâts.

> **✅ CORRIGÉ — v4.8.9 (`15de4fe`)** — `src/app/error.tsx` créé avec bouton "Réessayer".

### MOYENNE

- **3.** `inventory/page.tsx:72-84` — l'effet qui charge les stocks liste `activeStockId` dans ses dépendances et le modifie dans son corps → un fetch redondant à chaque changement de stock (même bug que M-quality L3/M3).

  > **✅ CORRIGÉ — v4.8.6 (`1ec16c7`)**, au passage de la correction qualité H3 (même correctif que L3).

- **4.** `CLAUDE.md` documente `src/middleware.ts`, absent — le fichier réel est `src/proxy.ts`.

  > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** (doublon du finding qualité L1).

- **5.** 26 des 29 effets de fetch n'ont aucun nettoyage (`AbortController`) — risque de race condition si l'utilisateur change rapidement de sélection (stock, rapport, statut).

  > **✅ CORRIGÉ — v4.8.6 (`1ec16c7`)**, au passage de la correction qualité H3 (`inventory`, `vehicles/[id]`, `expenses`, `qr/[token]`, `stats` — couvre l'essentiel des zones citées).

- **6.** 3 désactivations `exhaustive-deps` sans le commentaire de justification requis par `.claude/rules/lint.md` (`IncidentHistoryModal.tsx:38`, `QRCodeModal.tsx:61`, `BannersTab.tsx:87`).

  > **✅ CORRIGÉ — v4.8.9 (`15de4fe`)**

- **7.** `useSearchParams` sans `Suspense` (`NotificationBell.tsx`, `vehicles/[id]/page.tsx`) — inoffensif tant que tout est en rendu dynamique forcé par `auth()`, mais bloquant si PPR/`cacheComponents` est activé un jour.

  > **✅ CORRIGÉ — v4.8.9 (`15de4fe`)**

### FAIBLE
- **8.** `qr/[token]/page.tsx:602-607` utilise `<img>` pour un asset statique local avec un `eslint-disable` qui ne s'applique pas (la dérogation est prévue pour les URLs proxy dynamiques, pas les assets statiques) — devrait utiliser `<Image>`.

  > **✅ CORRIGÉ — v4.8.9 (`15de4fe`)**

- **9.** Timers de toast jamais nettoyés (4 fichiers) — deux toasts rapprochés se tronquent l'un l'autre (pas une fuite, juste un bug d'affichage).

  > **✅ CORRIGÉ — v4.8.9 (`15de4fe`)**

- **10.** `vehicles/[id]/page.tsx:219-229` — effet incluant sa propre sortie (`renaultData`) dans ses dépendances.

  > **✅ CORRIGÉ — v4.8.9 (`15de4fe`)** — `useVehicleDetail.ts` suit désormais le VIN via une `ref` plutôt que de dépendre de sa propre sortie.

- **11.** Un seul `metadata` global (dans `layout.tsx`) — conséquence directe du pattern Client Component accepté (M-4 différé), pas une anomalie.

  > Non un bug — l'audit le confirmait déjà lui-même. Rien à changer.

---

## 4. Couverture de tests

*Comparaison exhaustive routes/lib/composants vs. suite de tests existante — état à l'audit (2026-08-11).*

⚠️ **`npm run test` ne passait alors PAS** : 435 tests passaient, **5 échouaient** (`PhotoPicker.test.tsx` ×4, `VehicleCalendar.test.tsx` ×1). Aucune régression produit détectée à l'inspection — la logique de limite de taille existait toujours dans `PhotoPicker.tsx`, les échecs pointaient vers une interaction React 19/jsdom côté simulation d'input fichier plutôt qu'une perte de fonctionnalité. Aucune CI n'existe (`.github/workflows/` est vide) et le hook pre-commit ne lance qu'ESLint — rien n'exécute Vitest ou Playwright automatiquement, ce qui explique que ces échecs soient passés inaperçus.

> **✅ Mise à jour — chantier complet, v4.9.0 à v4.9.9** : `npm run test` est passé de 5 échecs à **1008 tests, 0 échec** (135 fichiers). Le chantier s'est déroulé en 5 phases (TQ-1 à TQ-5), chacune commitée séparément :
> - **TQ-1 (v4.9.0)** — remise à zéro (16 échecs réels au moment de reprendre ce chapitre, dont 11 régressions de fixtures introduites par les correctifs sécurité Haute de ce même chantier, et les 5 échecs déjà connus de l'audit).
> - **TQ-2 (v4.9.1)** — complétion de la règle 401/403/400/happy path sur les tests existants incomplets.
> - **TQ-3 (v4.9.2–v4.9.3)** — tests d'intégration pour les 24 routes API sans aucun test.
> - **TQ-4 (v4.9.4)** — tests unitaires/intégration pour les 15 modules `src/lib` non couverts.
> - **TQ-5 (v4.9.5–v4.9.9)** — tests RTL pour les 45 composants à état non couverts (7 priorité 1 nommés par l'audit + 38 priorité 2).

### Tableau de synthèse

| Couche | Couvert à l'audit | Total à l'audit | % à l'audit | Couvert actuel | Total actuel | % actuel |
|---|---|---|---|---|---|---|
| Routes API | 46 | 71 | 65% | **70** | 71 | **99%** *(seule `auth/[...nextauth]` non testée — 3 lignes de ré-export NextAuth, hors périmètre assumé)* |
| Modules lib | 6 | 21 | 29% | **23** | 25 | **92%** *(seuls `env.ts` et `hooks/useEscapeKey.ts` sans fichier dédié — triviaux/exercés indirectement, hors périmètre assumé)* |
| Composants avec état | 6 | 58 | 10% | **60** | 60 | **100%** |
| Specs e2e utiles | ~2 | 6 fichiers | — | ~2 | 5 fichiers | — *(non traité, cf. ci-dessous)* |

### Routes API sans aucun test (25) — sévérité par criticité métier — ✅ RÉSOLU (TQ-3, v4.9.2–v4.9.3)

**Priorité haute :** `cron/daily-mileage-check` (aucun contrôle d'auth du tout, cf. sécurité finding #8), `incidents/[id]` (GET/PATCH/DELETE), `expenses/[id]/pdf` et `incidents/[id]/pdf` (IDOR non testé, cf. sécurité finding #5), `vehicles/[id]/checklist`, `checklist/[itemId]`, `trips/[id]/second-driver`, `vehicles/[id]/metrics`, `vehicles/[id]/trips` (DELETE destructif).

**Priorité moyenne :** `notifications`, `notifications/[id]`, `vehicles/[id]/qr-token` (cycle de vie du token non testé, cf. sécurité finding #2), `stats/csv`, `stats/pdf`, `stats/trips`, `inventory/batches` (aucun Zod), `trips/[id]/refresh-renault`, `drive/photos` + `[fileId]` (aucun test empêchant de servir un fichier Drive arbitraire, cf. sécurité finding #3).

> Les 24 routes dans le périmètre (`auth/[...nextauth]` exclu, pur boilerplate) ont désormais chacune au moins un test 401/403/400/happy path. Le test du cron documente explicitement le comportement fail-open (finding #8, non corrigé par choix assumé) plutôt que de le corriger.

### Tests existants mais incomplets vis-à-vis de la règle projet (401/403/400/happy path) — ✅ RÉSOLU (TQ-2, v4.9.1)

- `qr.test.ts` — 0 assertion 401/403/400, alors que QR est la seule surface non authentifiée de l'app.
- `ul-parking.test.ts`, `stats.test.ts`, `repro_bug.test.ts` — 0/0/0.
- `vehicles.test.ts` — bon 403/400, **zéro test 401**.
- `upload-validation.test.ts` — mocke `@/auth` en permanence authentifié, donc `drive/upload` et `expenses/upload` n'ont aucun chemin 401 testé.

> Tous complétés. Au passage, un vrai bug de production a été trouvé et corrigé : `vehicles.test.ts` confondait 401 et 403 côté route (`POST`/`PATCH`/`DELETE /api/vehicles` ne distinguaient jamais "pas de session" de "mauvais rôle").

### Modules lib non testés (15/21), par taille/risque — ✅ RÉSOLU (TQ-4, v4.9.4)
`DemoDB.ts` (475 lignes, le plus gros module non testé), `fetchInterceptor.ts` (231 lignes, monkey-patch de `fetch` global), `renault.ts` (163 lignes, API externe), `onesignal.ts` (140 lignes, échecs silencieux en prod), `inventory/stocks.ts` (exécute du DDL à l'exécution), `drive.ts` (`deleteDriveFolder` non testé), `email.ts`, `contexts/ULContext.tsx` (le scoping UL pilote la visibilité des données).

> Les 15 modules listés par l'audit sont désormais testés (certains regroupés avec 2 modules nouveaux créés pendant ce chantier, `apiAuth.ts` et `driveAuth.ts`, également couverts). `stats-expenses.ts` (issu du split L5) est exercé indirectement via les tests d'intégration des routes `stats/expenses/*`, comme `stats-trips.ts` l'était déjà. `env.ts` et `hooks/useEscapeKey.ts` restent sans fichier dédié (triviaux/exercés indirectement — exclusion assumée, cf. tableau de synthèse).

### Composants avec état non testés (52/58), par densité de hooks — ✅ RÉSOLU (TQ-5, v4.9.5–v4.9.9)
`ReservationBlock.tsx` (32 hooks), `CheckInModal.tsx`/`CheckOutModal.tsx` (18/14), `UsersTab.tsx` (18), `BannersTab.tsx` (17), `ExpenseForm.tsx` (14), `MissionWizard.tsx` (11) — les 4 interactions utilisateur les plus fréquentes du produit (réservation, check-in, check-out, note de frais) n'ont aucun test RTL.

> Les 7 composants explicitement nommés par l'audit ont été traités en priorité (v4.9.5), suivis des 38 composants restants en 4 lots (v4.9.6–v4.9.9). **100% des composants avec état ont désormais un test RTL.** Un bug d'accessibilité réel (`aria-hidden="true"` sur l'overlay `.modal-overlay`, masquant tout le contenu interactif de la modale aux lecteurs d'écran) a été découvert sur `CheckInModal`/`CheckOutModal` en écrivant leurs tests, puis retrouvé et corrigé sur 6 autres modales au fil des lots suivants (8 modales au total).

### Bugs de production découverts en écrivant les tests (chapitre 4)

Aucun de ces bugs n'a été recherché a priori — tous sont apparus naturellement en écrivant des tests corrects :

1. **`cron/daily-mileage-check`** (v4.9.2) — la requête SQL sélectionnait une colonne `Vehicle.isMaintenance` inexistante dans le schéma ; aurait provoqué un 500 en production pour tout véhicule connecté (VIN renseigné). Corrigé : `isMaintenance` dérivé de `Vehicle.status === 'MAINTENANCE'`.
2. **`vehicles/[id]/metrics`** (v4.9.3) — le `PATCH` renvoyait 403 aussi bien pour "pas de session" que pour "rôle insuffisant" (une seule `forbiddenResponse()`), contrairement à l'ordre documenté dans `src/app/api/CLAUDE.md` (401 avant 403). Corrigé.
3. **`DemoDB.ts`** (v4.9.4) — les données initiales de démo (`INITIAL_VEHICLES`/`INITIAL_USERS`/`INITIAL_MISSIONS`) étaient partagées par référence (pas de copie) dans les données stockées en `localStorage`. Toute mutation corrompait les constantes du module en mémoire, si bien que `DemoDB.reset()` ne restaurait plus l'état d'origine tant que la page n'était pas rechargée. Corrigé via `structuredClone()`.
4. **`aria-hidden="true"` sur 8 modales** (v4.9.5–v4.9.8) — `CheckInModal`, `CheckOutModal`, `MaintenanceHistoryModal`, `DesinfHistoryModal`, `DesinfPreCheckinModal`, `EditCheckOutModal`, `IncidentHistoryModal`, `IncidentReportModal` : l'attribut sur `.modal-overlay` masquait toute la modale (formulaire, boutons) aux technologies d'assistance alors qu'elle reste visible et interactive à l'écran. Corrigé sur les 8 fichiers.

### Problèmes de fond identifiés

1. **`zod-schemas.test.ts` teste des copies, pas les vrais schémas** — le fichier redéfinit localement `checkOutSchema`/`checkInSchema` au lieu d'importer ceux de `trips/[id]/checkout/route.ts`. Si le vrai schéma change, ces 14 tests continuent de passer : fausse confiance sur l'exigence de validation 400.

   > **✅ CORRIGÉ — v4.9.0 (`30b7d74`)** — Les schémas ont été extraits dans des fichiers `schema.ts` dédiés (contrainte Next.js : un fichier `route.ts` ne peut exporter que des handlers HTTP), importés à la fois par les routes et par le test.

2. **`e2e/verify_user_deletion.test.ts` n'est pas un vrai test** mais Playwright le collecte quand même (glob `**/*.test.ts`) — une IIFE qui lance son propre navigateur avec un `expect` fait main, en doublon (avec des sélecteurs différents) de `verify_user_deletion.spec.ts`.

   > **✅ CORRIGÉ — v4.9.0 (`30b7d74`)** — Fichier supprimé (script de debug, doublon confirmé).

3. **`e2e/checkout-checkin.spec.ts`**, malgré son nom, ne teste qu'une redirection de login — aucune couverture e2e réelle de réservation, check-in/checkout ou note de frais.

   > **➖ NON TRAITÉ** — Un vrai test e2e Playwright nécessite un serveur de dev démarré, jugé hors périmètre du chantier "tests manquants" (Vitest/RTL) mené ici. À traiter séparément si souhaité.

4. `setup.ts` recrée 30 `CREATE TABLE` à la main, maintenus séparément des migrations de prod — peut dériver silencieusement.

   > **➖ NON TRAITÉ** — Le fichier a même grandi (nouvelles tables `VehicleChecklistItem`, `RenaultSession` ajoutées au fil du chantier chapitre 4, suivant le pattern existant). La dérive potentielle avec les migrations de prod reste un risque non mitigé — hors périmètre de ce chantier de couverture de tests.

### Non trouvé (positif)
Aucun `.skip`, `.only`, `.todo`, `xit`, `xdescribe` — rien n'est désactivé silencieusement.

---

## 5. Incohérences documentaires (CLAUDE.md / .claude/rules) — signalées, non corrigées

Conformément au périmètre "audit only", ces incohérences sont listées mais **non corrigées** *(à l'audit — voir statut mis à jour ci-dessous)* :

1. **`CLAUDE.md` référence `src/middleware.ts`** pour la protection des routes — ce fichier n'existe pas. Le fichier réel est `src/proxy.ts` (Next.js 16 a renommé `middleware` en `proxy`). Repéré indépendamment par l'audit qualité et l'audit Next.js/React — risque réel de mal orienter quiconque trace le flux d'auth.

   > **✅ CORRIGÉ — v4.8.8 (`bbdc6c1`)** — Doublon des findings qualité L1 et Next.js #4, déjà corrigé.

2. **`CLAUDE.md` affirme que `npm run test` doit passer** — au moment de l'audit, la suite a 5 tests en échec (`PhotoPicker.test.tsx`, `VehicleCalendar.test.tsx`). La règle elle-même ("chaque nouvelle feature doit avoir des tests") n'est pas non plus respectée dans les faits : seulement 65% des routes API, 29% des modules lib et 10% des composants avec état ont des tests, malgré la formulation "must" dans `CLAUDE.md`.

   > **✅ CORRIGÉ — chantier chapitre 4 (v4.9.0–v4.9.9)** — Ce point se réduisait entièrement au chapitre 4 (vérifié : `CLAUDE.md` n'affirme jamais explicitement "npm run test doit passer", l'incohérence réelle étant simplement la suite rouge + la faible couverture). Suite désormais verte (1008 tests) et couverture quasi-totale (99%/92%/100%) — voir chapitre 4 pour le détail.

3. **AGENTS.md racine** affirme "où les deux existent, `CLAUDE.md` fait autorité" — cohérent avec ce qui a été observé, aucune contradiction trouvée entre le contenu des `AGENTS.md` et `CLAUDE.md` sur les points vérifiés (stack, rôles, conventions).

   > Aucune incohérence trouvée par l'audit lui-même — rien à corriger.

---

## Annexe — ce qui a été explicitement vérifié comme sain

- Aucune injection SQL en dehors du finding Critique #1 (les constructeurs de colonnes dynamiques sont contraints par Zod).
- Aucun secret en dur, `.env*` correctement ignoré par git.
- Aucun usage de `eval`, `dangerouslySetInnerHTML`, `child_process`.
- Usage de `any` minimal (4 occurrences réelles) et systématiquement justifié.
- `npm run lint` : 0 erreur, 0 warning.
- Les 38 routes dynamiques Next.js 16 gèrent correctement `params` comme une Promise.
- Le pattern Client Component + `useEffect` (M-4 différé) est un choix assumé, non un oubli — non recommandé de le "corriger".

**Mise à jour (2026-08-13) :**
- `npm run test` : 1000 tests, 0 échec (135 fichiers).
- `npx tsc --noEmit` : 105 erreurs, toutes préexistantes dans `authCallbacks.test.ts`, antérieures à ce chantier et non liées à l'audit — vérifiées identiques avant/après chaque lot de travail, y compris le correctif H1 (v4.10.0), aucune régression introduite.
- `npm run build` : vérifié localement sans secrets réels, succès.
- **Chantier de remédiation intégralement clos (v4.10.0)** : plus aucun finding en état de "report". Findings restants non corrigés, tous par décision assumée et documentée : sécurité #2 (comportement voulu), #8 et #9 (non traités), #12 (partiel) ; qualité M4/M6/M7 (partiels), M5 (non traité — 1418 `style={{...}}`) ; chapitre 4, points e2e (`checkout-checkin.spec.ts`, `setup.ts`) non traités. CI (`ci.yml`) active mais pas encore en "required check" sur `main` (réglage GitHub à activer manuellement).

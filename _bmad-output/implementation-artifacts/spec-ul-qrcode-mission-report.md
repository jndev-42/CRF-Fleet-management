---
title: 'QR code UL — soumission libre d''un rapport de mission par scan'
type: 'feature'
created: '2026-09-21'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'e4bb246e682a09b23072b14f916ff6cf5950c167'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Chaque UL n'a aucun moyen physique de recueillir un rapport de mission sur place — contrairement aux véhicules et aux stocks, qui exposent déjà un QR code d'accès direct. Le formulaire `/missions/new` reste réservé aux rôles `ADMIN`/`CI/RPAPS`/admin-or-above, ce qui empêche un bénévole ordinaire (CHVL, CHVPSP, ou sans rôle attribué) de déposer un compte rendu depuis le poste, alors qu'un véhicule ou un article de stock peut être manipulé par n'importe quel compte actif.

**Approche :** Ajouter un `qrToken` à `UniteLocale`, un point de gestion `/api/ul/[id]/qr-token` et une page de scan `/qr-ul/[token]` qui réutilisent exactement le mécanisme déjà en place pour véhicules/stocks (`isQrBlocked`, aucun filtre de rôle). La page embarque le `MissionWizard` existant avec l'étape « UL / DT » verrouillée sur l'UL scannée. La soumission passe par une route dédiée, distincte de `POST /api/missions`, pour ne jamais toucher son contrôle d'accès actuel. L'UI d'administration pour afficher/imprimer le QR (bouton `ULsTab` + modale) est déférée à une story suivante (`deferred-work.md`) : cette spec livre la mécanique complète (token, résolution, soumission bypass-rôle), récupérable via l'API en attendant.

## Boundaries & Constraints

**Always :**
- Accès à `/qr-ul/[token]` et à la soumission qu'il déclenche : tout compte connecté non INACTIF (`isQrBlocked`), quel que soit son rôle — même logique que `/qr/[token]` (véhicule) et `/qr-stock/[token]`.
- `POST /api/missions` et ses `ALLOWED_ROLES`/`isAdminOrAbove` restent inchangés : la soumission via QR passe par une route dédiée qui ne les appelle pas.
- Le rapport créé via QR est rattaché exactement à l'UL scannée (`ulId` forcé côté serveur depuis le token) ; `dt_code` toujours `NULL` ; le client ne peut jamais l'écraser.
- `DELETE /api/ul/[id]/qr-token` (régénération) : réservé à `canAccessAdminPanel` -- modèle DELETE de `/api/vehicles/[id]/qr-token`. Aucune UI ne l'expose encore (cf. deferred-work), mais la route existe et est protégée dès cette spec.
- Toute nouvelle route/fonction livre ses tests (règle CLAUDE.md).

**Never :**
- Ne pas ajouter de filtre d'UL/rôle à la lecture ou à la soumission via token — la possession du QR fait foi, comme pour les véhicules.
- Ne pas dupliquer la logique d'insertion de `mission_reports`/supplies/interventions : l'extraire pour que `/api/missions` et la route QR partagent le même code.
- Ne pas laisser l'étape « UL / DT » du wizard visible ou modifiable quand elle est verrouillée par le QR.
- Ne pas construire le bouton/la modale d'administration (`ULsTab`/`ULQRCodeModal`) dans cette spec — c'est le sous-objectif déféré.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scan par bénévole sans rôle | `GET /api/qr-ul/[token]`, `roles=[]` | 200, `{id, name}` de l'UL | N/A |
| Scan par compte INACTIF | idem, `roles` contient `INACTIF` | 403 « Compte inactif » | N/A |
| Token inconnu ou régénéré | GET/POST avec un token périmé | 404 « QR Code invalide » | N/A |
| Soumission via QR | `POST .../mission-report` sans `selected_ul_id` | 201, `ulId` = UL du token, `dt_code=NULL` | N/A |
| Client falsifie l'UL | payload avec `selected_ul_id` différent de celui du token | Ignoré : `ulId` reste celui du token | N/A |
| Régénération par un non-admin de l'UL | `DELETE /api/ul/[id]/qr-token` | 403 | `forbiddenResponse()` |

</frozen-after-approval>

## Code Map

- `scripts/add-ul-qr-token.ts` (NEW) -- migration prod dry-run/`--apply`, modèle exact `scripts/add-vehicle-qr-token.ts` : `ALTER TABLE UniteLocale ADD COLUMN qrToken TEXT` + `CREATE UNIQUE INDEX ... WHERE qrToken IS NOT NULL` (index partiel, modèle `InvStockList_qrToken_key`).
- `scripts/setup-dev.ts:89-98` -- ajouter `qrToken` au bloc `PRAGMA table_info("UniteLocale")` existant (même pattern que `defaultParkingSpots`/`stampImage`/`dtCode`) + index unique partiel juste après (modèle lignes 410-415).
- `CLAUDE.md` (racine) -- enregistrer la commande `scripts/add-ul-qr-token.ts` dans Commands.
- `src/lib/missions/create-mission-report.ts` (NEW) -- extrait de `src/app/api/missions/route.ts` : le schéma `createMissionReportSchema` (lignes 36-145) et la logique de validation UL/DT + résolution `submitted_by` + transaction INSERT `mission_reports`/supplies/interventions (lignes 315-433), regroupés dans `insertMissionReport(data, userEmail)` réutilisée par les deux routes POST.
- `src/app/api/missions/route.ts` -- POST : remplace son corps (lignes ~303-433) par un appel à `insertMissionReport`, en conservant `ALLOWED_ROLES`/`isAdminOrAbove` (inchangé) avant l'appel.
- `src/app/api/ul/[id]/qr-token/route.ts` (NEW) -- GET/POST lazy-create (auth seule), DELETE régénère (gate `canAccessAdminPanel`) -- modèle exact `src/app/api/vehicles/[id]/qr-token/route.ts`.
- `src/app/api/qr-ul/[token]/route.ts` (NEW) -- GET : résout `qrToken` → `{id, name}` (`SELECT id, name FROM UniteLocale WHERE qrToken = ?`), guard `auth()` + `isQrBlocked()` -- modèle `src/app/api/qr/[token]/vehicle/route.ts`.
- `src/app/api/qr-ul/[token]/mission-report/route.ts` (NEW) -- POST : guard `auth()` + `isQrBlocked()` (PAS `ALLOWED_ROLES`), résout le token → `ulId`, force `selected_ul_id = ulId` / `selected_dt_code = null` sur le payload reçu avant `insertMissionReport` -- modèle d'accès `src/app/api/qr/[token]/checkout/route.ts`.
- `src/components/missions/MissionWizard.tsx` -- nouvelles props optionnelles `lockedUlId?: string`, `lockedUlName?: string`, `submitEndpoint?: string` (défaut `/api/missions`) ; état initial avec `selected_ul_id: lockedUlId ?? null` ; `activeSteps` (lignes 103-114) retire `'UL / DT'` quand `lockedUlId` fourni ; `handleSubmit` (ligne 250) poste sur `submitEndpoint` ; bandeau lecture-seule « Rattaché à {lockedUlName} » affiché à la place de l'étape quand verrouillé.
- `src/app/qr-ul/[token]/page.tsx` (NEW) -- page client, modèle exact `src/app/qr/[token]/page.tsx` : fetch `/api/qr-ul/[token]`, 401 → redirect `/login?callbackUrl=/qr-ul/[token]`, 403/404 → carte d'erreur ; succès → `<MissionWizard lockedUlId lockedUlName submitEndpoint=".../mission-report" onSuccess={() => setDone(true)} />` ; état `done` → carte de confirmation avec bouton « Nouveau rapport » (reset local, pas de redirection vers `/missions/[id]`).
- `package.json` / `CHANGELOG.md` -- bump de version + entrée FR (convention projet).
- AGENTS.md à relire puis régénérer : `src/app/api/missions/AGENTS.md`, `src/components/missions/AGENTS.md`, `src/app/AGENTS.md` (nouveau dossier `qr-ul`).

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-ul-qr-token.ts` -- créer le script de migration -- ajoute `qrToken` sans casser l'existant
- [x] `scripts/setup-dev.ts` -- bloc `PRAGMA` + index `qrToken` sur `UniteLocale` -- dev aligné avec prod
- [x] `CLAUDE.md` -- enregistrer la commande du script -- convention `scripts/CLAUDE.md`
- [x] `src/lib/missions/create-mission-report.ts` -- extraire schéma + logique d'insertion -- partagé entre les deux routes POST
- [x] `src/app/api/missions/route.ts` -- POST appelle la fonction partagée -- élimine la duplication, comportement inchangé
- [x] `src/app/api/ul/[id]/qr-token/route.ts` -- GET/POST/DELETE -- gestion du token, modèle véhicule
- [x] `src/app/api/qr-ul/[token]/route.ts` -- GET résolution token → UL -- alimente la page de scan
- [x] `src/app/api/qr-ul/[token]/mission-report/route.ts` -- POST sans filtre de rôle -- cœur de la demande utilisateur
- [x] `src/components/missions/MissionWizard.tsx` -- props de verrouillage UL -- réutilise le wizard existant sans dupliquer ses 10 étapes
- [x] `src/app/qr-ul/[token]/page.tsx` -- page de scan -- point d'entrée après connexion
- [x] `package.json` / `CHANGELOG.md` -- bump + entrée FR
- [x] Tests -- `src/__tests__/integration/ul-qr-token.test.ts`, `qr-ul.test.ts`, `qr-ul-mission-report.test.ts` : 401/404 résolution token, 403 compte INACTIF, 201 happy path rôle vide, `ulId` forcé malgré payload client falsifié, 403 régénération par non-admin de l'UL -- exigence CLAUDE.md « toute nouvelle feature livre ses tests »

**Acceptance Criteria:**
- Given un CHVL sans autre rôle qui scanne le QR code de l'UL Paris 18, when il soumet le wizard jusqu'au bout, then le rapport est créé avec `ulId='ul-paris-18'`, `dt_code=NULL`, sans jamais afficher l'étape « UL / DT ».
- Given un admin régénère le QR code d'une UL (via l'API), when l'ancien lien est ensuite scanné, then l'API renvoie 404 et aucun rapport ne peut être créé avec l'ancien token.
- Given la route `POST /api/missions` classique, when un CI/RPAPS soumet un rapport depuis `/missions/new`, then le comportement (rôles autorisés, sélection UL/DT libre) est strictement identique à avant cette feature.

## Implementation Notes

- `insertMissionReport(data, userEmail, sessionUserId?)` : signature étendue d'un troisième paramètre optionnel `sessionUserId` par rapport au Code Map (`insertMissionReport(data, userEmail)`), pour préserver la normalisation existante de `driver_id` (mappage `session.user.id` → UUID réel, utile en dev où l'id de session peut être un e-mail de repli). Sans ce paramètre, l'extraction aurait régressé silencieusement ce cas.
- Retiré du CHANGELOG le bullet annonçant la régénération du QR comme geste utilisateur : seule l'API `DELETE /api/ul/[id]/qr-token` existe dans cette spec, sans bouton — l'UI (deferred-work) le documentera à son tour.
- Vérifié indépendamment (hors rapport de l'agent d'implémentation) : `npm run lint` (0/0), `npx tsc --noEmit` (clean), `npm run test` (203 fichiers / 2156 tests, tous verts), lecture directe des 6 fichiers de code touchés les plus sensibles (routes QR, `create-mission-report.ts`, `MissionWizard.tsx`, page de scan) — conformes à la spec.
- Point relevé par l'agent, non traité ici (hors périmètre de cette spec) : `GET/POST /api/ul/[id]/qr-token` n'est pas cloisonné par UL, contrairement à l'équivalent stock — comportement volontairement identique au modèle véhicule demandé par le Code Map, mais tout utilisateur authentifié peut ainsi lire/créer le token de n'importe quelle UL (pas le régénérer, qui reste admin-only). À trancher consciemment avant que l'UI de la story suivante ne rende ce token facilement découvrable. **Résolu en revue (patch #1) : `GET/POST` exigent désormais `canAccessAdminPanel`, comme `DELETE` dans le même fichier.**
- Après la passe de patch (5 correctifs, voir Review Triage Log) : le fix #1 (garde `canAccessAdminPanel` sur GET/POST) a fait régresser 4 tests préexistants de `ul-qr-token.test.ts` qui encodaient l'ancien comportement (« aucune contrainte de rôle en lecture ») — l'agent de patch n'avait lancé que les tests des fichiers qu'il a lui-même touchés, pas ce fichier préexistant qui teste pourtant la même route. Réécrit ces tests pour vérifier le nouvel invariant (403 pour CHVL/sans-rôle, 200 pour ADMIN/CADRE) plutôt que de simplement les supprimer.
- Corrigé une erreur TypeScript dans le nouveau `QRUnitLocalePage.test.tsx` (cast direct `as ReturnType<typeof useRouter>` refusé par `tsc` — `AppRouterInstance` a plus de méthodes que le mock) : passage par `as unknown as ...`, et suppression d'un doublon de `mockReturnValue`.
- Vérification finale indépendante : `npm run lint` (0/0), `npx tsc --noEmit` (clean), `npm run test` → 204 fichiers / 2164 tests, 2 échecs restants (`QRStockPage.test.tsx`, `VehicleInteractiveSVG.test.tsx`) confirmés préexistants et non liés à ce diff (aucun des deux fichiers n'y figure ; passent isolément, échouent parfois sous charge complète de la suite — flakiness antérieure).

## Spec Change Log

## Review Triage Log

**Passe 1 (blind-hunter, edge-case-hunter, verification-gap) :**

1. [blind-hunter, edge-case-hunter] `GET/POST /api/ul/[id]/qr-token` ne vérifient que `session?.user` — pas de garde de rôle du tout, contrairement à `DELETE` du même fichier (`canAccessAdminPanel`). Un compte INACTIF peut donc lire/créer le token de n'importe quelle UL, et n'importe quel compte authentifié peut moissonner le token de n'importe quelle autre UL par simple itération d'`id`. Vérifié : aucun appelant frontend n'existe encore pour ce endpoint (grep négatif) — durcir ne casse rien. **medium → patch.**
2. [edge-case-hunter] `getOrCreateToken()` (même fichier, lignes 21-40) : deux créations concurrentes lisent toutes deux `qrToken=NULL` puis `UPDATE` chacune un UUID différent — le perdant reçoit un token immédiatement périmé. **low → patch** (regroupé avec #1, même fichier).
3. [blind-hunter] `src/app/qr-ul/[token]/page.tsx` : seul nouveau composant du diff avec état/logique réels (fetch, loading, error, done, wizardKey), aucun test dédié — viole la règle CLAUDE.md « nouveau composant avec état → test RTL ». **medium → patch.**
4. [blind-hunter] `CHANGELOG.md` [5.14.0], premier bullet : « à imprimer et afficher au poste » laisse croire qu'une image prête à l'emploi existe déjà cette version, alors qu'aucune UI ne l'expose (`ULsTab`/`ULQRCodeModal` différés) — seul un appel API brut donne le lien. **low → patch.**
5. [blind-hunter] `src/__tests__/integration/qr-ul-mission-report.test.ts:159` : le titre du test affirme « refusé, lui, par POST /api/missions » mais son corps n'appelle jamais `postClassic` — cette vérification vit dans le `describe` séparé plus bas. Couverture réelle présente, seul le nom du test sur-promet. **low → patch** (renommage trivial).
6. [edge-case-hunter] `MissionWizard.tsx:270-286` (`handleSubmit`) : aucune gestion spécifique d'un 401 sur `submitEndpoint` (pas de redirection `/login`), contrairement à la résolution du token dans `page.tsx`. Vérifié : préexistant, le flux classique `/missions/new` a exactement la même lacune — pas introduit par ce diff. **low → defer.**
7. [blind-hunter] `src/app/qr-ul/[token]/page.tsx` : blocs chargement/erreur sans `role="status"`/`aria-live` ni `role="alert"`. Vérifié : lacune identique déjà présente dans `src/app/qr/[token]/page.tsx` et `src/app/qr-stock/[token]/page.tsx`, modèles explicitement imités — préexistant, pas une régression de ce diff. **low → defer.**
8. [verification-gap, pré-vérifié] `MissionWizard.tsx:105-107,293-296` : en mode verrouillé sur l'UL Paris 18, `onSuccess` est différé par `MarineApprovedOverlay` (~3.7s) — aucun test ne vérifie que l'appel finit par arriver pour cette combinaison précise (le test d'animation préexistant n'attend pas l'issue, le nouveau test verrouillé utilise délibérément une autre UL). Interaction cosmétique étroite ; la création du rapport elle-même est intégralement vérifiée. **defer** (disposition déposée par le reviewer, reprise telle quelle).
9. [blind-hunter] `scripts/add-ul-qr-token.ts` : le contrôle anti-doublon `WHERE qrToken IS NOT NULL GROUP BY qrToken HAVING c>1` laisserait passer deux tokens `''`. **false** — `IS NOT NULL` inclut la chaîne vide ; deux lignes `''` seraient comptées ensemble et détectées par ce même contrôle avant la création de l'index.
10. [blind-hunter] Styles inline + emoji sur `qr-ul/[token]/page.tsx` incohérents avec `Lock`/lucide-react ajouté à `MissionWizard.tsx` dans le même diff. **false** — la page reproduit fidèlement le style de son modèle explicitement désigné (`qr/[token]/page.tsx`, `qr-stock/[token]/page.tsx`), pas une incohérence nouvelle.
11. [blind-hunter] `lockedUlId` et `submitEndpoint` sont des props indépendantes ; passer l'une sans l'autre retomberait sur `/api/missions` (403 pour un utilisateur sans rôle). **low → rejeté** : seul site d'appel du diff (`qr-ul/[token]/page.tsx`) les passe toujours ensemble ; un garde de type (union discriminée) serait plus qu'une correction directe pour un cas non atteignable aujourd'hui.
12. [blind-hunter] L'invariant « `insertMissionReport` ne doit jamais faire d'autorisation » n'est protégé que par un commentaire + le test de non-régression. **low → rejeté** : préoccupation développeur, déjà mitigée, une règle structurelle serait plus qu'une correction directe.
13. [edge-case-hunter] TOCTOU entre le `SELECT` d'existence UL/DT (`create-mission-report.ts:181-197`, hors transaction) et l'`INSERT` : une UL supprimée entre les deux orphelinerait le rapport. Vérifié réel : `DELETE /api/ul/[id]` existe (SUPER_ADMIN uniquement). **low → rejeté** : exige qu'un SUPER_ADMIN supprime exactement cette UL dans la même fraction de seconde qu'une soumission — improbable en usage réel — et le fix (déplacer le contrôle dans la transaction, restructurer la gestion d'erreur) est plus qu'une correction directe.

**Routage :** patch (#1, #2, #3, #4, #5) → ré-engagement de l'agent d'implémentation. defer (#6, #7, #8) → `deferred-work.md`. Reste rejeté (false ou low non trivial).

## Design Notes

**Extraction plutôt que duplication :** la logique de `POST /api/missions` (validation UL/DT réelle, résolution `submitted_by`, transaction sur trois tables) est substantielle ; la dupliquer dans la route QR ferait diverger silencieusement les deux chemins à la prochaine évolution du schéma. `insertMissionReport()` devient le seul point d'écriture.

**Pas de redirection vers `/missions/[id]` après soumission QR :** un scanneur sans rôle attribué n'a pas forcément accès à l'écran `/missions` ou à la fiche détail (gates de page côté rôle) ; une carte de confirmation locale sur `/qr-ul/[token]` évite de dépendre de ces gates et reste cohérente avec le pattern déjà utilisé par `/qr/[token]` (état `done`).

**Ordre de déploiement :** comme pour `dt_code` (v5.12.0), la migration `scripts/add-ul-qr-token.ts --apply` doit tourner avant le déploiement — la colonne `qrToken` est lue dès le premier appel à `/api/ul/[id]/qr-token`.

## Verification

**Commands:**
- `npm run lint` -- attendu : 0 erreur, 0 warning
- `npm run test` -- attendu : suite complète verte, incluant les nouveaux tests QR-UL
- `npx tsx scripts/add-ul-qr-token.ts` (dry-run) puis `--apply` sur un environnement de test -- attendu : colonne `qrToken` ajoutée, idempotent au second run

**Manual checks (if no CLI):**
- Récupérer un token via `POST /api/ul/{id}/qr-token` (devtools ou requête authentifiée directe, en l'absence de l'UI de la story suivante), ouvrir `/qr-ul/{token}` avec un compte n'ayant aucun rôle attribué, soumettre un rapport de bout en bout, vérifier en DB que `ulId` correspond à l'UL scannée et `dt_code` est `NULL`.
- Régénérer le token via `DELETE /api/ul/{id}/qr-token` puis vérifier que l'ancien lien renvoie 404.

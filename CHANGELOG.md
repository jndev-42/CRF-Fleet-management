# Changelog

## [4.10.0] — 13 août 2026

### 🐛 Correction du finding H1 de l'audit — store de jobs en mémoire

Dernier finding non traité de `docs/code-review-2026-08-11.md` : les 4 routes d'export stats (`stats/pdf`, `stats/csv`, `stats/expenses/pdf`, `stats/expenses/csv`) stockaient le fichier généré dans une `Map` globale en mémoire sous un `jobId`, puis le client faisait un second appel `GET ?jobId=...` pour le télécharger. Sur Vercel serverless, `POST` et `GET` peuvent atterrir sur des instances lambda différentes → 404 intermittent en production, invisible en local.

- **Correctif** : le fichier généré (déjà 100% synchrone côté serveur) est désormais retourné directement par le `POST` — plus de `Map` globale, plus de `GET` de polling, plus de TTL/cleanup à gérer. Une seule requête HTTP ne peut plus jamais atterrir sur la mauvaise instance.
- **Client** (`src/app/stats/page.tsx`) : `res.blob()` → `URL.createObjectURL()` au lieu de parser un `jobId`. `ExportReadyModal.tsx` déclenche le téléchargement via un `<a download>` temporaire (fiable pour une `blob:` URL, contrairement à `window.open()` qui ne préserve pas le nom de fichier) — le nom de fichier est lu depuis l'en-tête `Content-Disposition` renvoyé par le serveur plutôt que dupliqué côté client.
- **Nettoyage** : suppression de `PdfReadyModal.tsx` (doublon mort de `ExportReadyModal`, jamais importé, suivait l'ancien pattern à base de `jobId`).
- Tests mis à jour (`stats-pdf.test.ts`, `stats-csv.test.ts`, `expense-stats.test.ts`) pour la nouvelle réponse synchrone. `npm run test` : 1000 tests, 0 échec. `npm run lint` : 0/0. `npx tsc --noEmit` : 105 erreurs préexistantes identiques (hors périmètre). `npm run build` : vérifié localement sans secrets réels, succès.
- **Chantier d'audit du 2026-08-11 entièrement clos** : tous les findings sont désormais soit corrigés, soit explicitement non corrigés par décision assumée (aucun report restant).

## [4.9.9] — 13 août 2026

### 🧪 Couverture de tests — Phase 5 (2/2) : composants de priorité 2 (lot 4, dernier lot)

Tests RTL pour les 11 derniers composants à état identifiés sans couverture : `OneSignalProvider`, `PhotoViewer`, `vehicle/modals/PutInMaintenanceModal`, `users/RoleLegend`, `missions/SignedReportLightbox`, `missions/steps/Step2Vehicle`, `missions/steps/Step3Supplies`, `inventory/modals/StockModal`, `ThemeToggle`, `vehicle/VehicleNotes`, `Navbar`.

Le chapitre **"Couverture de tests"** de l'audit (`docs/code-review-2026-08-11.md`) est désormais intégralement traité : les 24 routes API (TQ-3), les 15 modules `src/lib/**` (TQ-4) et les 45 composants à état (TQ-5, 5 lots) identifiés sans test en ont maintenant tous — en plus des correctifs de la suite existante (TQ-1/TQ-2). Le chapitre 5 "Incohérences documentaires" de l'audit se réduisait entièrement à ce chapitre (cf. contexte du plan de remédiation).

- 63 nouveaux tests, suite complète toujours à 0 échec (**1008 tests**, contre 46 fichiers/16 échecs en début de chantier). `npm run lint` : 0 erreur/0 warning. `npx tsc --noEmit` : 105 erreurs préexistantes identiques avant/après sur l'ensemble du chantier (dette technique dans `authCallbacks.test.ts`, antérieure à cette session, hors périmètre — vérifié à chaque lot).
- Au fil de ce chantier de couverture de tests, **4 bugs de production réels** ont été découverts et corrigés en écrivant les tests (et non recherchés a priori) : requête SQL du cron référençant une colonne inexistante (`4.9.2`), confusion 401/403 sur `vehicles/[id]/metrics` (`4.9.3`), données de démo partagées par référence empêchant `DemoDB.reset()` de fonctionner (`4.9.4`), et le bug d'accessibilité `aria-hidden` sur les overlays de modales, présent sur 8 modales et corrigé au fil des lots 4.9.5 à 4.9.8.

## [4.9.8] — 12 août 2026

### 🧪 Couverture de tests — Phase 5 (2/2) : composants de priorité 2 (lot 3)

Tests RTL pour 12 composants supplémentaires : `inventory/modals/ExpiringSoonModal`, `FooterChangelog`, `vehicle/modals/IncidentHistoryModal`, `inventory/modals/InventoryHistoryModal`, `KonamiEasterEgg`, `LicenseBanner`, `inventory/modals/LowStockModal`, `ui/MarineApprovedOverlay`, `admin/MenusTab`, `missions/MissionPhotosModal`, `missions/MissionPhotosSection`, `stats/MultiSelectDropdown`.

- **`IncidentHistoryModal.tsx`** — corrige le même bug d'accessibilité `aria-hidden="true"` sur `.modal-overlay` identifié depuis 4.9.5. C'était la dernière modale connue affectée par ce défaut — le correctif est maintenant complet sur toutes les modales de l'application.
- 60 nouveaux tests, suite complète toujours à 0 échec (945 tests). `npx tsc --noEmit` : 105 erreurs préexistantes identiques avant/après (dette technique hors périmètre, cf. 4.9.3).
- Reste à traiter : ~11 composants de priorité 2, sur un dernier lot.

## [4.9.7] — 12 août 2026

### 🧪 Couverture de tests — Phase 5 (2/2) : composants de priorité 2 (lot 2)

Tests RTL pour 12 composants supplémentaires : `inventory/modals/AddItemModal`, `BugReportButton`, `vehicle/ChecklistItems`, `vehicle/modals/DeleteConfirmationModal`, `vehicle/modals/DesinfHistoryModal`, `vehicle/modals/DesinfPreCheckinModal`, `ui/UserCombobox`, `stats/DriverBreakdown`, `vehicle/modals/EditCheckOutModal`, `vehicle/modals/EditMetricsModal`, `vehicle/modals/EditRevisionIntervalsModal`, `stats/ExpenseStatsSection`.

- **`DesinfHistoryModal.tsx` / `DesinfPreCheckinModal.tsx` / `EditCheckOutModal.tsx`** — corrigent le même bug d'accessibilité `aria-hidden="true"` sur `.modal-overlay` déjà identifié en 4.9.5/4.9.6.
- **`IncidentReportModal.tsx`** — même correctif appliqué en bonus : ce composant était déjà testé (lot antérieur) mais son bug `aria-hidden` avait été manqué à l'époque (son test ne vérifiait pas l'accessibilité de la modale). Vérifié que ses 11 tests existants passent toujours après correction.
- Il ne reste plus qu'`IncidentHistoryModal` avec ce défaut — prévu dans le prochain lot.
- 64 nouveaux tests, suite complète toujours à 0 échec (885 tests). `npx tsc --noEmit` : 105 erreurs préexistantes identiques avant/après (dette technique hors périmètre, cf. 4.9.3).
- Reste à traiter : ~23 composants de priorité 2, sur de prochains lots.

## [4.9.6] — 12 août 2026

### 🧪 Couverture de tests — Phase 5 (2/2) : composants de priorité 2 (lot 1)

Tests RTL pour 10 composants supplémentaires : `admin/AddVehicleModal`, `inventory/ChecklistManager`, `inventory/EditItemModal`, `GuidedTour`, `inventory/ItemBatchesModal`, `vehicle/modals/MaintenanceHistoryModal`, `NotificationBell`, `vehicle/modals/QRCodeModal`, `admin/ULsTab`, `expenses/YousignSignatureModal`.

- **`MaintenanceHistoryModal.tsx`** — corrige le même bug d'accessibilité `aria-hidden="true"` déjà identifié sur `CheckInModal`/`CheckOutModal` en 4.9.5. Il reste 5 modales concernées (`DesinfHistoryModal`, `DesinfPreCheckinModal`, `EditCheckOutModal`, `IncidentHistoryModal`, `IncidentReportModal`), à traiter dans une prochaine passe.
- 76 nouveaux tests, suite complète toujours à 0 échec (821 tests). `npx tsc --noEmit` : 105 erreurs préexistantes identiques avant/après (dette technique hors périmètre, cf. 4.9.3).
- Reste à traiter : ~36 composants de priorité 2, sur de prochains lots.

## [4.9.5] — 12 août 2026

### 🧪 Couverture de tests — Phase 5 (1/2) : composants à état prioritaires (React Testing Library)

Tests RTL pour les 10 composants à état les plus à risque identifiés par l'audit (densité de hooks) : `vehicle/ReservationBlock`, `vehicle/modals/CheckInModal`, `vehicle/modals/CheckOutModal`, `admin/UsersTab`, `admin/UsersTable`, `admin/modals/AddUserModal`, `admin/modals/ManageUserULsModal`, `admin/BannersTab`, `expenses/ExpenseForm`, `missions/MissionWizard`.

- **`CheckInModal.tsx` / `CheckOutModal.tsx`** — bug d'accessibilité réel découvert en écrivant les tests : le conteneur `.modal-overlay` portait `aria-hidden="true"`, masquant **toute** la modale (formulaire, boutons, sous-modale de signalement d'incident) aux technologies d'assistance alors qu'elle reste visible et interactive à l'écran. Corrigé sur ces deux fichiers. Le même défaut existe sur 6 autres modales (`DesinfHistoryModal`, `DesinfPreCheckinModal`, `EditCheckOutModal`, `IncidentHistoryModal`, `IncidentReportModal`, `MaintenanceHistoryModal`) — hors périmètre de ce lot, à corriger dans une prochaine passe.
- 81 nouveaux tests, suite complète toujours à 0 échec (745 tests). `npx tsc --noEmit` : 105 erreurs préexistantes identiques avant/après (dette technique hors périmètre, cf. 4.9.3).
- Reste à traiter : ~46 composants de priorité 2 (par risque décroissant), sur un prochain lot.

## [4.9.4] — 12 août 2026

### 🧪 Couverture de tests — Phase 4 : modules lib non couverts

Tests unitaires/intégration pour les 14 modules `src/lib/**` sans aucune couverture identifiés par l'audit : `apiAuth.ts`, `driveAuth.ts`, `drive.ts`, `email.ts`, `renault.ts`, `onesignal.ts`, `inventory/stocks.ts`, `mission-supplies.ts`, `preview-accounts.ts`, `stamp.ts`, `demo/DemoDB.ts`, `demo/fetchInterceptor.ts`, `contexts/DemoContext.tsx`, `contexts/MenuSettingsContext.tsx`. `stats-expenses.ts` (15ᵉ module de la liste) était déjà exercé indirectement par `expense-stats.test.ts` — pas de fichier dédié nécessaire, même traitement que `stats-trips.ts`.

- **`demo/DemoDB.ts`** — bug réel découvert en écrivant le test : `INITIAL_VEHICLES`/`INITIAL_USERS`/`INITIAL_MISSIONS` étaient passés par référence (pas de copie) dans les données initiales stockées en `localStorage`. Toute mutation (ex. `updateVehicle`) corrompait alors les constantes du module en mémoire, si bien que `DemoDB.reset()` ne restaurait plus les données de démo d'origine tant que la page n'était pas rechargée. Corrigé via `structuredClone()`.
- **DB-touching modules** (`driveAuth.ts`, `inventory/stocks.ts`, `renault.ts`, `onesignal.ts`) placés en `integration/` (DB SQLite réelle, jamais mockée) plutôt qu'en `unit/`, conformément à la convention du projet.
- **`setup.ts`** — ajout de la table `RenaultSession` (cache de session Gigya/Kamereon) et extension de `seedInvItem`/ajout de `seedInvBatch`.
- 82 nouveaux tests, suite complète toujours à 0 échec (664 tests). `npx tsc --noEmit` : 105 erreurs préexistantes identiques avant/après (dette technique hors périmètre, cf. 4.9.3).

## [4.9.3] — 12 août 2026

### 🧪 Couverture de tests — Phase 3 (2/2) : nouvelles routes API sans test

Second et dernier lot de routes API sans aucun test d'intégration : `inventory/batches`, `inventory/expiring-soon`, `inventory/history`, `inventory/low-stock`, `renault/[vin]`, `stats/csv`, `stats/pdf`, `stats/trips`, `trips/[id]/refresh-renault`, `trips/[id]/second-driver`, `vehicles/[id]/metrics`, `vehicles/[id]/qr-token`, `vehicles/[id]/trips`. Les 24 routes identifiées par l'audit sont désormais toutes couvertes.

- **`vehicles/[id]/metrics` (PATCH)** — bug réel découvert en écrivant le test : la route renvoyait 403 aussi bien pour "pas de session" que pour "rôle insuffisant" (`forbiddenResponse()` unique), au lieu de distinguer 401/403 comme l'exige `src/app/api/CLAUDE.md`. Corrigé (même anti-pattern déjà corrigé sur `vehicles/route.ts` en phase précédente).
- **`setup.ts`** — extension de `seedInvItem` (`minStock`, `stockId`, `ulId`) et ajout de `seedInvBatch` pour couvrir les routes d'inventaire.
- 77 nouveaux tests, suite complète toujours à 0 échec (582 tests). `npx tsc --noEmit` : 105 erreurs préexistantes (dette technique dans `authCallbacks.test.ts`, antérieure à cette session, hors périmètre) — vérifié à l'identique avant/après ce lot, aucune régression introduite.

## [4.9.2] — 12 août 2026

### 🧪 Couverture de tests — Phase 3 (1/2) : nouvelles routes API sans test

Premier lot de 7 routes (sur 24) sans aucun test d'intégration : `changelog`, `checklist/[itemId]` + `vehicles/[id]/checklist`, `cron/daily-mileage-check`, `drive/photos` + `[fileId]`, `expenses/[id]/pdf`, `incidents/[id]` + `[id]/pdf`, `notifications` + `[id]`.

- **`cron/daily-mileage-check`** — bug réel découvert en écrivant le test : la requête SQL sélectionnait une colonne `Vehicle.isMaintenance` qui n'existe pas dans le schéma (500 en production pour tout véhicule connecté avec un VIN). Corrigé : dérivation depuis `Vehicle.status === 'MAINTENANCE'`. Le test documente aussi volontairement le comportement fail-open si `CRON_SECRET` n'est pas configuré (finding sécurité #8, non corrigé par choix explicite).
- **`setup.ts`** — ajout de la table `VehicleChecklistItem` et de 4 nouveaux helpers de seed (`seedChecklistItem`, `seedIncident`, `seedNotification`, `seedExpenseReport`) pour couvrir ce lot de routes.
- 55 nouveaux tests, suite complète toujours à 0 échec (505 tests).

## [4.9.1] — 12 août 2026

### 🧪 Couverture de tests — Phase 2 : tests existants incomplets

- **`qr.test.ts`** — ajout de 401 (sans session), 403 (compte inactif) et 400 (Zod) sur les routes QR.
- **`ul-parking.test.ts`** — ajout de 401 (GET), 403 (POST non-SUPER_ADMIN) et 400 (slug invalide).
- **`upload-validation.test.ts`** — ajout d'un cas 401 réel sur `drive/upload` et `expenses/upload` (l'auth était mockée en permanence authentifiée).
- **`vehicles.test.ts`** — ajout d'un vrai test 401. A révélé un bug réel au passage : `POST`/`PATCH`/`DELETE /api/vehicles` ne vérifiaient jamais l'absence de session séparément du rôle (`isAdminOrAbove(session?.user?.roles || [])` renvoie 403 aussi bien pour "pas de session" que pour "mauvais rôle"), contrairement à l'ordre documenté dans `src/app/api/CLAUDE.md` (401 avant 403). Corrigé sur les 3 handlers.
- **`stats.test.ts`** — vérifié : teste `fetchStatsData` (couche lib, pas de session en jeu) ; la route `/api/stats` elle-même a déjà sa couverture 401/403/400 dans `stats-filters.test.ts`. Rien à ajouter.
- **`repro_bug.test.ts`** — vérifié : test de non-régression ciblé sur `POST /api/users`, déjà couvert en 401/403/400 par `users.test.ts`. Laissé tel quel pour ne pas diluer son objet.

## [4.9.0] — 12 août 2026

### 🧪 Couverture de tests — Phase 1 : suite verte

Début du chapitre "Couverture de tests" de l'audit (`docs/code-review-2026-08-11.md`). `npm run test` était à 16 échecs sur 46 fichiers ; passe désormais à **0 échec, 441 tests**.

- **11 régressions introduites par les correctifs de sécurité Haute de cette session** (`vehicles.test.ts`, `maintenance.test.ts`, `desinf.test.ts`) — le contrôle d'appartenance UL ajouté à `vehicles/[id]` (PATCH), `maintenance` et `desinfections` faisait échouer des tests dont le mock de session n'avait pas de `ulId` correspondant au véhicule seedé. Corrigé en alignant les fixtures, pas le code produit (le contrôle est légitime).
- **`PhotoPicker.test.tsx` (4 tests)** — cause réelle non liée à jsdom/React 19 comme le supposait l'audit : `handleFiles` est devenu asynchrone (pré-compression en arrière-plan, commit antérieur `443c8ff`), et jsdom ne déclenche jamais `onload`/`onerror` sur un `<img>` chargé depuis un blob: URL, bloquant indéfiniment la Promise de compression réelle. Le module `@/lib/imageCompression` est désormais mocké dans le test pour isoler la logique de validation de taille.
- **`VehicleCalendar.test.tsx` (1 test)** — les données de test étaient figées sur juillet 2026 alors que le composant affiche le mois réel par défaut (`new Date()`) ; la dérive du temps a fini par désynchroniser la réservation de test du mois affiché. Dates de la réservation calculées dynamiquement par rapport au mois courant.
- **`zod-schemas.test.ts`** — recopiait localement `checkOutSchema`/`checkInSchema` au lieu d'importer les vrais schémas (dérive déjà réelle : le schéma réel de check-in a 3 champs désinfection absents de la copie). Schémas extraits dans `trips/schema.ts` et `trips/[id]/checkin/schema.ts` (un fichier `route.ts` Next.js ne peut exporter que des handlers HTTP, pas des consts arbitraires) et importés directement par le test et les routes.
- **`e2e/verify_user_deletion.test.ts` supprimé** — script de debug (pas un vrai test Playwright), doublon de `verify_user_deletion.spec.ts`, collecté par erreur par le glob `**/*.test.ts`.

## [4.8.9] — 12 août 2026

### ⚛️ Patterns Next.js 16 / React 19

Chapitre "Patterns Next.js 16 / React 19" de l'audit (`docs/code-review-2026-08-11.md`) — les points #3, #4 (déjà corrigés avec le chapitre précédent) et #11 (qualifié "pas une anomalie" par l'audit) sont hors scope.

- **Import valeur d'un module server-only (#1)** — `RenaultVehicleData` passé en `import type` sur les 4 sites qui l'utilisent uniquement comme type (`vehicles/page.tsx`, `vehicles/[id]/useVehicleDetail.ts`, `vehicles/[id]/VehicleDetailGrid.tsx`, `RenaultConnectBlock.tsx`), pour éviter que le client libSQL et les credentials Renault ne finissent dans le bundle client si une valeur venait un jour à être importée du même module.
- **Aucune error boundary (#2)** — nouveau `src/app/error.tsx` (bouton "Réessayer" + retour au dashboard) pour contenir les erreurs de rendu sans perdre toute la coquille applicative.
- **`exhaustive-deps` sans justification (#6)** — commentaires ajoutés sur les 3 sites signalés (`IncidentHistoryModal.tsx`, `QRCodeModal.tsx`, `BannersTab.tsx`), conformément à `.claude/rules/lint.md`.
- **`useSearchParams` sans `Suspense` (#7)** — `vehicles/[id]/page.tsx` et `NotificationBell.tsx` enveloppent désormais leur contenu dans une frontière `Suspense`, préventif pour une future activation de PPR/`cacheComponents`.
- **`<img>` sur un asset statique (#8)** — le logo de `qr/[token]/page.tsx` utilise désormais `<Image>` de `next/image`.
- **Timers de toast jamais nettoyés (#9)** — `qr/[token]/page.tsx`, `users/page.tsx`, `vehicles/[id]/page.tsx`, `ULsTab.tsx` : le timer précédent est annulé avant d'en poser un nouveau, deux toasts rapprochés ne se tronquent plus.
- **Effet avec sa propre sortie en dépendance (#10)** — `useVehicleDetail.ts` : l'effet Renault Connect suit le VIN déjà récupéré via une ref au lieu de lire `renaultData` dans sa garde, retirant la dépendance auto-référentielle sans désactiver le linter.

## [4.8.8] — 12 août 2026

### 🏗️ Qualité & Architecture

Derniers correctifs Moyenne/Faible du chapitre "Qualité & Architecture" — H1 reste volontairement exclu.

- **`fetch` sans vérification `res.ok` (M2)** — les listes peuplées via `.then(r => r.json())` sans contrôle de statut (utilisateurs, UL, historique désinfection/inventaire, stock faible, photos, catégories/stocks) journalisent désormais une erreur au lieu d'afficher silencieusement une liste vide en cas d'échec.
- **Lookups de rôle N+1 (M3)** — `/api/users/[email]` (PATCH) et `/api/users/[email]/ul` (PUT) : un seul `WHERE name IN (...)` batché au lieu d'une requête par rôle.
- **Couleur codée en dur cassant le dark mode (M4)** — badge Diesel de `VehicleBadges.tsx` : texte fixe `#374151` remplacé par `var(--text-secondary)`.
- **`fetch('/api/auth/session')` au lieu de `useSession` (M6)** — `qr/[token]/page.tsx` et `vehicles/[id]/useVehicleDetail.ts` migrés vers `useSession()`. `CheckOutModal.tsx` conservé tel quel : ce pattern est le comportement documenté pour les modals (`src/components/vehicle/CLAUDE.md`).
- **Client Google Drive reconstruit à chaque appel (M7)** — `getDriveClient()` met désormais en cache l'instance au niveau module (le token OAuth2 est rafraîchi automatiquement par `googleapis`, pas de risque de token périmé).
- **Modals sans fermeture au clavier (M8)** — nouveau hook `useEscapeKey()` (`src/lib/hooks/`) appliqué aux 32 modals du dépôt ; support d'un flag `enabled` pour les modals qui restent montés mais cachés (`isOpen`/`return null`) afin qu'Échap ne se déclenche pas alors qu'ils sont invisibles.
- **`CLAUDE.md` obsolète (L1)** — référence à `src/middleware.ts` corrigée en `src/proxy.ts`.
- **Erreurs silencieusement avalées (L2)** — `aide/page.tsx` et `UsersTab.tsx` journalisent désormais l'erreur au lieu d'un `.catch(() => {})` vide.
- **`console.log` verbeux (L4)** — `fetchInterceptor.ts` ne journalise plus le corps des requêtes interceptées en mode démo, uniquement la méthode HTTP.
- **`src/lib/stats.ts` mélangeait deux domaines (L5)** — scindé en `stats-trips.ts` (`buildTripWhere`, `fetchStatsData`) et `stats-expenses.ts` (`fetchExpenseStatsData`), imports mis à jour sur les 9 sites concernés.

## [4.8.7] — 12 août 2026

### 🏗️ Qualité & Architecture

- **Décomposition des 4 composants "Dieu" (M1)** — extraction de la logique data-fetching en hooks dédiés et d'une section UI par composant, conformément à la règle déjà documentée dans `src/app/CLAUDE.md` :
  - `src/components/admin/UsersTab.tsx` : 866 → 204 lignes (`UsersTable`, `modals/AddUserModal`, `modals/DeleteUserModal`, `modals/ManageUserULsModal`).
  - `src/app/qr/[token]/page.tsx` : 879 → 259 lignes (`CheckOutForm`, `CheckInForm`, `VehicleInfoCard`, `QRActions`).
  - `src/app/vehicles/[id]/page.tsx` : 1088 → 494 lignes (`useVehicleDetail`, `VehicleDetailHeader`, `ActiveTripBanner`, `MaintenanceBanner`, `VehicleDetailGrid`, `TripHistoryList`).
  - `src/app/expenses/page.tsx` : 1273 → 370 lignes (`useExpenseReports`, `ExpensesFilters`, `ExpensesTable`, `ExpenseDetailSidebar`, `ExpensePhotosPanel`, `JustificatifsModal`, `PhotoLightbox`).
  - Corrigé au passage : `EditRevisionIntervalsModal.tsx` appelait `PATCH /api/vehicles/${vehicle.id}` (UUID) au lieu de `${vehicle.name}` (attendu par la route) — "Véhicule non trouvé" à chaque modification des intervalles de révision. Bug pré-existant, découvert lors des tests manuels de cette phase.

## [4.8.6] — 12 août 2026

### 🏗️ Qualité & Architecture

- **Annulation de requête / garde de démontage (H3)** — introduction du pattern `AbortController` (absent du dépôt jusqu'ici) sur les effets de récupération de données susceptibles de se déclencher plusieurs fois pendant la vie d'un composant :
  - `/inventory` — corrige le bug concret identifié par l'audit : changer rapidement de stock pouvait afficher les catégories ou articles d'un stock précédemment sélectionné si sa réponse arrivait après. Corrige aussi au passage la dépendance d'effet trop large signalée en L3 (le chargement des stocks se re-déclenchait inutilement).
  - `/vehicles/[id]`, `/expenses` (liste + photos du rapport sélectionné), `/qr/[token]`, `/stats` (filtres) — même protection sur leurs requêtes principales.

## [4.8.5] — 12 août 2026

### 🏗️ Qualité & Architecture

Début des correctifs du chapitre "Qualité & Architecture" de l'audit (voir `docs/code-review-2026-08-11.md`) — H1 (store de jobs en mémoire) volontairement exclu, traité séparément plus tard.

- **Helper d'auth/autorisation partagé (H2)** — nouveau `src/lib/apiAuth.ts` (`unauthorizedResponse()` / `forbiddenResponse()`), reprenant le pattern déjà documenté dans `src/app/api/CLAUDE.md`. Migration d'environ 65 routes API : les 6+ variantes de corps de réponse générique (`Interdit`, `Non autorisé`, `Permissions insuffisantes`, `Accès refusé`, `Accès non autorisé`, `Forbidden`, `Unauthorized`...) sont désormais unifiées vers 2 corps canoniques (`'Non authentifié'` en 401, `'Interdit'` en 403). Les messages 403 métier spécifiques (ex. raisons de refus détaillées) sont conservés tels quels, simplement acheminés via le même helper. Vérifié : aucun code frontend ne teste le texte exact d'un corps d'erreur (uniquement le code de statut HTTP), migration donc sans risque de régression.

### 🔒 Sécurité

Correctifs des vulnérabilités **Moyenne** et **Faible** de l'audit de sécurité (voir `docs/code-review-2026-08-11.md`) — #10 à #15. Les #8 (cron fail-open) et #9 (admin local sans UL home) sont volontairement laissées de côté.

- **SQL non paramétré (#10)** — `/api/vehicles` (requête 100% construite par interpolation), la clause d'UL dans `/api/vehicles/calendar`, et les conditions `LIKE` de rôle dans `src/lib/onesignal.ts` sont désormais entièrement paramétrés.
- **Incohérence de gate stats (#11)** — `/api/stats/trips` (route morte, non appelée par le frontend) alignée sur la gate de `/api/stats` (la route réellement utilisée par la page `/stats`, qui autorise déjà CHVL/CHVPSP) — aucun changement sur `/api/stats` lui-même.
- **Validation Zod manquante (#12)** — schémas ajoutés sur `/api/ul/[id]` (PATCH), `/api/users/[email]` (PATCH), `/api/inventory/adjust`, `/api/inventory/stocks` (POST/PATCH) et `/api/inventory/batches` (PATCH). Les 8 autres routes citées par le rapport n'avaient en réalité aucun body à valider.
- **Changelog non authentifié (#13)** — `/api/changelog` exige désormais une session.
- **Logs Drive verbeux (#14)** — `/api/drive/upload`, `/api/expenses/upload` et `/api/drive/photos` journalisent un message d'erreur borné au lieu du corps de réponse Google brut.
- **Branchement PATCH ambigu (#15)** — `/api/reservations/[id]` : un body non vide est désormais strictement validé par Zod (clés inconnues rejetées en 400) au lieu d'être silencieusement réinterprété comme une action de validation en cas de champ mal orthographié.

## [4.8.3] — 11 août 2026

### 🔒 Sécurité

Correctifs des vulnérabilités **Haute** de l'audit de sécurité (voir `docs/code-review-2026-08-11.md`).

- **Comptes sans rôle traités comme actifs** — `isInactive([])` renvoyait `false`, permettant à tout compte `@croix-rouge.fr` auto-provisionné sans rôle de contourner la politique deny-by-default (checkout de véhicules, stats flotte, `/api/bugs/report`). Corrigé dans `src/lib/roles.ts` ; suppression d'une réimplémentation locale du même bug dans `/api/bugs/report`.
- **IDOR sur les exports PDF** — `/api/expenses/[id]/pdf` et `/api/incidents/[id]/pdf` ne vérifiaient que l'authentification, contrairement à leurs routes JSON équivalentes. Alignement sur le même contrôle de propriété (propriétaire, manager, ou trésorier pour les notes de frais en attente de paiement ; propriétaire ou admin pour les incidents).
- **Exposition de données inter-UL** :
  - `/api/vehicles/[id]` et `/api/vehicles/[id]/desinfections` renvoient désormais 404 (au lieu d'exposer les données) pour un véhicule d'une autre Unité Locale — l'accès via QR code reste inchangé, c'est un mécanisme séparé et volontairement sans restriction d'UL.
  - `/api/incidents/[id]` (GET) et `/api/renault/[vin]` vérifient désormais l'appartenance à l'UL avant de renvoyer les données (403 sinon).
- **Actions destructrices admin sans contrôle d'UL** — un `ADMIN` local pouvait modifier/supprimer des véhicules, purger l'historique de trajets, gérer la maintenance ou la checklist d'un véhicule appartenant à une autre Unité Locale. Ajout du contrôle d'appartenance UL (bypass réservé à `SUPER_ADMIN`) sur `/api/vehicles/[id]` (PATCH/DELETE), `/api/vehicles/[id]/trips` (DELETE), `/api/vehicles/[id]/maintenance` (POST), `/api/vehicles/[id]/maintenance/[recordId]` (DELETE) et `/api/checklist/[itemId]` (PATCH/DELETE).

## [4.8.2] — 11 août 2026

### 🔒 Sécurité

Correctifs issus d'un audit de sécurité complet du dépôt (voir `docs/code-review-2026-08-11.md`).

- **Injection SQL sur le calendrier des véhicules** (`/api/vehicles/calendar`) — le paramètre `vehicleId` était interpolé directement dans les requêtes SQL des réservations, trajets et maintenances, permettant de contourner l'isolation par Unité Locale (UL) et d'exposer les données de toutes les UL. Le filtre est désormais entièrement paramétré.
- **Lecture/écriture arbitraire sur Google Drive** — les routes `/api/drive/photos`, `/api/drive/photos/[fileId]`, `/api/drive/upload` et `/api/expenses/upload` acceptaient un `fileId`/`folderId` fourni par le client sans vérifier qu'il appartenait à une ressource (trajet, note de frais, incident) de l'UL ou du propriétaire de l'appelant :
  - Nouveau module `src/lib/driveAuth.ts` : résout le propriétaire réel (`Trip`/`IncidentReport` via l'UL du véhicule, `ExpenseReport` via propriétaire/manager/trésorier) d'un `driveFolderId` et vérifie les droits d'accès.
  - Lecture (liste de photos, téléchargement de fichier) et écriture (upload dans un dossier existant) renvoient désormais 403 si l'utilisateur n'est pas autorisé sur la ressource.
  - `/api/drive/upload` n'accepte plus de `rootFolderId` fourni par le client pour le flux mission — la racine est toujours résolue côté serveur, comme pour le flux véhicule.
  - `/api/trips/[id]/checkin` : le `driveFolderId` déjà enregistré en base fait désormais foi, le client ne peut plus l'écraser.

## [4.8.1] — 4 août 2026

### 🐛 Correctifs

- **Fix du chargement infini lors de l'affichage de toutes les notes de frais** — Résolution du blocage/timeout réseau sur l'écran des notes de frais (`/expenses`) lors du cochage du filtre *"Afficher toutes les notes (y compris déjà traitées)"* :
  - **Optimisation du payload SQL** : Remplacement de `SELECT er.*` par une sélection explicite de colonnes dans `/api/expenses`. Les chaînes base64 très lourdes des signatures manuscrites (`userSignature`, `validatorSignature`) des notes traitées ne sont plus rapatriées inutilement dans la liste globale, réduisant la réponse réseau de plusieurs mégaoctets à quelques kilo-octets (temps de réponse sous les 170ms).
  - **Requête SQL & Jointures** : Remplacement des `JOIN` stricts par des `LEFT JOIN` sur la table `User` afin d'éviter tout blocage si l'utilisateur lié n'est plus présent en base.
  - **Parsing & Sécurisation** : Sécurisation du parsing JSON du champ `items` et du montant `total` pour parer aux données `null`.
  - **Gestion réactive du chargement** : Déclenchement réactif de `fetchReports` sur les changements d'état (`viewScope`, `includeProcessed`) avec gestion de `tableLoading` sans démontage de la page.
- **Remise en attente de validation lors de la modification de date de réservation** — Lorsqu'une réservation déjà validée voit sa date ou son horaire modifié, son statut repasse automatiquement en attente de validation (`PENDING`).

### 📱 Améliorations & Responsivité

- **Ergonomie et responsivité de la Saisie de Note de Frais** — Optimisation complète de l'écran de saisie et de gestion des notes de frais pour l'utilisation sur mobile et tablette (`/expenses`) :
  - **Empilement intelligent des dépenses** : Ajustement automatique (`flex-wrap`) des lignes de dépenses sur les écrans mobiles (< 640px). La description s'affiche sur la première ligne et le montant avec bouton de suppression sur la seconde, garantissant un accès sans défilement horizontal ni tronquage de la partie droite.
  - **Actions et formulaires adaptés** : Mise en forme responsive du sélecteur d'imputation et alignement vertical des boutons d'action ("Annuler", "Brouillon", "Signer et Soumettre") sur mobile pour faciliter la saisie tactile.
  - **Grille adaptative & Modales** : Bascule dynamique en 1 colonne sur mobile pour la vue tableau et le panneau de détails, ajustement du défilement des modales et correction de l'échelle des coordonnées tactiles du canvas de signature manuscrite Yousign.

## [4.8.0] — 28 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Bandeaux de communication administrables** — Outil dans le menu Administration (`/users`) permettant de configurer des bandeaux d'information affichés en haut de l'application.
  - **Permissions & Scoping** : accessible aux rôles `SUPER_ADMIN`, `ADMIN`, `PRESIDENT` et `CADRE`. Les `SUPER_ADMIN` peuvent créer des bandeaux communs à toutes les ULs (`is_global`), tandis que les autres rôles sont restreints à leur Unité Locale.
  - **Ciblage par page** : possibilité de diffuser le bandeau partout (`ALL`), ou uniquement sur les pages Véhicules (`VEHICLES`), Missions (`MISSIONS`) ou Inventaire (`INVENTORY`).
  - **Pagination intelligente** : en cas de pluralité de bandeaux actifs sur le même écran, une barre de pagination (`‹ 1/N ›`) s'affiche automatiquement dans le bandeau pour naviguer entre les messages.

## [4.7.0] — 27 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Notion de DT de rattachement pour les ULs** — Ajout d'une notion de Délégation Territoriale (DT) de rattachement pour les Unités Locales (ex: DT 75, DT 69).
  - Gestion du champ `dtCode` dans les formulaires d'administration des ULs (création et édition).
  - Badges visuels DT sur les cartes des ULs dans l'onglet Administration.
- **Vision DT de la Flotte de Véhicules & Calendrier** — Bascule d'affichage "Vue UL / Vue DT" sur le tableau de bord des véhicules pour les utilisateurs disposant du rôle `DT` :
  - Consultation globale de la flotte et du calendrier de toutes les ULs rattachées à la même DT.
  - Mode lecture seule complet appliqué à la vision DT (désactivation des emprunts, restitutions, incidents, maintenances et réservations cross-UL avec bannière d'information).
- **Réservations récurrentes** — Possibilité de créer une série de réservations récurrentes pour un véhicule depuis la fiche véhicule.
  - **Toggle de récurrence** dans la modale `+ Réserver` : activer le mode récurrence remplace le formulaire date/heure classique par un panneau dédié.
  - **Sélection des jours** : cases à cocher pour choisir un ou plusieurs jours de la semaine (Lundi, Mardi, … Dimanche).
  - **Plage horaire** : saisie des heures de début et de fin valable pour chaque occurrence.
  - **Période de récurrence** : date de premier et dernier passage, avec une limite maximale de **6 mois** à partir de la date du jour.
  - **Résumé humain** en temps réel : _"Tous les Lundi et Mercredi de 08:00 à 12:00 jusqu'au 31/01/2027 (12 occurrences)"_.
  - **Insertion partielle** : les créneaux en conflit avec une réservation existante sont automatiquement ignorés. Un bandeau d'alerte liste les dates skippées.
  - **Badge 🔁 Récurrente** visible sur chaque occurrence dans la liste des réservations.
  - **Annulation groupée** : bouton `🔁✕ Annuler tout` pour supprimer toutes les occurrences **futures** d'une même récurrence en une seule action.
  - Les occurrences individuelles restent modifiables et supprimables indépendamment.
  - Migration DB : ajout de la colonne `recurrenceGroupId` sur la table `Reservation` (index inclus).

### 🐛 Correctifs

- **Rafraîchissement automatique du calendrier lors du changement d'UL** — Le calendrier des véhicules se rafraîchit désormais automatiquement lors du changement d'Unité Logistique via le sélecteur d'UL.

## [4.6.0] — 22 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Déclaration d'incident via QR Code** — Possibilité pour tout utilisateur d'un QR Code de véhicule d'accéder au bouton "Déclarer un incident" et de remplir la modale de déclaration d'incident (avec génération PDF) directement sur la page QR Code.
- **Export des Statistiques de Frais (CSV & PDF)** — Export complet au format CSV et génération d'un rapport PDF officiel pour les statistiques de frais, avec filtres par période, isolation par UL et accès sécurisé réservé aux rôles gestionnaires (`PRESIDENT`, `TRESORIER`, `SUPER_ADMIN`).
- **Support des justificatifs PDF (Notes de frais)** — Prise en charge des fichiers PDF en tant que justificatifs de dépenses avec aperçu en icône et ouverture/téléchargement depuis la modale dédiée.
- **Onglets Statistiques (Véhicules & Frais)** — Organisation de la page des statistiques en onglets ("Véhicules" et "Frais"). Analyse complète des dépenses par mois, par bénévole et par imputation, avec accès restreint aux gestionnaires (`PRESIDENT`, `TRESORIER`, `SUPER_ADMIN`) et isolation par UL.
- **Notifications cloche pour les notes de frais (Président & Trésorier)** — Notification automatique dans la cloche d'alerte en haut à droite de l'application :
  - **Pour le Président (`PRESIDENT`)** : Lorsqu'une nouvelle note de frais est soumise pour validation.
  - **Pour le Trésorier (`TRESORIER`)** : Lorsqu'une note de frais avec demande de remboursement est validée et passe en attente de paiement.
- **Modale de mise en maintenance & Suivi des motifs** — Passage d'un véhicule en maintenance via modale avec date de début, date de fin optionnelle (ou "Date de fin inconnue") et motif explicatif.
  - Encadré d'information sur la fiche véhicule et affichage visuel différencié sur le calendrier (rouge plein / rouge pointillé).
  - Date de fin automatique lors de la remise en service du véhicule.
- **Imputation des dépenses (Notes de frais)** — Sélection de l'imputation de la dépense (`DLUS`, `DLAS`, `UL`, `Autre`) avec saisie libre en cas de choix "Autre".
- **Génération PDF Note de frais conforme (C2 INTERNE) & Signatures Yousign** — Génération du PDF officiel de note de frais respectant le modèle C2 INTERNE avec signatures électronique et manuscrite style Yousign du demandeur et du responsable, et tampon officiel de l'UL.
- **Refus de la note de frais avec commentaire** — Possibilité pour les valideurs (`SUPER_ADMIN` ou `PRESIDENT`) de refuser une note soumise en joignant obligatoirement un commentaire explicatif.
- **Rôle Trésorier (`TRESORIER`) & Workflow de paiement** — Rôle centralisé `TRESORIER` avec accès aux notes en attente de paiement et possibilité d'indiquer les notes comme payées (`traité`).
- **Pagination et tri interactif du tableau de notes de frais** — Tri ascendant/descendant interactif sur toutes les colonnes et barre de pagination configurable (5, 10, 25, 50 par page).

### 🐛 Corrections & Améliorations

- **Affichage de la cloche pour tous les utilisateurs actifs** — Modification de la `Navbar` pour afficher la cloche de notification à l'ensemble des rôles d'utilisateurs actifs (Présidents, Trésoriers, Cadres, Chauffeurs) et non plus uniquement aux administrateurs.
- **Fonctionnement des notifications in-app sans OneSignal** — Prise en charge intégrale de la création et du traitement des notifications in-app en base de données, même lorsque l'intégration OneSignal est absente ou désactivée (ex: environnement Preview ou local).

## [4.3.0] — 19 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des Notes de Frais (Frais)** — Ajout d'un module complet de gestion des notes de frais accessible via un nouvel onglet "Frais" dans la navbar.
  - Saisie dynamique des lignes de dépenses avec calcul en temps réel du total.
  - Option de remboursement commutable et téléversement de justificatifs photo dans un dossier parent dédié sur Google Drive.
  - Déclaration sur l'honneur obligatoire en l'absence de justificatif papier.
  - Possibilité de sauvegarder au format brouillon, de modifier les brouillons existants et de les soumettre.
  - Validation des notes de frais par les rôles d'administration (`PRESIDENT` et `SUPER_ADMIN`).
  - Mock de l'intégration Google Drive en environnement de prévisualisation (preview) pour éviter les dépendances externes.

## [4.2.0] — 19 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Bypass QR Code — Accès véhicule sans restriction d'UL** — Génération d'un lien unique `/qr/[token]` par véhicule permettant à tout utilisateur connecté d'effectuer un emprunt ou un retour, indépendamment de son Unité Locale ou de son rôle chauffeur. Interface épurée dédiée hors dashboard et possibilité de régénérer le token (réservé aux rôles d'administration).
- **Gestion multi-stocks par onglets** — Ajout d'onglets dans le module d'inventaire pour gérer séparément plusieurs stocks, avec prise en charge du dark mode et compatibilité avec le rôle `SUPER_ADMIN`.
- **Édition des réservations & Chauffeur non décidé** — Possibilité d'éditer les réservations existantes et sélection du statut "CH (Chauffeur non décidé)" lors de leur création ou modification.
- **Modification des informations de prise d'emprunt** — Autorisation pour les administrateurs et super-administrateurs de modifier les détails de départ (compteur, carburant, remarques) d'un emprunt en cours de trajet.

### 🐛 Corrections & Améliorations

- **Défilement du calendrier sur mobile** — Ajout d'un défilement horizontal sur le calendrier mensuel des véhicules pour les écrans de petite taille.

## [4.1.0] — 19 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Calendrier des véhicules sur le Tableau de bord** — Ajout d'un calendrier mensuel sur le tableau de bord affichant les réservations (en jaune), les emprunts effectués (en vert) et les emprunts en cours (en vert avec bordure en pointillés).
- **Emplacements de parking par Unité Locale** — Gestion et attribution des places de parking par défaut spécifiques à chaque Unité Locale (`defaultParkingSpots`).
- **Suivi de la désinfection des véhicules** — Extension du suivi de la désinfection aux véhicules non-VPSP et affichage du statut dans l'historique des sorties.
- **Refonte des rôles & permissions** — Restructuration complète des niveaux d'accès (`SUPER_ADMIN`, `ADMIN`, `RESPO`, `CHVL`, `CHVPSP`, `GUEST`, `INACTIF`) avec mise à jour des droits.
- **Conformité RGPD & Mentions légales** — Implémentation des pages relatives à la gestion des données personnelles et aux mentions légales.
- **Isolation des notifications par UL** — Filtrage et ciblage des notifications de la flotte selon l'Unité Locale de l'utilisateur.
- **Gestion des numéros de téléphone des ULs & VCard** — Gestion dynamique des contacts de garde et export au format VCard.
- **Tutoriel interactif adaptatif** — Prise en charge des étapes adaptées selon le rôle de l'utilisateur dans le `GuidedTour`.
- **Support des environnements de prévisualisation (Preview Env)** — Intégration de la configuration d'environnement de prévisualisation.

### 🐛 Corrections & Améliorations

- **Plage visuelle des emprunts en cours** : Restriction de la plage visuelle d'un trajet en cours sur le calendrier pour qu'il s'arrête au jour courant et ne déborde plus sur les jours futurs du mois.
- **Gestion des sessions & rafraîchissement des rôles** : Correction du rafraîchissement en temps réel des rôles utilisateur depuis la base de données et préservation des droits d'administration.
- **Validation à la création des véhicules** : Vérification de l'unicité du nom et de la plaque d'immatriculation et rattachement automatique à l'UL active.
- **Correction du formulaire de restitution (CheckInModal)** : Résolution des problèmes de typage TypeScript et d'état initial lors du retour d'un véhicule.
- **Correction des étapes du GuidedTour** : Correctif pour la fonction `buildActiveSteps` afin d'éviter tout blocage lors de la visite guidée.

## [4.0.0] — 08 juillet 2026

### ✨ Nouvelles fonctionnalités

- **Feature Inventaire** — Ajout de la fonctionnalité de gestion d'inventaire.
- **Déclaration d'incident/accident/radar** — Ajout de la fonctionnalité de déclaration d'incident, d'accident et de radar.

### 🐛 Corrections

- **Gestion des rôles** — Correction des problèmes liés aux rôles des utilisateurs.

## [3.2.0] — 04 juin 2026

### ✨ Nouvelles fonctionnalités

- **Historique des incidents** — Ajout de l'historique des incidents d'un véhicule pour les administrateurs avec téléchargement du rapport PDF.

## [3.0.0] — 16 mai 2026

### ✨ Nouvelles fonctionnalités

- **Refonte complète de l'inventaire** — Passage à un système de gestion de stock global simplifié. L'inventaire est désormais centralisé (plus de gestion par sac/véhicule) et permet un suivi précis des quantités disponibles.
- **Historique des mouvements de stock** — Chaque modification de quantité est désormais enregistrée avec le nom de l'auteur, la date et une note, permettant une traçabilité complète (audit trail).
- **Interface d'administration de l'inventaire** — Nouveau tableau paginé avec recherche instantanée et boutons d'ajustement rapide (+/-) pour les administrateurs.

### 🔧 Changements

- **Restriction d'accès à l'inventaire** — L'accès au module d'inventaire et sa gestion sont désormais strictement réservés aux administrateurs.
- **Suppression du rôle Secouriste** — Le rôle "Secouriste" a été retiré du système car il n'est plus nécessaire avec la nouvelle structure des permissions.
- **Simplification du modèle de données** — Suppression des concepts de "Sacs", "Lots", "Groupes" et "Modèles de sacs" au profit d'un catalogue d'articles unique et efficace.

## [2.5.0] — 13 mai 2026

### ✨ Nouvelles fonctionnalités

- **Véhicules extérieurs & formulaire adaptatif** — Ajout de la possibilité de sélectionner "VL extérieure" ou "VPSP extérieur" lors de la saisie d'un compte rendu de mission. Les étapes de saisie du matériel et de l'oxygène sont désormais automatiquement masquées lors de l'utilisation de ces véhicules.

### 🐛 Corrections

- **Validation des permis à la création** — Correction d'un bug où les nouveaux profils de chauffeurs (CHVL/CHVPSP) avaient leurs papiers automatiquement validés. Désormais, ils sont correctement marqués comme non validés à la création, nécessitant une vérification manuelle.

## [2.4.9] — 12 avril 2026

### 🐛 Corrections

- **Correction des listes en mode démo** — Les listes de missions, véhicules et utilisateurs s'affichent désormais correctement même avec des paramètres de filtrage ou de pagination. L'intercepteur `fetch` a été assoupli pour supporter les query strings.
- **Missions de test** — Ajout d'un jeu de données initial pour les missions en mode démo afin que la page ne soit pas vide à la première activation.

## [2.4.8] — 12 avril 2026

### 🐛 Corrections

- **Statistiques en mode démo** — Correction d'un crash sur la page statistiques dû à des champs manquants dans le mock global (`completedTrips`, `totalIncidents`, etc.).

## [2.4.7] — 12 avril 2026

### 🐛 Corrections

- **Stabilité du Mode Démo** — Correction des erreurs `filter is not a function` dues à des formats de réponse API incorrects. Le mode démo respecte désormais strictement les structures de données attendues par le frontend (tableaux vs objets).
- **Réinitialisation des données** — Ajout d'un bouton "Réinitialiser" dans la bannière démo pour effacer le stockage local et repartir sur une base propre en cas de corruption de données.

## [2.4.6] — 12 avril 2026

### 🔧 Changements

- **Validation automatique des permis en démo** — En mode démo, le contrôle des permis de conduire renvoie désormais systématiquement un statut valide. Cela évite l'affichage de bannières d'alerte ou le blocage des fonctionnalités d'emprunt pour les utilisateurs dont les papiers réels seraient en attente de validation.

## [2.4.5] — 12 avril 2026

### 🐛 Corrections

- **Mode Démo Robuste** — Correction du crash lors de la consultation des détails d'un véhicule en mode démo (gestion correcte des identifiants par nom).
- **Parité Fonctionnelle** — Ajout de la gestion complète des missions, de l'historique de maintenance, des statistiques et de la télémétrie Renault simulée dans le mode démo.
- **Isolation Totale** — Simulation du contrôle des permis pour garantir une expérience fluide même pour les utilisateurs ayant des papiers à régulariser dans le monde réel.

## [2.4.4] — 12 avril 2026

### ✨ Nouvelles fonctionnalités

- **Mode Démo (Bac à sable)** — Ajout d'un mode démo accessible depuis la page Aide. Il permet de tester toutes les fonctionnalités (emprunt, rendu, missions) sans impacter la base de données réelle.
- **Isolation totale** — Les données du mode démo sont stockées uniquement dans le navigateur de l'utilisateur (LocalStorage). Les modifications faites par un utilisateur ne sont pas visibles par les autres.
- **Indicateur visuel** — Une bannière orange persistante s'affiche en mode démo pour éviter toute confusion avec l'environnement réel.
- **Moteur d'interception** — Utilisation d'un proxy `fetch` transparent pour simuler les réponses API sans changer le code métier.

## [2.4.3] — 12 avril 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau sélecteur de photos unifié** — Introduction d'un composant dédié proposant deux boutons distincts : "Appareil photo" et "Galerie". Cette approche garantit que l'utilisateur a toujours le choix, quel que soit son appareil ou son navigateur.
- **Interface cohérente** — Déploiement du nouveau sélecteur sur tous les points d'entrée : prise de véhicule, retour de véhicule, photos de mission et rapport signé.

## [2.4.2] — 12 avril 2026

### 🔧 Changements

- **Sélecteur de photos flexible** — Suppression de la contrainte d'appareil photo forcé sur mobile. Les utilisateurs peuvent désormais choisir entre prendre une photo en direct ou sélectionner des images depuis leur galerie.

## [2.4.1] — 1 avril 2026

### ✨ Nouvelles fonctionnalités

- **Signature du rapport de mission** — Nouvelle étape obligatoire lors de la saisie d'un compte rendu : l'utilisateur doit désormais joindre une photo du rapport papier signé par l'organisateur.
- **Capture simplifiée** — Prise de photo directe (mode scanner) ou import d'un document existant depuis la galerie.
- **Sauvegarde sécurisée** — Archivage automatique des rapports signés dans un espace de stockage partagé sécurisé.
- **Consultation immédiate** — Le rapport signé est désormais visible directement sur la fiche détaillée du compte rendu de mission.

### 🔧 Changements

- **Parcours utilisateur fluidifié** — Réorganisation des étapes du formulaire de mission pour intégrer la signature du rapport de manière intuitive.

## [2.4.0] — 29 mars 2026

### ✨ Nouvelles fonctionnalités

- **Environnement de développement modernisé** — Lancement automatique d'une base de données locale isolée et performante pour les tests.
- **Mode test avec données réelles** — Possibilité d'initialiser l'environnement de travail avec une copie sécurisée des données réelles pour des tests plus fiables.
- **Outils de gestion simplifiés** — Nouvelles commandes pour réinitialiser ou arrêter l'environnement de travail en toute simplicité.

### 🔧 Changements

- **Configuration adaptative** — L'environnement s'adapte désormais automatiquement au mode de travail sélectionné.
- **Documentation à jour** — Guide de contribution mis à jour avec les nouveaux outils de démarrage.

## [2.3.2] — 29 mars 2026

### 🐛 Corrections

- **Gestion des réservations** — Correction d'un problème permettant des conflits de réservation pour certains profils, y compris les administrateurs.

## [2.3.1] — 25 mars 2026

### ✨ Nouvelles fonctionnalités

- **Infos de désinfection persistantes** — Les informations de désinfection (responsable et numéro de lot) sont désormais sauvegardées et survivent au rechargement de la page pour pré-remplir le formulaire de retour.

### 🔧 Changements

- **Indicateur de saisie** — L'indicateur visuel des informations de désinfection reflète désormais l'état réel des données enregistrées en base.

### 🐛 Corrections

- _Aucune correction._

## [2.3.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des comptes inactifs** — Les utilisateurs dont le compte est désactivé sont désormais redirigés vers une page d'information dédiée.
- **Statistiques pour tous** — La section Statistiques & exports est désormais accessible à tous les membres actifs de l'organisation.

### 🔧 Changements

- **Clarification des rôles** — Le rôle "Invité" est renommé en "Inactif" pour plus de clarté.
- **Spécialisation des permis** — Les chauffeurs sont désormais restreints aux types de véhicules (VL ou VPSP) correspondant à leurs habilitations.
- **Légende des permissions** — Mise à jour des descriptions pour mieux refléter les accès réels aux statistiques et à l'inventaire.
- **Sécurité des réglages** — L'accès à la configuration avancée des menus est désormais réservé aux administrateurs.

### 🐛 Corrections

- _Aucune correction._

## [2.2.0] — 22 mars 2026

### ✨ Nouvelles fonctionnalités

- **Accès dédié aux missions** — Nouveau rôle permettant aux responsables de gérer les comptes rendus de mission de manière isolée.
- **Contrôle d'affichage des menus** — Les administrateurs peuvent désormais activer ou masquer chaque menu de la navigation pour les utilisateurs.
- **Page Administration unifiée** — Refonte de la page de gestion regroupant désormais les utilisateurs et le paramétrage des menus.

### 🔧 Changements

- **Attribution automatique du rôle Secouriste** — Simplification de la gestion des droits avec l'attribution automatique du rôle de base lors de la création d'un compte.
- **Accès Inventaire** — L'accès aux fiches d'inventaire nécessite désormais explicitement le rôle correspondant pour plus de sécurité.

### 🐛 Corrections

- _Aucune correction._

## [2.1.0] — 20 mars 2026

### ✨ Nouvelles fonctionnalités

- **Photos de communication** — Possibilité d'ajouter des photos du poste ou de l'équipe (jusqu'à 10) lors de la saisie d'un compte rendu de mission.
- **Galerie photos intégrée** — Visualisation directe des photos de communication sur la page de détail du compte rendu.

### 🔧 Changements

- **Formulaire de mission enrichi** — Ajout d'une étape optionnelle dédiée aux photos en fin de saisie.

### 🐛 Corrections

- _Aucune correction._

## [2.0.2] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Traçabilité des validations** — Affichage du nom du validateur lors de la vérification des papiers d'un chauffeur.

### 🔧 Changements

- _Aucun changement._

### 🐛 Corrections

- _Aucune correction._

## [2.0.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Nouveau rôle Secouriste** — Création d'un profil dédié pour les bénévoles effectuant des missions sans conduite de véhicule.

### 🔧 Changements

- **Légende visuelle** — Mise à jour des couleurs et descriptions dans la gestion des utilisateurs.

### 🐛 Corrections

- _Aucune correction._

## [2.0.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Module Comptes Rendus de Mission (CRM)** — Saisie directe des rapports de mission dans l'application via un formulaire guidé.
- **Formulaire complet en 6 étapes** — Saisie détaillée de l'équipage, du matériel consommé, de l'oxygène et des incidents.
- **Tableau de bord des missions** — Liste filtrable des rapports pour les chauffeurs et les responsables.
- **Gestion simplifiée** — Possibilité pour les administrateurs de supprimer ou modifier les rapports erronés.

### 🔧 Changements

- **Navigation enrichie** — Ajout d'un lien direct "Missions" dans la barre de navigation.

### 🐛 Corrections

- _Aucune correction._

## [1.21.1] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Flexibilité des révisions** — Possibilité de modifier les dates d'immatriculation et les intervalles de maintenance sans recréer le véhicule.

### 🔧 Changements

- _Aucun changement._

### 🐛 Corrections

- _Aucune correction._

## [1.21.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation annuelle des papiers** — Mise en place d'un contrôle obligatoire de la validité du permis de conduire.
- **Alertes visuelles** — Bannière d'information indiquant le délai restant avant le blocage pour non-validation.
- **Blocage de sécurité** — Désactivation automatique des réservations si les papiers ne sont pas validés à temps.
- **Gestion déléguée** — Les responsables peuvent désormais valider les papiers des chauffeurs directement.

### 🔧 Changements

- **Suivi administratif** — Ajout d'un statut clair sur la validité des documents dans la fiche utilisateur.

### 🐛 Corrections

- _Aucune correction._

## [1.20.0] — 19 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi d'entretien visuel** — Indicateurs colorés pour le contrôle technique et les révisions à venir.
- **Historique de maintenance** — Journal complet des interventions effectuées sur chaque véhicule.
- **Configuration précise** — Paramétrage des intervalles de révision lors de l'ajout d'un véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.19.0] — 18 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion de la désinfection** — Suivi automatique de la désinfection périodique obligatoire pour les véhicules sanitaires (VPSP).
- **Indicateur de validité** — Décompte visuel en jours jusqu'à la prochaine désinfection obligatoire.
- **Formulaire de retour renforcé** — Saisie obligatoire des informations de désinfection lors des missions sanitaires.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.18.0] — 14 mars 2026

### ✨ Nouvelles fonctionnalités

- **Réservation pour tiers** — Les administrateurs peuvent désormais réserver un véhicule au nom d'un autre chauffeur.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.17.1] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Aide à la gestion** — Ajout d'une légende détaillée des rôles et des niveaux d'accès.

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Accès restreint** — Suppression de la création automatique de compte ; seuls les utilisateurs invités peuvent se connecter.

### 🐛 Corrections

- _Aucune correction._

## [1.17.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Suivi électrique** — Gestion de la capacité batterie et statistiques de consommation en kWh/100km pour les véhicules électriques.

### 🔧 Changements

- **Unités adaptatives** — Affichage dynamique des consommations en Litres ou en kWh selon le type de moteur.

### 🐛 Corrections

- _Aucune correction._

## [1.16.0] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Filtres de statistiques** — Nouveaux filtres par véhicule, chauffeur et type de mission.
- **Indicateurs de performance** — Taux d'utilisation, niveau moyen de carburant au retour et taux d'incidents précis.
- **Export PDF complet** — Rapport d'activité enrichi pour le partage des statistiques.

### 🔧 Changements

- **Tableaux enrichis** — Ajout de colonnes de performance dans le classement des chauffeurs.

### 🐛 Corrections

- _Aucune correction._

## [1.15.3] — 13 mars 2026

### ✨ Nouvelles fonctionnalités

- **Capacité de réservoir personnalisée** — Paramétrage précis pour chaque véhicule afin d'améliorer la fiabilité des calculs de consommation.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Précision du carburant** — Correction du calcul du pourcentage restant basé sur la capacité réelle.

## [1.15.2] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Calcul de consommation** — Les pleins de carburant et recharges ne faussent plus la moyenne de consommation.

## [1.15.1] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Messages personnalisés** — Diversification des messages humoristiques selon les habitudes des chauffeurs.

### 🐛 Corrections

- _Aucune correction._

## [1.15.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Amélioration de la stabilité** — Optimisation interne du code pour une application plus fluide.

### 🐛 Corrections

- _Aucune correction._

## [1.14.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- **Signalement de bug** — Bouton direct pour signaler un problème technique aux administrateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.13.0] — 12 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Protection des profils** — Renforcement de l'identification des utilisateurs contre les changements d'adresse email.

### 🐛 Corrections

- _Aucune correction._

## [1.12.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Saisie prédictive** — Pré-remplissage automatique du nom de la mission basé sur la réservation en cours.
- **Rapports PDF officiels** — Intégration du logo et mise en page professionnelle pour les exports.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Filtres de dates** — Correction de l'inclusion du dernier jour dans les statistiques.
- **Affichage des faits marquants** — Ajustement du seuil d'apparition des anecdotes sur les chauffeurs.

## [1.11.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Tableau de bord Statistiques** — Analyse visuelle de l'activité sur les 60 derniers jours (emprunts, kilomètres, incidents).
- **Anecdotes chauffeurs** — Section humoristique mettant en avant les habitudes marquantes des utilisateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.10.0] — 9 mars 2026

### ✨ Nouvelles fonctionnalités

- **Véhicules connectés** — Récupération automatique et en temps réel du kilométrage et de l'énergie.
- **Badge de vérification** — Indicateur visuel lorsque les données sont en cours de mise à jour.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.9.2] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- **Contrôle de propreté** — Nouveau critère d'état du véhicule lors du départ et du retour.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.9.1] — 8 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Accessibilité améliorée** — Interface optimisée pour la navigation au clavier et les lecteurs d'écran.

### 🐛 Corrections

- _Aucune correction._

## [1.9.0] — 7 mars 2026

### ✨ Nouvelles fonctionnalités

- **Jauge d'énergie visuelle** — Indicateur graphique interactif avec code couleur pour le carburant et la batterie.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.8.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Gestion des notifications push** — Contrôle simplifié de l'activation des alertes en temps réel.

### 🔧 Changements

- **Sécurité des alertes** — Notifications push réservées aux administrateurs et responsables.

### 🐛 Corrections

- **Navigation de secours** — Correction des redirections et du fonctionnement du tour guidé.

## [1.7.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Correction de données** — Possibilité de signaler une erreur de kilométrage ou de carburant lors de la prise d'un véhicule.
- **Historique paginé** — Navigation fluide dans les sorties passées du véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Fuseau horaire** — Toutes les heures sont désormais calées sur l'heure de Paris.

## [1.6.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- _Aucun changement notable._

### 🔒 Sécurité

- **Protection renforcée** — Mise en place de mesures anti-piratage et validation stricte des documents uploadés.

### 🐛 Corrections

- **Validation des formulaires** — Amélioration de la fiabilité des fenêtres de saisie.

## [1.5.0] — 6 mars 2026

### ✨ Nouvelles fonctionnalités

- **Validation des réservations** — Nouveau flux de demande d'emprunt avec approbation par les responsables.

### 🔧 Changements

- **Optimisation mobile** — Amélioration de l'affichage sur les petits écrans.

### 🐛 Corrections

- _Aucune correction._

## [1.4.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Checklists personnalisées** — Listes de contrôle sur-mesure obligatoires au départ et au retour de chaque véhicule.
- **Gestion simplifiée des comptes** — Création directe d'utilisateurs par les administrateurs.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Installation mobile** — Correction de l'affichage du bouton d'installation sur smartphone.

## [1.3.0] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **Système de réservation** — Calendrier complet pour planifier les utilisations futures.
- **Fluidité d'affichage** — Mise en place de structures animées pendant le chargement des pages.
- **Application mobile (PWA)** — Possibilité d'installer l'outil comme une application native sur Android et iPhone.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.2.3] — 5 mars 2026

### ✨ Nouvelles fonctionnalités

- **QR Codes véhicules** — Génération de codes à flasher pour accéder directement à la fiche d'un véhicule.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.2.2] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Easter egg Konami** — ↑ ↑ ↓ ↓ ← → ← → B A 🎮

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- **Reprise de navigation** — Redirection automatique vers la page demandée après la connexion.

## [1.2.1] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- _Aucune nouvelle fonctionnalité._

### 🔧 Changements

- **Recherche utilisateurs** — Ajout d'une barre de recherche et d'une pagination dans la gestion des comptes.

### 🐛 Corrections

- _Aucune correction._

## [1.2.0] — 4 mars 2026

### ✨ Nouvelles fonctionnalités

- **Guide de bienvenue** — Tutoriel interactif pour faciliter la première prise en main de l'application.

### 🔧 Changements

- _Aucun changement notable._

### 🐛 Corrections

- _Aucune correction._

## [1.1.0] — 2 mars 2026

### ✨ Nouvelles fonctionnalités

- **Détection de mouvements suspects** — Alertes automatiques en cas d'utilisation inhabituelle hors planning.

### 🔧 Changements

- **Notifications push** — Abandon des e-mails au profit des alertes directes sur smartphone.

### 🐛 Corrections

- _Aucune correction._

## [1.0.0] — 2 mars 2026

### 🚀 Lancement

- Connexion sécurisée avec les adresses Croix-Rouge française.
- Gestion complète du parc automobile et fiches d'état.
- Cycle d'emprunt et de retour guidé (photos, énergie, commentaires).
- Historique complet des sorties et gestion des conducteurs secondaires.
- Synchronisation automatique avec les données constructeur.
- Interface moderne avec mode sombre et design mobile.

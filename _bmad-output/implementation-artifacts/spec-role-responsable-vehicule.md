---
title: 'Rôle « Responsable véhicule » : droits admin sur les véhicules et notifications véhicule à la place du cadre'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: 'c50316a8d0e2e54c997423a33246eb5b380830f9'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La gestion de la flotte n'a pas de rôle dédié. Les droits complets sur les véhicules sont réservés à l'administrateur. Les notifications véhicule (demandes de réservation, problèmes au départ ou au retour, incidents) partent aux cadres, qui n'ont pas à les recevoir.

**Approach:**
- Créer le rôle `RESP_VEHICULE`, libellé « Responsable véhicule ».
- Dans son UL, ce rôle a sur les véhicules tous les droits d'un ADMIN. Il n'a aucun autre droit d'administration.
- Les notifications véhicule qui visaient CADRE visent désormais RESP_VEHICULE. CADRE n'en reçoit plus aucune, sauf la nouvelle demande de réservation (D5).
- CADRE perd ses droits sur les véhicules eux-mêmes : métriques, QR véhicule, édition. Il **garde ses droits sur les réservations** : validation, annulation, suppression, réassignation du conducteur, récurrences. Il accède aux statistiques véhicules. Pour emprunter, il lui faut CHVL ou CHVPSP ; pour modifier un véhicule, ADMIN ou RESP_VEHICULE.
- Un script de migration prod attribue RESP_VEHICULE à tout compte qui porte CADRE, partout où il le porte.

## Boundaries & Constraints

**Always:**
- Le rôle est évalué sur l'UL active, avec le même cloisonnement que l'ADMIN (`isSuperAdmin` ou même `ulId`).
- Un seul prédicat, `canManageVehicles`, est enveloppé dans `denyWhenInactive` : il vaut `isAdminOrAbove` ou `RESP_VEHICULE`. Il remplace les gardes véhicule `isAdminOrAbove` et les tests en ligne `includes('ADMIN')`.
- Un second prédicat enveloppé, `canSuperviseVehicles`, vaut `canManageVehicles` ou PRESIDENT. Il remplace `canAccessAdminPanel` sur les métriques et le QR véhicule. CADRE en est exclu.
- Un troisième prédicat enveloppé, `canManageReservations`, vaut `canSuperviseVehicles` ou CADRE. Il remplace `canAccessAdminPanel` sur la validation et la gestion des réservations.
- PRESIDENT garde ses droits véhicule actuels. Hors véhicules, CADRE garde tous ses droits : panneau d'administration, utilisateurs, missions, inventaire, uniformes, bandeaux, budgets.
- La migration est idempotente : dry-run par défaut, écriture avec `--apply`. Elle ne retire jamais CADRE.

**Never:**
- Ajouter RESP_VEHICULE à `canAccessAdminPanel`, à `isAdminOrAbove` ou aux menus Utilisateurs, Inventaire et Missions.
- Donner à RESP_VEHICULE des droits sur les notes de frais, le stock, les uniformes, les missions, les utilisateurs, les UL ou les réglages.
- Utiliser `LIKE` sur la CSV des rôles dans la migration : on découpe la CSV en JS et on compare exactement.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Édition véhicule | RESP_VEHICULE, véhicule de son UL, PATCH, DELETE, guide, maintenance, checklist, connexion | Autorisé, comme un ADMIN | N/A |
| Autre UL | RESP_VEHICULE, véhicule d'une autre UL | Refusé | 403 |
| Hors véhicules | RESP_VEHICULE sur /api/users, /api/expenses, l'inventaire | Refusé comme avant | 403 |
| Inactif | `['RESP_VEHICULE','INACTIF']` | Tout est refusé | 403 |
| Demande de réservation | Un chauffeur demande une réservation (simple ou récurrente) | Push à ADMIN, PRESIDENT, CADRE et RESP_VEHICULE de l'UL | N/A |
| Incident ou problème | Check-out ou check-in « Problème signalé », incident déclaré | Push à PRESIDENT et RESP_VEHICULE (et ADMIN là où il y était) ; pas à CADRE | N/A |
| Migration UL | `UserUL.roles = 'CADRE,CHVL'` | Devient `'CADRE,CHVL,RESP_VEHICULE'` | Relancer ne change rien |
| Migration globale | `UserRole` CADRE | Ajoute `UserRole` RESP_VEHICULE et la ligne `Role` `role-resp_vehicule` | INSERT OR IGNORE |
| Alertes flotte | Mise à jour manuelle km/carburant, alerte de désinfection VPSP, usage suspect | Push à ADMIN (et CHVPSP pour la désinfection) **et** à RESP_VEHICULE | N/A |
| Statistiques | RESP_VEHICULE ou CADRE ouvre /stats | Il voit l'onglet véhicules, mais pas l'onglet notes de frais | Les API `stats/expenses/*` restent en 403 |
| Cadre et réservation | CADRE seul valide, annule, supprime ou réassigne une réservation (ou une récurrence) | Autorisé, comme aujourd'hui | N/A |
| Cadre et véhicule | CADRE seul met à jour les métriques, régénère le QR véhicule, édite le véhicule | Refusé, et les boutons sont masqués | 403 |
| Cadre et emprunt | CADRE seul tente d'emprunter | Refusé, comme aujourd'hui (il faut CHVL ou CHVPSP) | Message d'éligibilité |
| Cadre chauffeur | `['CADRE','CHVL']` | Emprunte et réserve un VL comme un CHVL ; aucun droit de gestion | N/A |
| Président | PRESIDENT valide une réservation, met à jour les métriques | Autorisé, comme avant | N/A |
| Resp. véhicule et réservation | RESP_VEHICULE valide une réservation de son UL | Autorisé | N/A |

**Décisions (2026-10-23) :**
- **D1 — Alertes réservées à l'ADMIN :** RESP_VEHICULE reçoit aussi les alertes flotte qui ne visaient que l'ADMIN : `metrics`, désinfection dans `daily-alerts`, `daily-mileage-check`. L'ADMIN continue de les recevoir. Le récapitulatif de stock de `daily-alerts` n'est pas concerné.
- **D2 — Statistiques :** RESP_VEHICULE et CADRE accèdent à /stats pour les statistiques véhicules seulement. L'onglet et les API des notes de frais leur restent fermés.
- **D4 — Cadre (2026-10-23, révisée) :** le cadre perd ses droits sur les véhicules (métriques, QR, édition), mais garde tous ses droits sur les réservations (validation, annulation, etc.) et accède aux statistiques véhicules. Pour emprunter, il lui faut CHVL ou CHVPSP ; pour modifier un véhicule, ADMIN ou RESP_VEHICULE. Le président, non cité, garde ses droits véhicule.
- **D5 — Notification de réservation :** CADRE continue de recevoir la notification « nouvelle demande de réservation », simple ou récurrente. RESP_VEHICULE y est ajouté.
- **D6 — Légende des rôles :** `RoleLegend` décrit le nouveau rôle RESP_VEHICULE. La description de CADRE est mise à jour : réservations et statistiques véhicules, sans gestion des véhicules. Celles d'ADMIN et de PRESIDENT aussi, si elles parlent des véhicules ou des notifications.
- **D3 — Taille :** la spec est gardée complète (environ 2 400 tokens), en un seul livrable.

</frozen-after-approval>

## Code Map

**Rôles**
- `src/lib/roles.ts` : ajouter `RESP_VEHICULE` à `ROLES`, `MANAGEABLE_ROLES` (après CADRE) et `ROLE_LABELS`. Ajouter `canManageVehicles` (enveloppé). Ne pas toucher `canAccessAdminPanel` ni `isReadOnlyManager`.
- `src/__tests__/unit/roles.test.ts` : matrice AUTHORIZED/DENIED l.44-49, énumération des prédicats.
- Points d'enregistrement d'un rôle :
  - `src/components/users/RoleLegend.tsx` (D6 : nouvelle entrée RESP_VEHICULE, description CADRE révisée) (+ `AGENTS.md:19`, nombre d'entrées)
  - `src/auth.ts:36` `DEV_USERS`
  - `src/app/login/page.tsx:11`
  - `src/lib/preview-accounts.ts:55`
  - `scripts/seed-preview-users.{ts,sql}`
  - `scripts/setup-dev.ts:161` et les utilisateurs dev près de la l.960
  - `scripts/ensure-system-roles.ts`
  - `src/__tests__/integration/setup.ts:762`
  - `src/lib/demo/fetchInterceptor.ts:161`
- Identifiant `Role` : `role-resp_vehicule`. C'est celui qu'auto-crée `GET /api/users` (`src/app/api/users/route.ts:33`).

**Gardes API → `canManageVehicles`**
- `vehicles/route.ts:297`
- `vehicles/[id]/route.ts:217,357`
- `vehicles/[id]/guide/route.ts:86,171`
- `vehicles/[id]/maintenance-events/route.ts:28,120` et `[eventId]:47`
- `vehicles/[id]/maintenance/route.ts:89` et `[recordId]:19`
- `vehicles/[id]/trips/route.ts:18`
- `vehicles/[id]/incidents/route.ts:56`
- `vehicles/[id]/checklist/route.ts:72` et `[itemId]:25,100`
- `trips/route.ts:25`
- `trips/[id]/route.ts:15` et `desinf-pre:26`, `checkout:34`, `checkin:34`, `second-driver:37`
- `qr/[token]/checkin/route.ts:85`
- `incidents/[id]/route.ts:132,212`
- `src/lib/incidentAccess.ts:76,90` (pas la branche `isSuperAdmin` l.52)
- `src/lib/vehicleBorrowEligibility.ts:49`
- `src/lib/vehicleReservationEligibility.ts:54,111`
- Connexion constructeur : `vehicles/[id]/connection/route.ts:125` et `brand-credentials/route.ts:27`. On remplace `isAdmin` par `canManageVehicles` ; la branche inter-UL `brand-credentials:37` reste réservée au super admin.

**Gardes `canAccessAdminPanel` véhicule → `canSuperviseVehicles`** (CADRE en sort ; PRESIDENT et RESP_VEHICULE y sont)
- `vehicles/[id]/metrics/route.ts:26`
- `vehicles/[id]/qr-token/route.ts:81`

**Gardes `canAccessAdminPanel` réservation → `canManageReservations`** (CADRE, PRESIDENT et RESP_VEHICULE y sont)
- `vehicles/[id]/reservations/route.ts:117`
- `reservations/[id]/route.ts:34,132`
- `reservations/recurrence/[groupId]/route.ts:45,140`

**UI → `canManageVehicles`** (remplace `includes('ADMIN')` et `isAdminOrAbove` côté véhicule)
- `src/app/vehicles/page.tsx:40`
- `src/app/vehicles/[id]/page.tsx:152,489`
- `src/app/vehicles/[id]/` : `VehicleDetailHeader.tsx:152,161,169`, `VehicleDetailGrid.tsx:44`, `ActiveTripBanner.tsx:98,110,148`, `MaintenanceBanner.tsx:53`, `TripHistoryList.tsx:32`
- `src/components/vehicle/` : `VehicleNotes.tsx:26`, `VehicleBadges.tsx:26`, `TripItem.tsx:19`, `VehicleCalendar.tsx:103`, `VehicleConnectionBlock.tsx:38`
- `src/components/vehicle/` : `ReservationBlock.tsx:61-63` et `modals/ReservationFormModal.tsx:91-92` passent à `canManageReservations` ; `modals/QRCodeModal.tsx:232` passe à `canSuperviseVehicles`
- Commentaires qui citent `canAccessAdminPanel` à propos des réservations : `src/lib/vehicleReservationEligibility.ts:53`, `src/lib/reservationDriver.ts:6`, `trips/route.ts:100`
- Ne pas toucher aux gardes `canAccessAdminPanel` et `isReadOnlyManager` qui ne portent pas sur les véhicules : users, missions, uniformes, bandeaux, inventaire, QR d'UL.
- Ne pas modifier : `Navbar.tsx`, `GuidedTour.tsx`, `menuVisibility.ts`.

**Notifications**
- Demandes de réservation : on garde CADRE et on ajoute `ROLES.RESP_VEHICULE` (D5) : `vehicles/[id]/reservations/route.ts:261,375`
- Les autres envois remplacent CADRE par `ROLES.RESP_VEHICULE` :
- `trips/route.ts:256,279`
- `trips/[id]/checkin/route.ts:238`
- `src/lib/incidentNotifications.ts:44`
- Ajouts D1 (`ROLES.RESP_VEHICULE` ajouté aux rôles visés) :
  - `vehicles/[id]/metrics/route.ts:109`
  - `cron/daily-alerts/route.ts:111` (désinfection ; ne pas toucher l.138, le stock)
  - `cron/daily-mileage-check/route.ts:110` ; son pré-filtre global l.39 (`r.name = 'ADMIN'` → `IN ('ADMIN','RESP_VEHICULE')`)
- `src/lib/push.ts:22` et `src/lib/AGENTS.md:17` (docblocks). Aucun envoi hors véhicule ne vise CADRE.

**Statistiques (D2)** : ajouter `RESP_VEHICULE` et `CADRE` à la liste `allowed` de `src/app/stats/page.tsx:86`. L'onglet notes de frais reste gardé par `canViewExpensesStats` (l.55) et les API par `isExpenseManager`/`isTresorier` : n'y rien changer.

**Migration** : `scripts/add-expense-respo-step.ts` sert de modèle (`--env`, dry-run, `--apply`, vérification finale).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/roles.ts` + `src/__tests__/unit/roles.test.ts` : ajouter le rôle et les prédicats `canManageVehicles`, `canSuperviseVehicles` et `canManageReservations`, avec leurs tests. Vérifier que CADRE seul est refusé par les deux premiers et autorisé par le troisième.
- [x] Tests d'intégration : sur les métriques et le QR véhicule, les cas où CADRE est autorisé deviennent des 403. Sur les réservations, CADRE reste autorisé. Ajouter partout un cas PRESIDENT et un cas RESP_VEHICULE autorisés.
- [x] Gardes API et lib du Code Map : appliquer les substitutions. Pour les tests d'intégration, chaque famille de routes (véhicule, réservation, trajet, incident) reçoit un cas RESP_VEHICULE autorisé dans son UL, plus un cas 403 dans une autre UL. Ajouter aussi un cas 403 sur `/api/users`.
- [x] UI du Code Map : appliquer les substitutions.
- [x] Notifications : ajouter RESP_VEHICULE aux deux demandes de réservation, en gardant CADRE. Dans les quatre autres envois, remplacer CADRE par RESP_VEHICULE et vérifier dans les tests que CADRE n'est plus visé. Ajouter les envois D1 et la liste des stats (D2).
- [x] Points d'enregistrement du rôle (seeds, comptes dev et preview, démo, légende).
- [x] `scripts/add-resp-vehicule-role.ts` : insérer la ligne `Role`, ajouter RESP_VEHICULE aux `UserRole` des porteurs de CADRE et l'ajouter à chaque CSV `UserUL.roles` contenant CADRE. Lister les comptes concernés, puis vérifier après `--apply`.
- [x] `CLAUDE.md`, `AGENTS.md` : ligne des rôles et commande de migration. `CHANGELOG.md`, `package.json` et `package-lock.json` : version 5.31.0.

**Acceptance Criteria:**
- Given un compte RESP_VEHICULE sans autre rôle, when il ouvre une fiche véhicule de son UL, then il voit et peut utiliser toutes les actions d'un ADMIN (édition, maintenance, checklist, guide, QR, validation des réservations, clôture des trajets), sans voir les menus Utilisateurs, Inventaire ni Missions.
- Given un compte CADRE sans autre rôle, when il ouvre une fiche véhicule, then il voit les actions sur les réservations (valider, annuler, réassigner), mais aucune action sur le véhicule (édition, métriques, QR), et il peut ouvrir l'onglet véhicules de /stats.
- Given la migration lancée sans `--apply`, then rien n'est écrit et le plan liste les comptes et UL concernés.

## Implementation Notes

- **Sélecteurs de conducteur (décision du 2026-10-23, team lead).** Tous les sélecteurs de conducteur de l'UI véhicule lisent `GET /api/users?vehicleType=…` (ou `?drivers=true` pour /stats), gardé par `canAccessAdminPanel` : un RESP_VEHICULE seul aurait eu des listes vides. Le GET accepte désormais aussi `canManageVehicles || canManageReservations`, **uniquement** avec l'un de ces filtres : la liste est limitée à l'UL de session (appartenance `UserUL`) et réduite à `{ id, name, email }` (les seuls champs consommés par `ReservationBlock`, `ReservationFormModal`, `CheckOutModal`, `EditCheckOutModal`, `useVehicleDetail` et /stats). Ni `availableRoles`, ni rôles, ni données de permis. Sans UL de session (`default` ou absente) : liste vide. Sans filtre : 403, comme avant. Les appelants `canAccessAdminPanel` (dont CADRE) gardent la réponse complète, inchangée. `CheckInModal` et `DesinfPreCheckinModal` alimentent le sélecteur « Responsable de la désinf. » (`UserCombobox`, filtré sur la seule saisie), qui n'est pas forcément un chauffeur : `?drivers=true` aurait restreint la liste de l'ADMIN (régression). Décision (2026-10-23, team lead) : nouveau filtre `?ulMembers=true`, appelé par ces deux modales. Pour `canAccessAdminPanel`, il est ignoré (réponse complète, identique à l'appel sans filtre). Pour `canManageVehicles || canManageReservations` sans accès au panneau, il renvoie les membres de l'UL de session (`UserUL`), réduits à `{ id, name, email }`, liste vide si l'UL est `default` ou absente.
- **Cloisonnement par UL non ajouté (décision du 2026-10-23, team lead).** Les routes de réservation (`POST /api/vehicles/[id]/reservations`, `/api/reservations/[id]`, `/api/reservations/recurrence/[groupId]`) ne vérifient pas l'UL du véhicule, pour aucun rôle gestionnaire (ADMIN, CADRE, PRESIDENT, désormais RESP_VEHICULE). Même trou antérieur sur `trips/[id]` (DELETE, checkout, desinf-pre), `incidents/[id]` PATCH/DELETE, `POST /api/vehicles`, création de checklist, métriques et QR véhicule. Conformément à « même cloisonnement que l'ADMIN », aucun cloisonnement nouveau n'est introduit ; les tests de réservation ne couvrent que les cas autorisés dans l'UL. Le trou est consigné dans `deferred-work.md` par le team lead.
- **Trajet hors UL :** `POST /api/trips` refuse un véhicule d'une autre UL en **404** (indiscernable d'un identifiant inconnu, cf. `isOutsideUl`), pas en 403 ; le test l'épingle ainsi.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | blind | La migration donne à chaque cadre des droits admin sur les véhicules (escalade) | false | Voulu : l'intention gelée attribue RESP_VEHICULE à tout porteur de CADRE. Signalé à l'utilisateur dans la présentation. |
| 2 | blind | Le CHANGELOG se contredit (le cadre perd des droits, mais chaque cadre reçoit RESP_VEHICULE) | low | L'entrée « Reprise des cadres existants » explique déjà la reprise ; correction de formulation directe. → patch |
| 3 | blind | RESP_VEHICULE contourne le permis et le rôle chauffeur à l'emprunt | false | Même contournement que l'ADMIN (`isAdminForBorrow`), conforme à « tous les droits d'un ADMIN ». |
| 4 | blind, edge | Le trou de cloisonnement par UL s'étend aux RESP_VEHICULE | medium | Trou antérieur déjà consigné ; la population exposée s'élargit. → defer (complément) |
| 5 | blind, edge | La légende du PRESIDENT promet le kilométrage, mais l'UI n'offre pas le bouton | low | `VehicleDetailGrid` garde `canManageVehicles` (comportement antérieur : bouton ADMIN seul). Correction de la légende. → patch |
| 6 | blind, edge | Le commentaire de `vehicleReservationEligibility` annonce une parité avec `canManageReservations`, alors que le contournement suit `canManageVehicles` | low | Commentaire faux. → patch (commentaire) |
| 6b | edge | Un CADRE ou PRESIDENT sans rôle chauffeur ne peut pas créer de réservation pour autrui depuis l'UI | medium | Antérieur : le contournement était déjà `isAdminOrAbove`. → defer |
| 7 | blind, edge | Le pré-filtre de `daily-mileage-check` ne lit que `UserRole` : un RESP_VEHICULE posé par UL ne compte pas | medium | `adminEmails` ne sert qu'à la sortie anticipée l.44 ; le seed preview pose RESP_VEHICULE uniquement en CSV d'UL. → patch |
| 8 | blind, edge | `listMembersOfUl` filtre les chauffeurs sur `UserRole` global et inclut les INACTIF | low | Même sémantique que la branche ADMIN existante (filtre `UserRole`, pas d'exclusion INACTIF). → defer |
| 9 | edge | Un `vehicleType` qui n'est pas exactement VL ou VPSP donne un 403 au RESP_VEHICULE : sélecteurs vides | medium | `Vehicle.type` est un `z.string()` libre ; les appelants passent `vehicle.type`. → patch (branche gestionnaire de flotte, sur `isVpspVehicle`) |
| 10 | verif, edge | `src/app/qr/[token]/CheckInForm.tsx:66` appelle encore `/api/users` sans filtre : RESP_VEHICULE en 403, sélecteur obligatoire vide | medium | Code identique au `CheckInModal` corrigé. → patch + test |
| 11 | verif | Aucun test RESP_VEHICULE sur `connection` et `brand-credentials` (même UL, autre UL) | medium | Grep : aucun hit dans `vehicle-connection.test.ts`. → patch |
| 12 | verif, blind | Gardes `canManageVehicles` sans cas RESP_VEHICULE (guide, maintenance, checklist, trips/[id], qr checkin, incidents PATCH/DELETE…) | medium | Seules 4 routes sont testées. → patch (`it.each`) |
| 13 | verif | Aucun test de composant pour RESP_VEHICULE ni pour CADRE (QRCodeModal, VehicleDetailHeader…) | medium | Grep : aucun hit. → patch |
| 14 | verif | Le test de `CheckInModal` accepte n'importe quelle URL `/api/users` | low | `url.includes('/api/users')`. Resserrement direct. → patch |
| 15 | verif | La page /stats n'est testée que via le prédicat | low | Redirection client fine, prédicat testé. → defer (selon la disposition du relecteur) |
| 16 | blind | Aucun test des combinaisons `['CADRE','RESP_VEHICULE']` | false | Prédicats absorbants (`some`/`includes`) ; la combinaison INACTIF est testée. |
| 17 | blind | Le seed dev du cadre (`CADRE,CHVL`) diffère de `DEV_USERS` (`CADRE`) | low | Antérieur, outillage dev uniquement. Rejeté. |
| 18 | blind | La spec n'indique pas `canViewStatsPage` | false | Ajouté sur décision du team lead pour tester D2 ; la correction consisterait à éditer la spec. Rejeté. |
| 19 | blind | Le menu Statistiques peut être réglé sur `admin_only` | low | Réglage choisi par l'administrateur, comportement attendu. Rejeté. |
| 20 | blind | La migration ne compte pas `rowsAffected` par écriture | low | La vérification finale détecte toute écriture manquée et sort en 1. Rejeté. |
| 21 | edge | Affirmation « dans son UL » contredite par les routes non cloisonnées | medium | Même cause que #4. → defer |

## Design Notes

Les `includes('ADMIN')` en ligne ignoraient SUPER_ADMIN, qu'acceptait `isAdminOrAbove`. Les remplacer par `canManageVehicles` rend ces actions visibles au super admin : c'est voulu, et c'est cohérent avec l'API.

Ordre de déploiement : la migration doit tourner AVANT ou au moment du déploiement. Si le code est déployé sans elle, les notifications véhicule qui visaient CADRE ne partent à personne d'autre que PRESIDENT et ADMIN.

## Verification

**Commands:**
- `npm run lint` : 0 erreur, 0 avertissement.
- `npm run test` : suite verte.
- `npx tsx scripts/add-resp-vehicule-role.ts` sur la base dev : le dry-run liste les cadres seedés ; `--apply` puis une seconde exécution donne « Rien à faire ».

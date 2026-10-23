---
title: 'Contrôle du permis pour tous les emprunts et cloisonnement des actions à l''UL de l''utilisateur'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: 'b75824403d8c48fe04359333b52cc46f78e42bfa'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Plusieurs chemins permettent d'emprunter un véhicule sans contrôle des papiers : ADMIN, SUPER_ADMIN et RESP_VEHICULE en sont dispensés, tout comme les comptes sans rôle chauffeur. L'emprunt par QR ne vérifie rien du tout. Par ailleurs, de nombreuses routes de gestion ne vérifient pas l'UL : un gestionnaire peut agir sur les réservations, trajets, incidents, checklists, métriques, QR et exports de stats d'une autre UL.

**Approach:**
- Le contrôle des papiers s'applique à chaque emprunt, quel que soit le rôle.
- Toute action ou lecture de gestion est limitée aux données de l'UL active de l'utilisateur. Seul SUPER_ADMIN y échappe.

## Boundaries & Constraints

**Always:**
- **Contrôle des papiers** : `getLicenseStatus(...).blocked` est évalué pour chaque personne qui prend le volant, sans dispense par rôle :
  - `POST /api/trips` et `POST /api/qr/[token]/checkout` contrôlent le conducteur ;
  - `PATCH /api/trips/[id]/checkout` contrôle le nouveau conducteur s'il change ;
  - un second conducteur est contrôlé partout où il est désigné.
  - Un refus renvoie 403 avec le message existant. Un compte introuvable est refusé (pas d'ouverture par défaut).
- Côté client, l'éligibilité à l'emprunt (`vehicleBorrowEligibility`) bloque sur `licenseBlocked` pour tous. `/api/me/license-check` calcule `blocked` pour tous les comptes, plus seulement pour les chauffeurs.
- La dispense de rôle chauffeur des gestionnaires (un ADMIN peut prendre un VPSP sans CHVPSP) est conservée. Seule la dispense de papiers disparaît.
- **Cloisonnement par UL** : on utilise `isOutsideUl(roles, session.user.ulId, vehicle.ulId)` (src/lib/apiAuth.ts) et on répond **404** (convention existante). L'UL d'une réservation, d'un trajet, d'un incident ou d'un élément de checklist se résout par son `vehicleId` → `Vehicle.ulId`. Une session sans UL (absente ou `'default'`) est refusée, sauf SUPER_ADMIN.
- La vue DT (`GET /api/vehicles?view=dt`, `vehicles/calendar?view=dt`) reste inchangée.

**Never:**
- Retirer le contrôle des papiers dans un cas particulier.
- Modifier les réservations : elles ne sont pas un emprunt, et leur règle de papiers ne change pas.
- Répondre 403 pour un hors-UL : on répond 404, conformément à la convention existante.
- Lire l'UL depuis le corps de la requête.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Admin papiers expirés | ADMIN (ou RESP_VEHICULE, SUPER_ADMIN), papiers bloqués, POST /api/trips | Refusé, bouton d'emprunt bloqué | 403 |
| Non-chauffeur papiers bloqués | ADMIN sans CHVL, papiers non validés | Refusé | 403 |
| Emprunt QR | Chauffeur aux papiers bloqués, POST qr/[token]/checkout | Refusé | 403 |
| Papiers valides | ADMIN aux papiers valides prend un VPSP sans CHVPSP | Autorisé (dispense de rôle conservée) | N/A |
| Changement de conducteur | Un gestionnaire remplace le conducteur par quelqu'un aux papiers bloqués | Refusé | 403 |
| Second conducteur | Second conducteur aux papiers bloqués | Refusé | 403 |
| Compte introuvable | `session.user.id` absent ou sans ligne `User` | Refusé | 403 |
| Réservation hors UL | ADMIN de l'UL A valide, supprime ou modifie une réservation (ou une récurrence) d'un véhicule de l'UL B | Refusé | 404 |
| Trajet hors UL | Gestionnaire de l'UL A : DELETE trips/[id], checkout, desinf-pre, second-driver, checkin, refresh-renault sur un trajet de l'UL B | Refusé | 404 |
| Incident hors UL | PATCH ou DELETE incidents/[id] sur un véhicule d'une autre UL | Refusé | 404 |
| Véhicule hors UL | checklist GET/POST, metrics, qr-token GET/POST/DELETE, reservations GET sur un véhicule d'une autre UL | Refusé | 404 |
| Export stats | stats/csv et stats/pdf | Limités à l'UL de session | 400 si l'UL vaut `'default'`, comme stats GET |
| Super admin | SUPER_ADMIN sur n'importe quelle UL | Autorisé | N/A |
| QR d'une autre UL | Bénévole de l'UL A, QR d'un véhicule de l'UL B, papiers valides : emprunt, retour, incident | Autorisé, comme aujourd'hui | Papiers bloqués : 403 |

**Décisions (2026-10-23) :**
- **D1 — QR :** les parcours QR (`qr/[token]/*`) et `POST /api/incidents` restent ouverts hors UL : le QR physique fait foi. Le contrôle des papiers s'y applique.
- **D2 — Taille :** spec gardée entière (environ 2 300 tokens).

</frozen-after-approval>

## Code Map

**Permis**
- `src/lib/licenseStatus.ts` : `DRIVER_ROLES`, `isDriverRole` (dispense des non-chauffeurs, l.11 et l.35), `getLicenseStatus` (pure).
- `src/app/api/trips/route.ts` : `isAdmin = canManageVehicles` l.25 ; contrôle des papiers l.127-145 `if (!isAdmin && isDriverRole(roles))`, ouvert par défaut l.129 et l.136 ; dispense de rôle l.156 (à conserver) ; dispense du détenteur de réservation l.113 (à conserver) ; `secondDriverId` dans le corps (`schema.ts:12`).
- `src/app/api/qr/[token]/checkout/route.ts` : aucun contrôle des papiers ; le conducteur est `session.user.id` l.123.
- `src/app/api/trips/[id]/checkout/route.ts:61-68` : changement de `driverId`. `src/app/api/trips/[id]/second-driver/route.ts:47-55` : `secondDriverId`.
- `src/app/api/me/license-check/route.ts:30` : renvoie `blocked:false` pour les non-chauffeurs.
- Client : `src/lib/vehicleBorrowEligibility.ts`, retour anticipé l.77, `getBorrowDenialTitle` l.111, `getBorrowCtaState` l.176. Consommateurs : `VehicleDetailHeader.tsx`, `useVehicleDetail.ts`, `useBorrowEligibility.ts`, `QuickBorrowCta.tsx`.
- Tests à inverser :
  - `src/__tests__/integration/checkout.test.ts:385`
  - `src/__tests__/unit/vehicleBorrowEligibility.test.ts:35,134,160,369-373`
  - `src/__tests__/components/VehicleDetailHeader.test.tsx:112`
  - `e2e/checkout-checkin.spec.ts:9-12` (connexion en ADMIN, car les papiers du CHVL de dev sont expirés) : donner des papiers valides au compte de dev utilisé.

**Cloisonnement** (`isOutsideUl` → 404)
- Réservations : `vehicles/[id]/reservations/route.ts` (GET et POST), `reservations/[id]/route.ts` (DELETE, PATCH, PUT), `reservations/recurrence/[groupId]/route.ts` (DELETE, PATCH ; vérifier chaque véhicule du groupe).
- Trajets : `trips/[id]/route.ts` DELETE, `checkout`, `desinf-pre`, `checkin`, `second-driver`, `refresh-renault`.
- Incidents : `incidents/[id]/route.ts` PATCH et DELETE (réutiliser `isWithinUlScope` de `src/lib/incidentAccess.ts`).
- Véhicule : `vehicles/[id]/checklist/route.ts` GET et POST, `metrics/route.ts`, `qr-token/route.ts` (GET, POST et DELETE).
- Stats : `stats/csv/route.ts:82` et `stats/pdf/route.ts:20` (`fetchStatsData` sans `ulId`), en suivant `stats/route.ts`.
- Durcir le motif en ligne `!isSuperAdmin && session.user.ulId !== vehicle.ulId` (`undefined === undefined` passe), en le remplaçant par `isOutsideUl` :
  - `vehicles/[id]/route.ts:61,238,376`
  - `maintenance/route.ts:106`
  - `maintenance/[recordId]:35`
  - `vehicles/[id]/trips:31`
  - `checklist/[itemId]:38,117`
  - `desinfections:38`
  - `renault/[vin]:27`
- Déjà cloisonnés, à ne pas toucher : `guide`, `maintenance-events`, `POST /api/trips`, `connection`, `vehicles/[id]/incidents`, `incidents/[id]` GET et pdf, `stats` GET et `stats/trips`, GET/POST `/api/vehicles`.
- Tests : `seedVehicle` vaut `ul-paris-18` par défaut (`setup.ts:717`). Environ 100 tests utilisent des sessions sans `ulId`, dans `reservations`, `desinfPre`, `editCheckOut`, `trips-second-driver`, `trips-refresh-renault`, `vehicles-metrics`, `vehicles-qr-token`, `stats-csv`, `stats-pdf`, `checkin`, `checklist`, `desinf` et `repro_bug`. Ajouter `ulId: 'ul-paris-18'` à ces sessions, sans affaiblir les assertions.
- `_bmad-output/implementation-artifacts/deferred-work.md` : marquer comme résolues, sous les deux entrées « cloisonnement par UL », les routes traitées ici.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/licenseStatus.ts`, `src/app/api/me/license-check/route.ts` : supprimer la dispense des non-chauffeurs ; ajuster leurs tests unitaires et d'intégration.
- [x] `src/app/api/trips/route.ts`, `qr/[token]/checkout`, `trips/[id]/checkout`, `trips/[id]/second-driver` : contrôler les papiers du conducteur et du second conducteur, sans dispense et sans ouverture par défaut. Ajouter un test d'intégration par ligne « permis » de la matrice.
- [x] `src/lib/vehicleBorrowEligibility.ts` et ses consommateurs : bloquer sur `licenseBlocked` avant la dispense des gestionnaires ; inverser les tests listés.
- [x] Routes du Code Map « Cloisonnement » : ajouter ou durcir `isOutsideUl`. Pour chaque famille, ajouter un test hors UL (404), un test même UL (autorisé) et un test SUPER_ADMIN.
- [x] Tests existants : ajouter `ulId` aux sessions qui en manquent.
- [x] Seeds dev et e2e : donner des papiers valides au compte de dev qui emprunte dans `e2e/checkout-checkin.spec.ts`.
- [x] `CHANGELOG.md` (entrée 5.31.0 existante, section 🔒 Sécurité), `deferred-work.md` et les `AGENTS.md` qui décrivent les dispenses ou l'absence de cloisonnement.

**Acceptance Criteria:**
- Given n'importe quel rôle avec des papiers bloqués, when il tente d'emprunter par la fiche véhicule, l'emprunt rapide ou le QR, then le bouton est bloqué et l'API répond 403.
- Given un ADMIN ou un RESP_VEHICULE de l'UL A, when il appelle une route de gestion sur une donnée de l'UL B, then il reçoit 404 et rien n'est écrit.

## Implementation Notes

**Décisions :**
- **Garde partagée :** `src/lib/licenseGuard.ts` expose `isLicenseBlocked(userId)`. Elle est en lecture seule et fermée par défaut (id absent ou pas de ligne `User` → bloqué). Elle est utilisée par `POST /api/trips`, `qr/[token]/checkout`, `trips/[id]/checkout` et `trips/[id]/second-driver`. `DRIVER_ROLES` et `isDriverRole` sont retirés de `licenseStatus.ts`.
- **Second message de refus :** quand un gestionnaire désigne un autre conducteur, le 403 dit « Les papiers de ce conducteur n'ont pas été validés… ». « Vos papiers » serait faux pour lui.
- **`PATCH trips/[id]/checkout` :** seul un conducteur ou second conducteur *qui change* est contrôlé. Le conducteur en place n'est pas recontrôlé, pour qu'on puisse corriger un trajet dont les papiers ont expiré depuis la prise.
- **Client :** `getBorrowEligibility` renvoie `LICENSE_BLOCKED` aux gestionnaires dès que les papiers sont bloqués. L'ordre « rôle d'abord » des non-gestionnaires est inchangé. Sur la page QR, le bouton d'emprunt est bloqué (`useLicenseBlocked`).
- **Conducteurs et auteur hors cloisonnement :** le conducteur et le second conducteur du trajet échappent au cloisonnement sur `checkin`, `second-driver` et `refresh-renault`, et l'auteur sur `incidents/[id]` PATCH/DELETE. Sinon, un emprunt QR inter-UL (D1) ne pourrait plus être rendu ou complété depuis l'appli. Les gestionnaires d'une autre UL reçoivent 404.
- **Hors-UL harmonisé en 404 :** les routes durcies qui répondaient 403 hors UL (`vehicles/[id]` PATCH/DELETE, `maintenance`, `maintenance/[recordId]`, `vehicles/[id]/trips`, `checklist/[itemId]`, `renault/[vin]`) répondent désormais 404, conformément au « Never ».
- **Stats :** SUPER_ADMIN y est limité à son UL active, comme dans `GET /api/stats`.
- **Seed dev :** `admin@dev.local` a des papiers valides (`last_validation` = aujourd'hui) pour l'e2e.

**Surprises :**
- **Formulaires QR :** ils lisaient `GET /api/vehicles/[id]/checklist`. Le cloisonner aurait vidé la checklist pour un bénévole d'une autre UL, contre D1. J'ai ajouté `GET /api/qr/[token]/checklist` et une prop `qrToken` à `ChecklistItems`.
- **Tests sans ligne `User` :** la garde fermée par défaut casse tout test d'emprunt dont la session n'a pas de ligne `User`. Les suites existantes en avaient déjà une.

**Corrections avant revue (demandées par le team-lead) :**
- `LicenseBanner.tsx` s'affiche désormais pour tout compte dont les papiers sont invalidés ou bloqués, plus seulement pour CHVL et CHVPSP.
- `scripts/seed-preview-users.ts` et `.sql` valident les papiers des comptes preview à la date du jour, au lieu de la date figée `2026-07-10`. Le `.sql` les rafraîchit aussi via un `UPDATE`, car son `INSERT OR IGNORE` n'écrase pas les lignes existantes.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | blind | `UsersTable` masque « Valider les papiers » pour les non-chauffeurs : un admin bloqué ne peut plus être débloqué depuis l'UI | high | `UsersTable.tsx:68` filtre sur `DRIVER_ROLES` (`admin/types.ts:21`). → patch |
| 2 | blind, edge | Au premier passage après le déploiement, `license-check` invalide tous les comptes sans validation récente, y compris ceux qui ne conduisent jamais (le bandeau les relance) | medium | Bandeau élargi à tous les comptes (correction pré-revue). → patch : bandeau limité aux comptes qui peuvent emprunter (chauffeurs ou `canManageVehicles`), et note dans le CHANGELOG demandant de valider les papiers des gestionnaires avant la mise en production |
| 3 | blind | Un admin peut valider ses propres papiers (`validate-papers` ne vérifie que `canAccessAdminPanel`) | medium | Contourne « aucune dispense ». → patch : refuser l'auto-validation |
| 3b | blind | `validate-papers` n'est pas cloisonné par UL | medium | La gestion des utilisateurs est hors de l'intention, qui vise la faille des routes véhicule. → defer |
| 4 | blind, edge | L'éligibilité à la réservation change pour CADRE, PRESIDENT et TRESORIER | false | Un non-gestionnaire sans rôle chauffeur ne peut déjà pas réserver (`roleAllowed`) ; `ReservationBlock` dispense `canManageReservations`. |
| 5 | blind | Le sélecteur de second conducteur n'indique pas les papiers bloqués | low | Le serveur refuse avec un message explicite ; la correction ajouterait de la complexité. Rejeté. |
| 6 | blind, edge | `second-driver` revérifie un second conducteur inchangé, contrairement à `checkout` | low | Correction directe (comparer avec `trip.secondDriverId`). → patch |
| 7 | blind, edge, verif | Tests manquants : PATCH recurrence hors UL, PUT reservations/[id] hors UL, filtre UL du PDF de stats, second conducteur bloqué sur POST /api/trips, passage de `qrToken` par les formulaires QR, exceptions conducteur et auteur hors UL (checkin par le second conducteur, refresh-renault, DELETE incident), 5 handlers passés de 403 à 404 | medium | Vérifié par grep, aucune couverture. → patch |
| 8 | blind, edge | Titre de describe erroné (`POST` au lieu de `DELETE`) dans ul-scoping.test.ts | low | Correction directe. → patch |
| 9 | blind | Incident ou réservation dont le véhicule a été supprimé : inaccessible pour un admin de la même UL | maybe-false | Dépend de la cascade de suppression de `Vehicle` ; low si vrai. Rejeté. |
| 10 | blind | qr-checklist n'a pas de test `['INACTIF','CHVL']` | low | Ajout direct. → patch |
| 11 | blind | AGENTS.md obsolètes (`api/me`, `users`, `validate-papers`), casse « Cross-UL » | low | Fichiers de contexte agent. → defer |
| 12 | blind | Pas de test du bouton bloqué pour un ADMIN aux papiers bloqués dans `VehicleDetailHeader` | medium | Seul le helper est testé. → patch |
| 13 | blind, edge | `useLicenseBlocked` part de `false` : bouton cliquable jusqu'à la réponse ; message codé en dur | low | Le serveur refuse quand même ; ajouter un état de chargement augmente la complexité. Rejeté. |
| 14 | edge | La relance de setup-dev remet `last_validation` à NULL pour les comptes sans valeur | low | Outillage dev ; COALESCE direct. → patch |
| 15 | edge | `secondDriverId` inconnu → 403 « papiers » trompeur | low | Rare, message seulement. Rejeté. |
| 16 | verif | `isWithinUlScope` ne refuse pas une session `'default'`, contrairement à `isOutsideUl` | low | Écart avec la spec ; correction directe. → patch |

## Verification

**Commands:**
- `npm run lint` : 0 erreur, 0 avertissement.
- `npm run test` : suite verte.

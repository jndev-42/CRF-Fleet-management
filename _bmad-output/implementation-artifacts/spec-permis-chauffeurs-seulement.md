---
title: 'Validation des papiers réservée aux chauffeurs CHVL / CHVPSP'
type: 'bugfix'
created: '2026-11-12'
status: 'done'
baseline_commit: 'a18679dbc49a1db59a1ff1bbd9cc830e9bcbc097'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Depuis la v5.31, les papiers de tout compte qui peut emprunter sont contrôlés, gestionnaires compris, et un gestionnaire sans rôle chauffeur peut emprunter. Le délai de grâce démarre au premier passage de `license-check` (ou à la création du compte, quel que soit son rôle), et retirer CHVL/CHVPSP ne remet rien à zéro.

**Approach:** Seuls CHVL et CHVPSP sont soumis à la validation des papiers et peuvent emprunter. L'ajout d'un rôle chauffeur démarre le délai de grâce. Le retrait du dernier rôle chauffeur efface tout état de validation. Sans rôle chauffeur, admins compris : aucune validation, aucun emprunt.

## Boundaries & Constraints

**Always:**
- « Chauffeur » (pour l'état des papiers) = porte CHVL ou CHVPSP dans `UserRole` ou dans une ligne `UserUL.roles`, présence brute (INACTIF n'efface pas le rôle).
- Transition non-chauffeur → chauffeur : `papiers_valides = 0`, `last_validation = NULL`, `start_date_invalidation_process = aujourd'hui`. Ajouter CHVPSP à un CHVL ne change rien.
- Transition chauffeur → non-chauffeur : `papiers_valides = 0`, `last_validation = NULL`, `start_date_invalidation_process = NULL`.
- Création de compte : délai démarré seulement si les rôles initiaux contiennent CHVL/CHVPSP, sinon les trois colonnes à l'état « effacé ».
- Emprunt (`POST /api/trips`) : plus aucune dispense de rôle chauffeur pour les gestionnaires (CHVPSP pour un VPSP, CHVL sinon). La dispense de réservation détenue par un tiers reste pour les gestionnaires chauffeurs.
- `PATCH /api/trips/[id]/checkout` : un nouveau conducteur doit être chauffeur actif habilité au type (même prédicat que le 2ème conducteur), puis papiers non bloqués.
- `GET /api/me/license-check` pour un non-chauffeur : `{ required: false, validated: false, daysLeft: null, blocked: false }`, aucune écriture.
- Bandeau, colonne/bouton « Papiers » de la gestion des utilisateurs : chauffeurs seulement.

**Never:**
- Modifier les réservations (règles de rôle et de papiers inchangées).
- Lire le rôle chauffeur depuis le corps de la requête.
- Migration de données : l'état résiduel des non-chauffeurs est ignoré et sera réinitialisé par la transition s'ils deviennent chauffeurs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Ajout CHVL | ADMIN aux papiers validés hier, on lui ajoute CHVL | Validation effacée, grâce 14 j démarrée aujourd'hui, peut emprunter un VL pendant la grâce | N/A |
| Fin de grâce | CHVL, start_date = J-14, jamais validé | Emprunt refusé | 403 message existant |
| Retrait | CHVL validé, on retire CHVL | Trois colonnes effacées, plus de bandeau ni colonne Papiers | N/A |
| Admin sans rôle | ADMIN / SUPER_ADMIN / RESP_VEHICULE sans CHVL/CHVPSP, POST /api/trips | Refusé, bouton bloqué (ROLE_NOT_ALLOWED) | 403 |
| Admin CHVL face à VPSP | ADMIN + CHVL, véhicule VPSP | Refusé (VPSP_REQUIRES_CHVPSP) | 403 |
| Nouveau conducteur non chauffeur | PATCH checkout avec driverId sans CHVL | Refusé | 400 |
| Création compte non chauffeur | POST /api/users rôles [CADRE] | start_date NULL | N/A |
| QR non chauffeur | Compte sans CHVL/CHVPSP, POST qr/[token]/checkout | Autorisé, papiers non contrôlés (D1) | N/A |
| QR chauffeur bloqué | CHVL hors grâce, POST qr/[token]/checkout | Refusé | 403 |

**Décisions (2026-11-12) :**
- **D1 — QR inchangé :** le QR ne contrôle toujours aucun rôle. Les papiers n'y sont contrôlés que pour un chauffeur : `isLicenseBlocked` renvoie `false` pour un compte sans CHVL/CHVPSP (compte introuvable : toujours bloqué).
- **D2 — Taille :** spec gardée entière (~2 100 tokens).

</frozen-after-approval>

## Code Map

- `src/lib/licenseStatus.ts` -- `canBorrowVehicles` (driver ∨ `canManageVehicles`) : à remplacer par `isDriverRole` ou supprimer ; `getLicenseStatus` pure, inchangée.
- `src/lib/licenseGuard.ts` -- `isLicenseBlocked` : fermé par défaut si compte introuvable ; renvoie `false` si `holdsDriverRole` est faux (D1). Dans les routes appli, appelé après la garde de rôle.
- Nouveau `src/lib/licenseLifecycle.ts` -- `holdsDriverRole(exec, userId)` (UserRole ∪ CSV `UserUL.roles`, motif `',' || roles || ','`) et `applyDriverRoleTransition(exec, userId, wasDriver, isDriver, today)` ; `exec` = transaction en cours.
- `src/app/api/users/[email]/route.ts:144-161` et `src/app/api/users/[email]/ul/route.ts:295-310` -- remplacer le `UPDATE … WHERE last_validation IS NULL` : mesurer `wasDriver` avant les écritures, `isDriver` après, appliquer la transition dans la même transaction.
- `src/app/api/users/route.ts:233` -- création : `papiers_valides=0, start_date=today` inconditionnel → conditionné aux rôles chauffeur.
- `src/app/api/me/license-check/route.ts` -- court-circuit non-chauffeur (rôles en base via `holdsDriverRole`, INACTIF compris → non requis).
- `src/app/api/trips/route.ts:156-158` -- retirer `if (isAdmin) canBorrow = true` ; garder `isAdmin` pour la réservation l.113 ; placer la garde de rôle avant celle des papiers.
- `src/app/api/trips/[id]/checkout/route.ts:79-108` -- nouveau `driverId` : `secondDriverError`-like via `ELIGIBLE_DRIVER_PREDICATE` / `driverRoleForVehicleType` (`src/lib/eligibleDrivers.ts`).
- `src/lib/vehicleBorrowEligibility.ts:48-83,111-128` -- supprimer `isAdminForBorrow` pour le rôle ; conserver la dispense `isReservedByOther` des gestionnaires.
- `src/components/LicenseBanner.tsx:22`, `src/components/admin/UsersTable.tsx:68` -- `isDriverRole`.
- QR : `src/app/api/qr/[token]/checkout/route.ts` inchangé (la garde papiers devient role-aware via `isLicenseBlocked`) ; test « bypass volontaire » de `src/__tests__/integration/qr.test.ts` conservé, + test non-chauffeur aux papiers périmés autorisé.
- Tests à revoir : `vehicleBorrowEligibility.test.ts`, `VehicleDetailHeader.test.tsx`, `checkout.test.ts`, tests de `license-check`, `users*`, `LicenseBanner`, `UsersTable` ; e2e `e2e/checkout-checkin.spec.ts` (connexion ADMIN → compte de dev chauffeur aux papiers valides).
- `AGENTS.md` : `src/lib`, `api/me`, `api/users`, `api/trips`, `qr/[token]/checkout`, `vehicles/[id]`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/licenseLifecycle.ts` + tests unitaires -- helpers de transition -- source unique de la règle.
- [x] Routes `users` (création, édition globale, édition par UL) + tests d'intégration ajout / retrait / ajout CHVPSP à un CHVL / retrait d'un seul des deux.
- [x] `license-check` + test non-chauffeur sans écriture.
- [x] `licenseGuard.ts`, `trips/route.ts`, `trips/[id]/checkout` + tests matrice (QR compris).
- [x] `vehicleBorrowEligibility.ts`, `LicenseBanner`, `UsersTable` + tests inversés.
- [x] Seed dev/e2e, `AGENTS.md`, `CHANGELOG.md` (nouvelle version, user-centric), `package.json` + `package-lock.json`.

**Acceptance Criteria:**
- Given un compte sans CHVL/CHVPSP (admin compris), when il ouvre l'appli, then aucun bandeau papiers et aucun bouton d'emprunt actif.
- Given un chauffeur dont on retire puis réattribue CHVL, when on le réattribue, then le délai de grâce repart de la date de réattribution.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | blind | `second-driver` : un non-chauffeur passe, `isLicenseBlocked` étant faux pour lui | high | Seule garde de la route (`second-driver/route.ts:65`). → patch : `isEligibleDriver` |
| 2 | blind | `PATCH trips/[id]/checkout` : `secondDriverId` nouveau non contrôlé sur le rôle | high | Seul `driverId` passe par `isEligibleDriver`. → patch |
| 3 | verif | `media/upload` `canBorrow` garde la dispense gestionnaire | medium | `media/upload/route.ts:104`, aucun test gestionnaire. → patch + test |
| 4 | edge, blind | `holdsDriverRole` : `LIKE` insensible à la casse | low | Correction directe (`instr`). → patch |
| 5 | edge | `license-check` n'envoie pas `required: true` aux chauffeurs | low | Correction directe. → patch |
| 6 | blind | `POST /api/trips` : réservation tierce évaluée avant le rôle, message divergent de l'écran | low | Simple déplacement de bloc. → patch |
| 7 | blind | `users/page.tsx` : état local `start_date = today` pour tout nouveau compte | low | Correction directe. → patch |
| 8 | edge, blind | QR : un non-chauffeur emprunte sans contrôle des papiers ; CHANGELOG dit l'inverse | false (code) / low (CHANGELOG) | Décision D1. → patch du CHANGELOG seulement |
| 9 | blind | En-tête de `validate-papers/route.ts` obsolète | low | → patch |
| 10 | blind | Retirer puis réattribuer CHVL relance la grâce | false | Voulu par l'intention (« ajout du rôle = début de la grâce », retrait = effacement). |
| 11 | edge | Échange CHVL ↔ CHVPSP ne relance pas la grâce | false | Intention : ajouter CHVPSP à un CHVL ne change rien ; le compte reste chauffeur. |
| 12 | edge, blind | `UsersTable` lit les rôles globaux : CHVL sur une UL secondaire seule → bloqué sans bouton « Papiers » | medium | Préexistant (`canBorrowVehicles(user.roles)` avait le même trou). → defer |
| 13 | blind | `ELIGIBLE_DRIVER_PREDICATE` ne lit que `UserRole`, contrairement à `holdsDriverRole` | low | Prédicat préexistant. → defer |
| 14 | blind | Pas de liste avant déploiement des gestionnaires qui perdent l'emprunt | medium | Conséquence voulue ; outillage de déploiement. → defer |
| 15 | edge | Scripts d'import / rework des rôles sans `applyDriverRoleTransition` | low | Scripts ponctuels hors routes. → defer |
| 16 | blind | AGENTS.md / CLAUDE.md encore obsolètes (`trips` ordre des gardes, `second-driver`, `src/lib/CLAUDE.md`, `users`, `validate-papers`) | low | Fichiers de contexte agent. → defer |
| 17 | edge | `startsAsDriver` vrai si la ligne `Role` manque | low | Improbable (rôles seedés). Rejeté. |
| 18 | blind | Bandeau piloté par les rôles de session, pas de la base | low | Session relue à chaque rafraîchissement ; ajout de complexité. Rejeté. |
| 19 | blind | `validate-papers` accepte un non-chauffeur | low | Validation effacée à la transition ; ajouter un refus = nouvelle branche. Rejeté. |
| 20 | blind | Tests manquants divers (SUPER_ADMIN, INACTIF+CHVL, rollback, unit `isEligibleDriver`) | low | Couvert en intégration ; rejeté. |
| 21 | verif | `canReserveForSelf` laisse un gestionnaire réserver sans rôle chauffeur | false | Intention : « Modifier les réservations » exclu. |

**Suite (2026-11-12, demande utilisateur) :** les points 12 à 16 sont corrigés au lieu d'être reportés. Décision : un chauffeur d'une UL secondaire l'est forcément dans son UL principale. `holdsDriverRole` ne lit donc plus que `UserRole`, comme `UsersTable` et `ELIGIBLE_DRIVER_PREDICATE`. Ajout de `scripts/list-managers-without-driver-role.ts` (lecture seule, avant déploiement). `import_users.ts` applique la transition. Les AGENTS.md et CLAUDE.md sont réalignés.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement.
- `npm run test` -- suite verte.

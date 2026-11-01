---
title: 'Réservation pour autrui par un gestionnaire non chauffeur'
type: 'feature'
created: '2026-11-01'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: 'af0c0eaf5cfede839dd434b2b84d1d5a05288eef'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un cadre sans rôle CHVL/CHVPSP ne peut pas réserver depuis le dashboard `/vehicles`. La CTA « Réserver » affiche « Votre rôle ne vous permet pas de réserver de véhicule. », alors que le serveur l'autorise déjà à réserver au nom d'un chauffeur ou en « Chauffeur non décidé ». Le formulaire présélectionne « Moi-même », ce qui n'a pas de sens pour quelqu'un qui ne conduit pas.

**Approach:** Tout gestionnaire de réservations (`canManageReservations`) peut réserver tout véhicule de son UL, pour un chauffeur ou en « Chauffeur non décidé ». Réserver à son propre nom exige le rôle de conduite du type de véhicule, et le serveur le vérifie.

**Décisions (humain) :**
1. Population : tous les gestionnaires de réservations (CADRE, PRÉSIDENT, ADMIN, RESP_VEHICULE), pas seulement le cadre.
2. « Moi-même » est masqué dans les formulaires (création et édition) pour qui n'a pas le rôle de conduite du type. Le serveur refuse en 403 toute réservation à son propre nom sans ce rôle (création simple, récurrence, réassignation à soi en édition). `canManageVehicles` (ADMIN, RESP_VEHICULE) garde son bypass actuel.
3. Papiers : un gestionnaire de réservations réserve depuis le dashboard malgré ses propres papiers non validés, comme sur la fiche véhicule.

## Boundaries & Constraints

**Always:** L'emprunt (`vehicleBorrowEligibility.ts`, `POST /api/trips`, QR) ne change pas. La vue DT reste en lecture seule. Le cloisonnement UL et les 409 de chevauchement ne changent pas. Une seule règle client/serveur, dans un module importable côté client.

**Never:** Aucun nouveau rôle, aucune migration. Pas de changement des droits de validation et d'annulation. Pas de contrôle du rôle de conduite du chauffeur ciblé (la liste `GET /api/users?vehicleType=` le filtre déjà).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cadre non chauffeur, dashboard | `[CADRE]`, flotte VL + VPSP | CTA nominale, tous les véhicules dans le picker | N/A |
| Cadre CHVL face à un VPSP | `[CADRE, CHVL]` | réservable ; formulaire sans « Moi-même » | N/A |
| Cadre CHVL face à un VL | `[CADRE, CHVL]` | inchangé : « Moi-même » par défaut | N/A |
| Formulaire, gestionnaire non chauffeur du type | ouverture | pas d'option « Moi-même », présélection « Chauffeur non décidé » | N/A |
| Chauffeur simple face au mauvais type | `[CHVL]` face à un VPSP, dashboard ou fiche | non réservable (bouton « + Réserver » masqué sur la fiche) | N/A |
| POST pour soi sans rôle de conduite | `[CADRE]`, ni `onBehalfOfUserId` ni `isUnassignedDriver` (ou `onBehalfOfUserId` = son id), simple ou récurrence | aucune réservation créée | 403, message français invitant à choisir un chauffeur ou « Chauffeur non décidé » |
| POST pour autrui / non décidé | `[CADRE]`, VPSP | 201, VALIDATED | N/A |
| Cadre aux papiers non validés | `licenseBlocked = true` | CTA dashboard nominale | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/vehicleReservationEligibility.ts` -- règle dashboard. `getReservationEligibility` ne bypasse que `canManageVehicles` ; `getReservationCtaState` ne bypasse les papiers que pour `canManageVehicles`. Module client-safe (importe `@/lib/roles` seulement) : c'est ici qu'on ajoute le prédicat partagé.
- `src/app/vehicles/useReservationEligibility.ts`, `QuickReservationSection.tsx` -- consommateurs ; rien à changer a priori.
- `src/components/vehicle/modals/ReservationFormModal.tsx` -- formulaire de création partagé. `driverSelection` initialisé à `initialDriverSelection` (`''` = « Moi-même ») ; `UserCombobox` avec `defaultLabel="Moi-même"`.
- `src/components/ui/UserCombobox.tsx` -- l'entrée `value === ''` affiche `defaultLabel` (l. ~87). Il faut pouvoir la masquer.
- `src/components/vehicle/ReservationBlock.tsx` -- fiche véhicule. « + Réserver » ouvert à tous (l. ~275-285), bypass papiers via `canManageDriver` ; l'édition utilise `UserCombobox` « Moi-même » (l. ~461), avec `editDriverSelection` initialisé selon la réservation (l. ~140).
- `src/app/api/vehicles/[id]/reservations/route.ts` -- POST. `isVehicleHidden` lit déjà `Vehicle` (à étendre pour récupérer `type`). Résolution du chauffeur dans les deux branches (récurrence ~l.172, simple ~l.345). Aujourd'hui, aucune garde de rôle de conduite pour soi.
- `src/app/api/reservations/[id]/route.ts` -- PATCH édition (`isChangingDriver`, ~l.172). Vérifier comment « Moi-même » y est encodé et refuser la réassignation à soi sans rôle de conduite.
- `src/lib/roles.ts` -- `canManageReservations`, `canManageVehicles`, `isChvlDriver`, `isChvpspDriver`. `src/lib/vehicleBorrowEligibility.ts` -- `isVpspVehicle`.
- `src/components/users/RoleLegend.tsx:40` -- légende CADRE.
- Tests : `src/__tests__/unit/vehicleReservationEligibility.test.ts`, `src/__tests__/components/{ReservationFormModal,QuickReservationSection,QuickReservationCta}.test.tsx`, intégration des routes réservations (voir `src/__tests__/CLAUDE.md`).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/vehicleReservationEligibility.ts` -- exporter `canReserveForSelf(roles, vehicleType)` (= `canManageVehicles` ou cascade CHVL/CHVPSP actuelle) ; `getReservationEligibility` : `canManageReservations` ⇒ réservable ; CTA : bypass papiers sur `canManageReservations` ; mettre à jour le commentaire d'en-tête -- règle unique client/serveur.
- [x] `src/components/ui/UserCombobox.tsx` -- prop optionnelle (défaut : comportement actuel) qui masque l'entrée « défaut ». Quand `value === ''` et l'entrée est masquée, le déclencheur affiche un libellé « Choisir un chauffeur » -- réutilisé par les deux formulaires.
- [x] `src/components/vehicle/modals/ReservationFormModal.tsx` -- si `canManageDriver && !canReserveForSelf`, masquer « Moi-même » et présélectionner `'UNASSIGNED'` (sauf `initialDriverSelection` fourni) ; désélectionner « non décidé » ne doit pas revenir à « Moi-même ».
- [x] `src/components/vehicle/ReservationBlock.tsx` -- « + Réserver » affiché seulement si `getReservationEligibility(...).canReserve` ; édition : même masquage de « Moi-même ».
- [x] `src/app/api/vehicles/[id]/reservations/route.ts` -- après Zod, dans les deux branches : si la réservation est à son propre nom et `!canReserveForSelf(roles, vehicle.type)`, 403.
- [x] `src/app/api/reservations/[id]/route.ts` -- PATCH : réassignation à soi sans rôle de conduite ⇒ 403.
- [x] `src/components/users/RoleLegend.tsx` -- CADRE : « Réserver pour un chauffeur ou en « Chauffeur non décidé », sans rôle de conduite ».
- [x] Tests -- unitaires de la règle (matrice), composants (formulaire sans « Moi-même », présélection, combobox), intégration POST (403 pour soi, simple + récurrence ; 201 pour autrui / non décidé ; chauffeur CHVL pour soi sur un VL toujours 201) et PATCH (403 réassignation à soi).
- [x] `package.json`, `package-lock.json`, `CHANGELOG.md` -- 5.39.0, entrée en français centrée sur l'utilisateur.

**Acceptance Criteria:**
- Given un cadre sans rôle de conduite, when il réserve un VPSP depuis le dashboard en « Chauffeur non décidé », then la réservation est créée validée et apparaît sur la fiche du véhicule.
- Given un admin non chauffeur, when il ouvre le formulaire, then « Moi-même » reste proposé (bypass `canManageVehicles` inchangé).
- Given le parcours d'emprunt, when un cadre non chauffeur ouvre un véhicule, then « Emprunter » reste indisponible.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route |
|---|--------|---------|---------|-------|
| 1 | blind, edge | Édition d'une réservation à son propre nom par un gestionnaire `selfHidden` : le déclencheur affiche « Choisir un chauffeur », l'enregistrement conserve silencieusement le chauffeur actuel ; le bouton d'enregistrement n'a pas de garde | medium — vérifié `ReservationBlock.tsx:142-147,172` | patch |
| 2 | verif-gap | Le parcours d'édition `selfHidden` (pas de « Moi-même », pas d'`onBehalfOfUserId`) n'est couvert par aucun test | medium — pré-vérifié | patch |
| 3 | blind, verif-gap, edge | Le contrôle « pour soi » ne compare que `session.user.id` ; un id absent ou divergent contourne le 403 | medium — le contrôle repose sur un seul champ ; ailleurs, la propriété se décide par email | patch |
| 4 | blind | Pas de test pour un non-gestionnaire (CHVL face à un VPSP, 403) ni pour PRESIDENT pour lui-même | low — comportement voulu (matrice), test manquant | patch |
| 5 | blind, edge | Un gestionnaire aux papiers non validés peut se réserver lui-même depuis le dashboard ; aucune vérification serveur des papiers | medium — conforme à la décision 3 (« comme sur la fiche véhicule », qui le permettait déjà) ; l'absence de contrôle serveur des papiers est antérieure | defer |
| 6 | blind | Aucun contrôle serveur du rôle et des papiers du chauffeur ciblé | false — exclu par l'intention (Never) | rejet |
| 7 | blind | `'SELF'` en POST mène à un 404 trompeur | low — l'interface n'envoie jamais `'SELF'` en POST ; usage API seul | rejet |
| 8 | blind | Présélection calculée au montage seulement | false — le modal est monté au clic, avec rôles et type déjà connus | rejet |
| 9 | blind | « Valider » désactivé sans explication | low — le déclencheur affiche « Choisir un chauffeur » | rejet |
| 10 | blind | « Non décidé » stocke l'email du gestionnaire | false — comportement antérieur, déjà géré par `isUnassignedDriverName` | rejet |
| 11 | blind | `package-lock.json` hors du diff ; `canReserve` sans `isDtView` | false — lockfile vérifié en 5.39.0 ; la vue DT passe `readOnly` | rejet |
| 12 | edge | `hideDefault` avec un id absent de `users` | false — aucun appelant ne passe `initialDriverSelection` ; en édition, l'id provient de `users` | rejet |
| 13 | blind | Test 21 réécrit au lieu d'asserter le 403 | low — couvert par le test PRESIDENT ajouté au #4 | patch (#4) |
| 14 | edge | Commentaire de contrat supprimé (papiers pour soi) | false pour ce diff — même racine que #5 | defer (#5) |

## Verification

**Commands:**
- `npm run test` -- expected: tout passe
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run mcp:catalog` puis test `mcp-catalog` -- expected: inchangé (aucune route ajoutée)

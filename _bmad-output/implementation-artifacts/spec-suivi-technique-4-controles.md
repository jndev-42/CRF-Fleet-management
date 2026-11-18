---
title: 'Suivi technique 4/5 — contrôles à échéance et rendez-vous'
type: 'feature'
created: '2026-11-18'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/domain-model.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-suivi-technique-2-taches.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les échéances de contrôle technique, de révision et de désinfection sont calculées par véhicule mais rien ne dit lesquelles ont déjà un rendez-vous ni lesquelles approchent pour toute la flotte de l'UL.

**Approach:** Ajouter le sous-onglet « Contrôles » listant, pour chaque véhicule de l'UL, ses échéances calculées depuis les données existantes, avec leur état et la saisie d'un rendez-vous (date, garage pris dans les contacts), pouvant créer une tâche liée (CAP-10). Quatrième des 5 livrables de la PR v5.55.0.

## Boundaries & Constraints

**Always:**
- Même garde et cloisonnement UL que les livrables précédents.
- Échéances lues, jamais ressaisies : CT via `getNextCtDate`, révision via `getNextRevision` (date ; kilométrage restant affiché si connu), désinfection via `Vehicle.nextDesinfMaxDate` pour les véhicules dont `desinfTracking` est actif. Un véhicule sans donnée suffisante n'a pas l'échéance correspondante (pas de ligne).
- État d'une échéance, dans cet ordre : « RDV fixé » si un rendez-vous a une date ≥ aujourd'hui ; sinon « Dépassée » si l'échéance < aujourd'hui ; sinon « À dater ». Un rendez-vous passé reste visible (« RDV passé le … ») mais ne compte plus comme fixé. « Sous 30 jours » = échéance ≤ aujourd'hui + 30 j (dépassées comprises), indépendamment du rendez-vous. Dates comparées en jour calendaire Europe/Paris.
- Un seul rendez-vous par véhicule et par type de contrôle (création ou remplacement) : date requise, contact facultatif (de l'UL ou partagé), notes ≤ 500 ; suppression possible.
- Option « Créer une tâche » à la saisie : tâche « Rendez-vous <contrôle> — <véhicule> », échéance = date du rendez-vous, rattachée au véhicule et au contact, assignée à l'auteur.
- Filtres : Toutes, À dater, Sous 30 jours, Dépassées, RDV fixé (avec effectifs) ; tri par échéance croissante.
- Calcul dans une fonction pure testée unitairement, réutilisable par la vue d'ensemble (livrable 5).
- Écritures via `withAudit`, routes au catalogue MCP, table dans `FLEET_TRACKING_DDL` + migration + dev + tests ; CHANGELOG 5.55.0 complété.

**Never:**
- Ne pas modifier `getNextCtDate`, `getNextRevision` ni le calcul de désinfection ; ne pas écrire dans `Vehicle` ni `VehicleMaintenanceRecord`.
- Pas de notification ni de cron pour ces échéances (les alertes d'échéance existantes restent seules).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| CT dans 24 j sans RDV | aujourd'hui 18/11, échéance 12/12 | « À dater », compté sous 30 j | N/A |
| Désinfection dépassée | échéance 16/11 | « Dépassée », compté sous 30 j | N/A |
| RDV futur | RDV 28/11 sur une échéance au 05/12 | « RDV fixé », toujours compté sous 30 j | N/A |
| RDV passé | RDV 10/11, échéance 05/12 | « À dater », mention « RDV passé le 10/11 » | N/A |
| Désinfection non suivie | `desinfTracking` inactif | pas de ligne désinfection | N/A |
| Saisie RDV | PUT véhicule+type, date, contact | 200, remplace un RDV existant du même type | N/A |
| + tâche | option cochée | tâche créée, rattachée, assignée à l'auteur | N/A |
| Contrôle invalide | type inconnu / véhicule d'une autre UL / date mal formée | 400 | N/A |
| Rôle / session | CHVL ; anonyme | 403 ; 401 | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/maintenanceUtils.ts` -- `getNextCtDate(vehicle: {type, firstRegistrationDate}, records): Date|null` (VPSP +1 an, sinon +2 ; record CT = type 'CT' ou 'CT_REVISION') ; `getNextRevision(vehicle: {mileage, firstRegistrationDate, revisionKmInterval, revisionYearInterval}, records): {nextDate, remainingKm}|null`.
- `MaintenanceRecord` (`src/app/vehicles/[id]/types`) lu depuis `VehicleMaintenanceRecord(id, vehicleId, date, type, mileage)` ; colonnes `Vehicle.nextDesinfMaxDate`, `desinfTracking`, `lastDesinfDate`.
- Livrables 1-2 -- garde, contacts, création de tâche (`src/lib/fleetTracking/tasks.ts`), `FleetTrackingPanel`.
- Maquette : écran 5 de `_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/mockups/suivi-technique.html`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/fleetTracking/schema.ts` -- table `FleetControlAppointment` (id, ulId, vehicleId, controlType CT|REVISION|DESINFECTION, appointmentDate, contactId, notes, createdBy, createdAt, updatedAt ; unique vehicleId+controlType) ; migration, dev, `setup.ts`.
- [ ] `src/lib/fleetTracking/controls.ts` -- fonction pure `computeControls(vehicles, records, appointments, today)` → lignes {véhicule, type, échéance, km restants, rendez-vous, état, sous30j} ; chargement depuis la base pour une UL.
- [ ] `src/app/api/fleet-tracking/controls/route.ts` -- GET lignes + effectifs par filtre.
- [ ] `src/app/api/fleet-tracking/controls/appointments/route.ts` -- PUT (upsert, option `createTask`) ; `[id]/route.ts` -- DELETE.
- [ ] `src/components/fleetTracking/ControlsTab.tsx` + `AppointmentModal.tsx` -- tableau filtrable (cartes empilées sur mobile), « Fixer un RDV » / « Modifier », choix du garage parmi les contacts.
- [ ] Tests -- unitaires de `computeControls` (chaque ligne de la matrice, bascule de jour en Europe/Paris) ; intégration des routes (400/401/403, upsert, création de tâche) ; composant `ControlsTab` (filtres).
- [ ] `npm run mcp:catalog`, CHANGELOG 5.55.0 complété, `AGENTS.md`.

**Acceptance Criteria:**
- Given un rendez-vous saisi pour le CT du 75-184, when on filtre « À dater », then cette ligne n'y figure plus.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/unit/fleet-tracking-controls.test.ts src/__tests__/integration/fleet-tracking-controls.test.ts` -- expected: tout passe
- `npm run test` -- expected: suite complète verte

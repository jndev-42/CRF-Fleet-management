---
title: 'Suivi technique 4/5 — contrôles à échéance et rendez-vous'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: 'f57758dd1b1418e5cdf375fac20a07c06bb3720d'
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
- [x] `src/lib/fleetTracking/schema.ts` -- table `FleetControlAppointment` (id, ulId, vehicleId, controlType CT|REVISION|DESINFECTION, appointmentDate, contactId, notes, createdBy, createdAt, updatedAt ; unique vehicleId+controlType) ; migration, dev, `setup.ts`.
- [x] `src/lib/fleetTracking/controls.ts` -- fonction pure `computeControls(vehicles, records, appointments, today)` → lignes {véhicule, type, échéance, km restants, rendez-vous, état, sous30j} ; chargement depuis la base pour une UL.
- [x] `src/app/api/fleet-tracking/controls/route.ts` -- GET lignes + effectifs par filtre.
- [x] `src/app/api/fleet-tracking/controls/appointments/route.ts` -- PUT (upsert, option `createTask`) ; `[id]/route.ts` -- DELETE.
- [x] `src/components/fleetTracking/ControlsTab.tsx` + `AppointmentModal.tsx` -- tableau filtrable (cartes empilées sur mobile), « Fixer un RDV » / « Modifier », choix du garage parmi les contacts.
- [x] Tests -- unitaires de `computeControls` (chaque ligne de la matrice, bascule de jour en Europe/Paris) ; intégration des routes (400/401/403, upsert, création de tâche) ; composant `ControlsTab` (filtres).
- [x] `npm run mcp:catalog`, CHANGELOG 5.55.0 complété, `AGENTS.md`.

**Acceptance Criteria:**
- Given un rendez-vous saisi pour le CT du 75-184, when on filtre « À dater », then cette ligne n'y figure plus.

## Implementation Notes

- Schéma : `FleetControlAppointment` (UNIQUE vehicleId+controlType) + `idx_FleetControlAppointment_ulId`, ajoutés à `FLEET_TRACKING_DDL` / `FLEET_TRACKING_TABLES` ; la migration `scripts/add-fleet-tracking.ts` complète une base passée au livrable 3 (testé) ; dev par la boucle existante de `setup-dev.ts` ; truncate dans `setup.ts`.
- Découpage : `controls.ts` est **pur** (client-safe, importé par l'UI) ; le chargement depuis la base est dans `controlsStore.ts` (`loadUlControls`), selon la convention du module (`tasks.ts` / `tasksStore.ts`).
- Révision : `getNextRevision` renvoie « aujourd'hui » quand aucune date n'est calculable (intervalle en années absent, ou ni révision ni mise en circulation). Une telle révision n'a pas de ligne (révision au seul kilométrage comprise) — « sans donnée suffisante, pas de ligne ». Kilomètres restants affichés seulement si `revisionKmInterval` est configuré.
- Dates : échéances CT / révision converties en jour Europe/Paris (`parisDay`) ; `nextDesinfMaxDate` lu sur ses 10 premiers caractères ; `today` = jour Europe/Paris côté serveur, renvoyé par l'API.
- Filtres : « À dater » = état À dater (une échéance dépassée sans rendez-vous est dans « Dépassées », pas dans « À dater ») ; « Sous 30 jours » indépendant du rendez-vous. Pour le compteur « Contrôles à dater » de la vue d'ensemble (CAP-10 : « sans rendez-vous saisi »), le livrable 5 pourra compter `state !== 'SCHEDULED'`.
- PUT : un seul rendez-vous par couple (`ON CONFLICT … DO UPDATE`, identifiant et auteur conservés, UL réalignée sur celle du véhicule). Contact validé comme un rattachement de tâche (`firstInvalidLink` : UL ou partagé). Le garage n'est nommé dans la liste que s'il est encore visible depuis l'UL.
- « Créer une tâche » : `createTask` du livrable 2, assignée à `session.user.id` sans validation d'assignabilité ni notification (auto-attribution) ; les notes du rendez-vous deviennent la description. Rendez-vous et tâche ne sont pas dans la même transaction : un échec de la création de tâche laisse le rendez-vous enregistré (500). Supprimer le rendez-vous conserve la tâche.
- UI : sous-onglet « Contrôles » (`?onglet=controles`) entre Dossiers et Contacts ; table transformée en cartes empilées ≤ 720 px ; la modale affiche le garage d'origine même s'il n'est plus proposé.
- Après revue : `taskId` (nullable) sur le rendez-vous — une seule tâche liée, son échéance suit la date du rendez-vous ; colonne ajoutée par la migration (`ALTER TABLE`) si la table existe déjà. Échec de la tâche → 200 + `taskError`. Auteur assigné seulement s'il est assignable dans l'UL. Date du rendez-vous dans [aujourd'hui, + 5 ans] (400). Type sans échéance pour le véhicule → 400. Garage déjà enregistré accepté sans revalidation. Révision au kilométrage atteint (≤ 0 km) = « Dépassée » et « sous 30 jours ». Rendez-vous rattachés à l'UL ACTUELLE du véhicule (lecture, suppression). `nextDesinfMaxDate` horodaté ramené à son jour Paris.
- Vérification : `npm run lint` 0/0, `tsc --noEmit` propre ; tests unitaires, d'intégration et composants ajoutés (voir Verification). Non vérifié dans un navigateur.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|---|---|---|---|
| 1 | edge / vgap | Modifier un RDV dont le garage n'est plus visible → 400 à chaque enregistrement | medium | patch — contact inchangé accepté |
| 2 | edge / blind | RDV enregistré puis échec de création de tâche → 500 trompeur | medium | patch — succès avec avertissement |
| 3 | edge / blind | « Créer une tâche » à chaque enregistrement : doublons, échéance de tâche non mise à jour | medium | patch — lien `taskId` sur le RDV, case masquée si tâche existante, échéance suivie |
| 4 | edge | Auteur non assignable (SUPER_ADMIN hors UL) assigné quand même | low | patch — tâche non assignée dans ce cas |
| 5 | edge / blind | Date de RDV passée ou très lointaine acceptée | medium | patch — ≥ aujourd'hui, ≤ +5 ans, `min` côté client |
| 6 | edge / blind / vgap | Révision dépassée au kilométrage affichée « À dater » | medium | patch — `remainingKm ≤ 0` ⇒ Dépassée et sous 30 j |
| 7 | edge / blind | Révision au seul kilométrage sans ligne | medium | defer — pas de date d'échéance, présentation à définir |
| 8 | edge / blind | RDV sur un contrôle non applicable (désinfection non suivie) invisible | low | patch — PUT refuse un type sans échéance calculée |
| 9 | edge / vgap | Véhicule changé d'UL : RDV filtré par `a.ulId` | low | patch — filtrer par UL du véhicule, test de remplacement inter-UL |
| 10 | edge | Erreur d'une requête périmée écrase un chargement récent | low | patch |
| 11 | edge / blind | Tableau vide affiché sous l'erreur | low | patch |
| 12 | edge | `contactId` fait d'espaces → 400 | low | rejeté — l'interface n'envoie jamais ça |
| 13 | vgap | Garage anonymisé après retrait du partage non testé | medium | patch |
| 14 | vgap | Colonnes de révision lues en base non testées | medium | patch |
| 15 | blind | RDV non lié au cycle d'échéance | medium | defer — cas rare (contrôle saisi avant la date du RDV) |
| 16 | blind | RDV/contacts orphelins à la suppression d'un véhicule ou d'un contact | low | defer — nettoyage transverse du module (tâches, dossiers, RDV) |
| 17 | blind | Désinfection : jour calculé sur les 10 premiers caractères (UTC) | low | patch — horodatages complets via `parisDay` |
| 18 | blind | Audit PUT sans entité | low | rejeté — l'action est tracée, l'id est dans la réponse |
| 19 | blind | Pas de retour après création de tâche | low | patch — message de confirmation |
| 20 | blind | `today` ignoré, onglet ouvert après minuit | low | rejeté — rechargement suffit |
| 21 | blind | Pas de filtre véhicule dans Contrôles | low | rejeté — hors spec |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/unit/fleet-tracking-controls.test.ts src/__tests__/integration/fleet-tracking-controls.test.ts` -- expected: tout passe
- `npm run test` -- expected: suite complète verte

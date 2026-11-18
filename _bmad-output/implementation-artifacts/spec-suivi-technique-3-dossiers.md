---
title: 'Suivi technique 3/5 — dossiers, pièces à récupérer et historique du véhicule'
type: 'feature'
created: '2026-11-18'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/domain-model.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-suivi-technique-2-taches.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un sujet technique (sinistre, panne) mobilise plusieurs tâches et documents attendus ; sans regroupement, on ne voit ni ce qui manque ni la vie technique passée d'un véhicule.

**Approach:** Ajouter le sous-onglet « Dossiers » : un dossier par sujet, rattaché à un véhicule, regroupant tâches, pièces à récupérer (cochées à réception) et pièces jointes, ouvert puis clos ; et une section « Suivi technique » sur la fiche véhicule listant tout son historique (CAP-7, 8, 9, 13). Troisième des 5 livrables de la PR v5.55.0.

## Boundaries & Constraints

**Always:**
- Même garde et même cloisonnement UL que les livrables 1-2 ; tous les responsables de l'UL voient et modifient tous les dossiers.
- Dossier : véhicule de l'UL (requis), titre (requis, ≤ 200), description (≤ 5000), état OPEN | CLOSED (« Ouvert », « Clos »), réouverture permise, `closedAt` posé à la clôture et effacé à la réouverture, épinglé (booléen, plusieurs possibles).
- Pièce à récupérer : libellé (requis, ≤ 200), reçue (booléen), valeur reçue facultative (≤ 500, ex. numéro de sinistre), pièce jointe facultative (une PJ du dossier), date et auteur de réception ; décocher efface valeur, date et auteur mais garde la PJ dans le dossier.
- Pièces jointes du dossier : mêmes règles que celles des tâches (types, 4 Mo, R2 `fleet-tracking/<segment UL>/dossiers/<dossierId>/`, table `FleetAttachment` ownerType DOSSIER).
- Une tâche peut appartenir à un dossier de la même UL (`FleetTask.dossierId`) ; sa modale propose le choix du dossier (dossiers ouverts) ; une tâche créée depuis un dossier hérite du dossier et du rattachement au véhicule du dossier.
- Supprimer un dossier (confirmation explicite) supprime ses pièces à récupérer et ses pièces jointes (R2 puis base) ; ses tâches sont conservées et détachées (`dossierId` NULL). Clore ne supprime rien. Aucune purge automatique.
- Historique véhicule : sur `/vehicles/[id]`, section visible des seuls `canManageVehicles` hors Vue DT, listant dossiers (ouverts et clos) et tâches rattachées au véhicule hors dossier, du plus récent au plus ancien, filtre Tout / En cours / Clos-terminé.
- Écritures via `withAudit`, routes au catalogue MCP, tables dans `FLEET_TRACKING_DDL` + migration + dev + tests ; CHANGELOG 5.55.0 complété.

**Never:**
- Pas de journal d'activité du dossier (le bloc « Activité » de la maquette est abandonné : le journal d'audit est purgé à 30 jours).
- Pas de contrôles ni de vue d'ensemble (livrables 4-5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création | POST véhicule 75-188 de l'UL + titre | 201, état OPEN | N/A |
| Véhicule d'une autre UL | POST | 400 | N/A |
| Pièce reçue | PATCH item received=true, value « SIN-4521 » | reçue, date + auteur posés | N/A |
| Pièce décochée | received=false | valeur/date/auteur effacés | N/A |
| PJ d'un autre dossier | item.attachmentId hors dossier | 400 | N/A |
| Clôture / réouverture | PATCH status | `closedAt` posé / effacé | N/A |
| Suppression | DELETE dossier avec 2 tâches, 3 pièces, 1 PJ | pièces et PJ supprimées ; tâches gardées, `dossierId` NULL | échec R2 journalisé |
| Tâche → dossier d'une autre UL | PATCH tâche dossierId | 400 | N/A |
| Autre UL / rôle / session | GET/PATCH/DELETE ; CHVL ; anonyme | 403 ; 403 ; 401 | N/A |
| Historique | véhicule avec 1 dossier clos, 1 ouvert, 1 tâche hors dossier terminée | 3 entrées, plus récente en tête | N/A |
| Historique autre UL | véhicule d'une autre UL | 403 (404 si inconnu) | N/A |

</frozen-after-approval>

## Code Map

- Livrables 1-2 (lire leurs Implementation Notes) -- `src/lib/fleetTracking/` (garde, `parseBody`, schéma, tâches, pièces jointes), `src/components/fleetTracking/` (`FleetTrackingPanel`, `TasksTab`, `TaskModal`), routes `src/app/api/fleet-tracking/`.
- `src/app/vehicles/[id]/page.tsx` -- fiche véhicule (≈556 lignes) : insérer la section après `VehicleDocumentsCard` (~l.273), avant `TripHistoryList` ; `isDtView` = lecture seule ; extraire la section dans son propre composant.
- `[id]` véhicule côté API = **nom** du véhicule (`SELECT id, name, ulId FROM Vehicle WHERE name = ?`), 404 puis `isOutsideUl` → 403.
- Maquette : `_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/mockups/suivi-technique.html` écrans 3 et 8.

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/fleetTracking/schema.ts` -- tables `FleetDossier` (id, ulId, vehicleId, title, description, status, pinned, createdBy, createdAt, updatedAt, closedAt) et `FleetDossierItem` (id, dossierId, label, received, receivedValue, attachmentId, receivedAt, receivedBy, position, createdAt) + index ; migration, dev, `setup.ts`.
- [ ] `src/lib/fleetTracking/dossiers.ts` -- Zod, chargement d'un dossier enrichi (véhicule, pièces, tâches, PJ, compteurs), règles de suppression ; factoriser la logique de PJ avec les tâches.
- [ ] `src/app/api/fleet-tracking/dossiers/route.ts` -- GET (filtres status, vehicle, pinned) + POST.
- [ ] `src/app/api/fleet-tracking/dossiers/[id]/route.ts` -- GET, PATCH, DELETE.
- [ ] `src/app/api/fleet-tracking/dossiers/[id]/items/route.ts` + `items/[itemId]/route.ts` -- POST ; PATCH ; DELETE.
- [ ] `src/app/api/fleet-tracking/dossiers/[id]/attachments/route.ts` + `[attachmentId]/route.ts` -- POST ; GET ; DELETE.
- [ ] `src/app/api/fleet-tracking/vehicles/[name]/history/route.ts` -- GET historique.
- [ ] Tâches -- `dossierId` accepté et validé à la création/modification ; filtre `?dossier=` sur la liste.
- [ ] `src/components/fleetTracking/` -- `DossiersTab` (liste filtrable Ouverts / Clos / Tous + véhicule, badge du nombre de dossiers ouverts sur l'onglet), `DossierModal` (création/édition), `DossierDetail` (écran 3 : en-tête état + véhicule + épingle + Clore/Rouvrir/Supprimer, pièces à récupérer avec « Marquer reçue », tâches du dossier avec création pré-remplie, pièces jointes, rattachements du véhicule) ; ouverture via `?dossier=<id>` ; sélecteur de dossier dans `TaskModal`.
- [ ] `src/components/vehicle/VehicleFleetHistory.tsx` + `src/app/vehicles/[id]/page.tsx` -- section historique (écran 8) avec bouton « + Dossier pour ce véhicule ».
- [ ] Tests -- intégration de chaque route (matrice complète, 401/403/400) ; composants `DossierDetail` (cocher une pièce) et `VehicleFleetHistory` (masquée sans droit).
- [ ] `npm run mcp:catalog`, CHANGELOG 5.55.0 complété, `AGENTS.md` des nouveaux dossiers.

**Acceptance Criteria:**
- Given un dossier ouvert avec 2 pièces non reçues, when on coche l'une d'elles, then le dossier affiche « 1 sur 2 manquantes ».
- Given un CHVL sur la fiche d'un véhicule, when la page s'affiche, then la section Suivi technique est absente.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/integration/fleet-tracking-dossiers*.test.ts src/__tests__/components` -- expected: tout passe
- `npm run test` -- expected: suite complète verte

---
title: 'Suivi technique 3/5 — dossiers, pièces à récupérer et historique du véhicule'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '170c748daeff8f18d92f3e6b000f6f0286593e6f'
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
- [x] `src/lib/fleetTracking/schema.ts` -- tables `FleetDossier` (id, ulId, vehicleId, title, description, status, pinned, createdBy, createdAt, updatedAt, closedAt) et `FleetDossierItem` (id, dossierId, label, received, receivedValue, attachmentId, receivedAt, receivedBy, position, createdAt) + index ; migration, dev, `setup.ts`.
- [x] `src/lib/fleetTracking/dossiers.ts` -- Zod, chargement d'un dossier enrichi (véhicule, pièces, tâches, PJ, compteurs), règles de suppression ; factoriser la logique de PJ avec les tâches.
- [x] `src/app/api/fleet-tracking/dossiers/route.ts` -- GET (filtres status, vehicle, pinned) + POST.
- [x] `src/app/api/fleet-tracking/dossiers/[id]/route.ts` -- GET, PATCH, DELETE.
- [x] `src/app/api/fleet-tracking/dossiers/[id]/items/route.ts` + `items/[itemId]/route.ts` -- POST ; PATCH ; DELETE.
- [x] `src/app/api/fleet-tracking/dossiers/[id]/attachments/route.ts` + `[attachmentId]/route.ts` -- POST ; GET ; DELETE.
- [x] `src/app/api/fleet-tracking/vehicles/[name]/history/route.ts` -- GET historique.
- [x] Tâches -- `dossierId` accepté et validé à la création/modification ; filtre `?dossier=` sur la liste.
- [x] `src/components/fleetTracking/` -- `DossiersTab` (liste filtrable Ouverts / Clos / Tous + véhicule, badge du nombre de dossiers ouverts sur l'onglet), `DossierModal` (création/édition), `DossierDetail` (écran 3 : en-tête état + véhicule + épingle + Clore/Rouvrir/Supprimer, pièces à récupérer avec « Marquer reçue », tâches du dossier avec création pré-remplie, pièces jointes, rattachements du véhicule) ; ouverture via `?dossier=<id>` ; sélecteur de dossier dans `TaskModal`.
- [x] `src/components/vehicle/VehicleFleetHistory.tsx` + `src/app/vehicles/[id]/page.tsx` -- section historique (écran 8) avec bouton « + Dossier pour ce véhicule ».
- [x] Tests -- intégration de chaque route (matrice complète, 401/403/400) ; composants `DossierDetail` (cocher une pièce) et `VehicleFleetHistory` (masquée sans droit).
- [x] `npm run mcp:catalog`, CHANGELOG 5.55.0 complété, `AGENTS.md` des nouveaux dossiers.

**Acceptance Criteria:**
- Given un dossier ouvert avec 2 pièces non reçues, when on coche l'une d'elles, then le dossier affiche « 1 sur 2 manquantes ».
- Given un CHVL sur la fiche d'un véhicule, when la page s'affiche, then la section Suivi technique est absente.

## Implementation Notes

- Schéma : `FleetDossier` et `FleetDossierItem` + 3 index ajoutés à `FLEET_TRACKING_DDL` / `FLEET_TRACKING_TABLES` ; la migration `scripts/add-fleet-tracking.ts` les crée sur une base passée au livrable 2 (testé) ; dev par la boucle existante de `setup-dev.ts` ; tests : truncate des 2 tables. `CLAUDE.md` (ligne de la migration) mis à jour.
- Pur / serveur : `dossiers.ts` (pur), `dossiersStore.ts` (SQL), `dossierGuards.ts` (`loadOwnedDossier` 404/403, `checkTaskDossier` 400). PJ factorisées : `attachmentRoutes.ts` (`handleAttachmentUpload`, `serveAttachment`) sert désormais les routes des tâches ET des dossiers ; `buildAttachmentKey(ownerType, …)` (`buildTaskAttachmentKey` conservé) ; `listAttachments` / `countAttachments` génériques ; 20 PJ max par dossier comme par tâche.
- Pièce à récupérer : valeur et fichier n'existent que sur une pièce reçue (400 sinon) ; **décocher efface aussi `attachmentId`** (le fichier reste dans le dossier) — lecture de « décocher efface valeur, date et auteur mais garde la PJ dans le dossier ». Supprimer une PJ désignée par une pièce la lui retire dans la même transaction, la pièce reste reçue. 50 pièces max par dossier (400).
- Tâche entrant dans un dossier (création, ou `dossierId` modifié) : le dossier doit être ouvert et de l'UL (400 sinon) ; le dossier actuel inchangé, même clos, reste accepté. Le rattachement VEHICLE du dossier est ajouté côté serveur en POST comme en PATCH (s'il manque, si le véhicule est toujours dans l'UL et sous `MAX_TASK_LINKS`). Le véhicule d'un dossier est immuable après création (`vehicleId` en PATCH → 400) : ses tâches ne restent jamais rattachées à un ancien véhicule. Filtre `?dossier=<id>|none`.
- Suppression d'un dossier : un lot `write` (dossier, PJ `RETURNING r2Key`, pièces, tâches détachées `dossierId = NULL`), puis R2 au mieux (échec journalisé). Clore ne touche à rien.
- Historique : véhicule par **nom** cherché d'abord dans l'UL de session (les noms ne sont pas uniques entre UL), puis 403 s'il n'existe que dans une autre UL, 404 sinon ; dossiers du véhicule dans l'UL + tâches rattachées au véhicule hors de ses propres dossiers (hors dossier ou dans le dossier d'un autre véhicule) (direct, incident ou maintenance, même règle que le filtre `vehicle`), triés par date de création décroissante. Filtre Tout / En cours / Clos-terminé côté client (compteurs dans les boutons).
- UI : onglet « Dossiers » entre Tâches et Contacts, badge du nombre de dossiers ouverts (relu à chaque modification) ; `?dossier=` lu par `useFleetTrackingView` (retiré au changement d'onglet) ; détail = écran 3 sans le bloc « Activité » ; « Rattaché à » = union dédoublonnée des rattachements des tâches du dossier (hors son véhicule). Fiche véhicule : `VehicleFleetHistory` après `VehicleDocumentsCard`, ne rend rien ni n'appelle l'API sans `canManageVehicles` ou en Vue DT (qui couvre le véhicule d'une autre UL), masquée si l'API répond 403/404 ; « + Dossier pour ce véhicule » crée puis ouvre le dossier dans le suivi.
- Vérification : `npm run lint` 0/0 ; suite complète 5184/5186 — les 2 échecs (`report-pdf.test.ts`) viennent du worker pdfjs introuvable dans les `node_modules` de ce worktree, comme au livrable 2. Non vérifié dans un navigateur.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|---|---|---|---|
| 1 | blind / edge | Tâche rattachable à un dossier clos via l'API | medium | patch — refuser un nouveau rattachement à un dossier CLOSED (l'existant reste) |
| 2 | blind | Dossier clos encore modifiable | false | la spec ne rend pas un dossier clos immuable (« Clore ne supprime rien », réouverture permise) |
| 3 | blind / edge | PATCH `dossierId` n'ajoute pas le lien véhicule du dossier (POST oui) | medium | patch |
| 4 | blind / edge | Changement de véhicule d'un dossier : tâches restées sur l'ancien | medium | patch — véhicule non modifiable après création (400) |
| 5 | blind / edge | Historique : véhicule cherché par nom toutes UL confondues → 403 sur son propre véhicule | medium | patch — vérifié `WHERE name = ?` sans `ulId` |
| 6 | blind / edge | Historique : 500/réseau traités comme un refus, section masquée | medium | patch |
| 7 | blind / edge | Plafonds (50 pièces, 20 PJ) non atomiques | low | rejeté — fenêtre minime, correctif complexe |
| 8 | blind | Audit sans l'id de la pièce / PJ touchée | low | patch — `idParam` adapté |
| 9 | blind | `updatedAt` du dossier figé lors des changements de contenu | low | rejeté — non affiché ni utilisé pour trier |
| 10 | blind / edge | Pièce pointant vers une PJ supprimée entre vérification et écriture | low | patch — `WHERE EXISTS` dans l'UPDATE |
| 11 | blind | `deleteDossier` non borné à l'UL dans le store | low | patch |
| 12 | blind | Sélecteur « Dossier actuel » sans titre | low | patch |
| 13 | vgap | Création depuis le dossier : envoi de `dossierId` non testé | medium | patch |
| 14 | vgap | PJ de dossier (baseUrl, déliaison côté client) non testées | medium | patch |
| 15 | vgap | Plafonds par dossier non testés | medium | patch |
| 16 | vgap | Lien véhicule hérité alors que le véhicule a quitté l'UL non testé | medium | patch |
| 17 | edge | Lien hérité au-delà du maximum de rattachements | low | patch |
| 18 | edge | Historique : tâche liée au véhicule mais dans le dossier d'un autre véhicule absente | medium | patch |
| 19 | edge | Hook d'historique non réinitialisé au changement de véhicule | low | patch |
| 20 | edge | Formulaire « Marquer reçue » : PJ supprimée encore sélectionnée, ressaisie du même fichier, valeurs gardées après Annuler | low | patch |
| 21 | edge | Compteurs du dossier non rafraîchis après création/modif de tâche | low | patch |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/integration/fleet-tracking-dossiers*.test.ts src/__tests__/components` -- expected: tout passe
- `npm run test` -- expected: suite complète verte

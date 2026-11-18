---
title: 'Suivi technique 2/5 — tâches : tableau à colonnes, assignés, rattachements, pièces jointes'
type: 'feature'
created: '2026-11-18'
status: 'draft'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/domain-model.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-suivi-technique-1-onglet-contacts.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les responsables véhicule suivent hors de l'appli ce qui doit avancer sur leurs véhicules (devis, références, rendez-vous) ; rien n'est partagé ni rattaché au véhicule.

**Approach:** Ajouter le sous-onglet « Tâches » au panneau Suivi technique (livrable 1) : tâches à états fixes sur un tableau à colonnes ou en liste, attribuables aux responsables de l'UL, rattachables à des véhicules, contacts, incidents ou maintenances, avec pièces jointes et notification d'attribution (CAP-4, 5, 6, 7, 12). Deuxième des 5 livrables de la PR v5.55.0.

## Boundaries & Constraints

**Always:**
- Même garde que le livrable 1 (`canManageVehicles`, UL de session, `isOutsideUl`). Toutes les tâches de l'UL sont visibles et modifiables par tous ses responsables.
- Tâche : titre (requis, ≤ 200), description (≤ 5000), état TODO | IN_PROGRESS | WAITING | DONE (« À faire », « En cours », « En attente », « Terminé »), priorité NORMAL | HIGH (« Prioritaire »), échéance facultative (date `YYYY-MM-DD`, vide = « Date à fixer »), épinglée (booléen, plusieurs possibles), `completedAt` posé au passage à DONE et effacé à la réouverture. Toute transition d'état est permise.
- Assignés : 0 à n personnes actives (non INACTIF) de l'UL dont les rôles satisfont `canManageVehicles` ; tout autre identifiant → 400.
- Rattachements : véhicule de l'UL, contact de l'UL ou partagé par une autre UL, incident ou maintenance d'un véhicule de l'UL (UL via `Vehicle.ulId`) ; cible hors périmètre ou inexistante → 400 ; doublon ignoré.
- Pièces jointes : PDF, JPEG, PNG ou WebP vérifiés par signature binaire, ≤ 4 Mo (413 au-delà), multipart via la route ; stockage R2 via `src/lib/r2.ts` sous `fleet-tracking/<segment UL>/tasks/<taskId>/` ; lecture réservée aux responsables de l'UL ; suppression de la tâche ⇒ suppression de ses pièces jointes (R2 puis base). Le schéma de pièce jointe est générique (propriétaire TASK ou DOSSIER) pour le livrable 3.
- Notification (`notifyUsers`, in-app + push) aux seuls assignés nouvellement ajoutés, jamais à l'auteur de la modification ; lien profond `/vehicles?vue=suivi&onglet=taches&tache=<id>` qui ouvre la tâche.
- Changement d'état sans glisser-déposer possible (pastille d'état ou modale) ; glisser-déposer natif entre colonnes au pointeur.
- Rien n'est purgé ; « Terminé » replié au-delà de 5 cartes (« Afficher les N autres »).
- Écritures via `withAudit`, routes au catalogue MCP, tables dans `FLEET_TRACKING_DDL` + migration `scripts/add-fleet-tracking.ts` + dev + tests ; CHANGELOG 5.55.0 complété.

**Never:**
- Pas de dossiers, de pièces à récupérer, de contrôles ni de vue d'ensemble (livrables 3 à 5) — mais la colonne `dossierId` (nullable) existe déjà sur la tâche.
- Pas de colonnes configurables, sous-tâches, commentaires, ordre manuel des cartes.
- Pas d'assignation inter-UL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Création | POST titre + assigné B + véhicule 75-188 | 201 ; B notifié ; l'auteur non | N/A |
| Auto-attribution | auteur s'assigne lui-même | aucune notification | N/A |
| Assigné invalide | CHVL de l'UL ou ADMIN d'une autre UL | 400 | message FR |
| Rattachement hors UL | véhicule / incident d'une autre UL | 400 | N/A |
| Contact partagé | contact `shared` d'une autre UL | accepté | N/A |
| Passage à Terminé | PATCH status DONE | `completedAt` posé ; réouverture l'efface | N/A |
| Tâche d'une autre UL | GET/PATCH/DELETE | 403 | N/A |
| Filtres | `?vehicle=…&assignee=me&pinned=1&priority=HIGH&q=devis` | seules les tâches correspondantes | N/A |
| Pièce jointe | PDF 1 Mo | 201, lisible par un responsable de l'UL, 403 pour une autre UL | N/A |
| Fichier refusé | .exe renommé .pdf / 5 Mo | 400 / 413 | rien écrit sur R2 |
| Suppression | DELETE tâche avec 2 PJ | tâche, liens, assignés et objets R2 supprimés | échec R2 journalisé, la base reste cohérente |
| Rôle / session | CHVL ; non connecté | 403 ; 401 | N/A |

</frozen-after-approval>

## Code Map

- Livrable 1 (lire son Implementation Notes) -- `src/lib/fleetTracking/` (garde, `parseBody`, schéma), `src/components/fleetTracking/FleetTrackingPanel` (sous-onglets), `scripts/add-fleet-tracking.ts`.
- `src/lib/roles.ts:169` -- `canManageVehicles`. Rôles d'un utilisateur : table `UserRole` (et CSV `UserUL.roles`) ; `src/lib/ulMembers.ts` `listActiveUlMembers(ulId)` donne les membres actifs sans rôles ; `src/app/api/users/route.ts` renvoie rôles + `ulIds`.
- `src/lib/push.ts:137` -- `notifyUsers({ userIds, title, message, url?, ulId?, excludeUserId? })`, ne lève jamais ; import paresseux `await import('@/lib/push')` ; mocké en test.
- `src/lib/r2.ts` -- `putObject`, `getObject`, `deleteObject`, `presignUrl` ; `src/lib/media/server.ts:21` `ulSegmentOf(ulId)` ; `src/lib/vehicleGuide.ts` `hasPdfSignature`, `sanitizeGuideFileName`, `guideContentDisposition`.
- `src/app/api/vehicles/[id]/documents/route.ts` -- modèle d'upload multipart (`runtime='nodejs'`, `maxDuration=30`, R2 put puis insert, nettoyage R2 si l'insert échoue) ; `src/__tests__/integration/vehicle-documents.test.ts` (R2 en mémoire, `// @vitest-environment node`).
- `src/lib/demo/readOnly.ts:41` -- `DEMO_EXTERNAL_WRITE_ROUTES` : inutile si les routes n'écrivent que sur R2 via `r2.ts` (règle du CLAUDE.md racine).
- Tables cibles : `Vehicle(id, name, ulId)`, `IncidentReport(id, vehicleId, type, status, occurredAt)`, `VehicleMaintenance(id, vehicleId, startDate, endDate, reason)` — pas de `ulId` : joindre `Vehicle`.
- `src/components/ui/UserCombobox.tsx` -- sélecteur à choix unique avec recherche et filtre « Mon UL » ; base du sélecteur multiple d'assignés (puces + combobox).
- Maquette : `_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/mockups/suivi-technique.html` écrans 2, 4 et 7 ; `DESIGN.md` du même dossier (couleurs d'état, pastilles).

## Tasks & Acceptance

**Execution:**
- [ ] `src/lib/fleetTracking/schema.ts` -- tables `FleetTask` (dont `dossierId` nullable, `pinned`, `completedAt`), `FleetTaskAssignee` (PK taskId+userId), `FleetTaskLink` (unique taskId+targetType+targetId), `FleetAttachment` (ownerType TASK|DOSSIER, ownerId, ulId, r2Key, fileName, contentType, size, uploadedBy, createdAt) + index ; ajout à `FLEET_TRACKING_DDL`, migration, dev, `setup.ts` (create + truncate).
- [ ] `src/lib/fleetTracking/tasks.ts` -- schémas Zod, validation des assignés et des rattachements, chargement d'une tâche enrichie (assignés avec nom, rattachements avec libellé, nombre de PJ).
- [ ] `src/app/api/fleet-tracking/tasks/route.ts` -- GET liste filtrée (vehicle, assignee=me|id, pinned, priority, status, q) ; POST.
- [ ] `src/app/api/fleet-tracking/tasks/[id]/route.ts` -- GET, PATCH (champs partiels, remplacement des listes assignés/rattachements), DELETE.
- [ ] `src/app/api/fleet-tracking/tasks/[id]/attachments/route.ts` + `[attachmentId]/route.ts` -- POST upload ; GET contenu (inline pour images/PDF) ; DELETE.
- [ ] `src/app/api/fleet-tracking/assignees/route.ts` et `link-targets/route.ts` -- responsables assignables de l'UL ; cibles rattachables par type avec recherche (`?type=VEHICLE|CONTACT|INCIDENT|MAINTENANCE&q=`).
- [ ] `src/components/fleetTracking/` -- `TasksTab` (filtres, bascule Tableau/Liste, colonnes avec glisser-déposer, pastille d'état menu « Déplacer vers… », Terminé replié), `TaskCard`, `TaskModal` (création/édition, état, priorité, échéance, épingle, assignés multiples, rattachements, pièces jointes, suppression avec confirmation) ; ouverture via `?tache=` ; onglet « Tâches » ajouté à `FleetTrackingPanel` et devenu l'onglet par défaut.
- [ ] Tests -- intégration de chaque route (toutes les lignes de la matrice, 401/403/400) ; composant `TasksTab` (rendu par colonnes, changement d'état par la pastille) et `TaskModal` (assignés, validation).
- [ ] `npm run mcp:catalog`, CHANGELOG 5.55.0 complété, `AGENTS.md` des nouveaux dossiers.

**Acceptance Criteria:**
- Given une carte déplacée vers « En attente », when la page est rechargée, then elle y est toujours.
- Given un téléphone, when on touche la pastille d'état d'une carte, then on peut la déplacer sans glisser-déposer.
- Given un lien de notification, when on l'ouvre, then la modale de la tâche s'affiche.

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/integration/fleet-tracking-tasks*.test.ts src/__tests__/components` -- expected: tout passe
- `npm run test` -- expected: suite complète verte

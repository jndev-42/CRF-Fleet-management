---
title: 'Suivi technique 5/5 — vue d'ensemble « Le point sur la flotte »'
type: 'feature'
created: '2026-11-18'
status: 'done'
baseline_commit: '4eaa0d147a4ebd8e99e8dc166a1e5b3ecc4483f5'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/SPEC.md'
  - '{project-root}/_bmad-output/specs/spec-vehicle-action-tracking/dashboard-mockup.md'
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/EXPERIENCE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/spec-suivi-technique-4-controles.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Tâches, dossiers et contrôles existent dans des onglets séparés ; le responsable n'a pas de vue unique de ce qui doit avancer en priorité.

**Approach:** Ajouter le sous-onglet « Vue d'ensemble », devenu l'onglet par défaut du Suivi technique : quatre compteurs cliquables, prochaines actions cochables, encart « À confirmer en priorité » des éléments épinglés et liste des véhicules avec leurs dossiers ouverts (CAP-11). Dernier des 5 livrables de la PR v5.55.0.

## Boundaries & Constraints

**Always:**
- Même garde et cloisonnement UL ; une seule route de lecture agrégée.
- Compteurs : Dossiers ouverts (sous-titre « Sur les N véhicules ») ; Échéances à traiter = tâches non terminées à échéance ≤ aujourd'hui + 30 j + contrôles « sous 30 jours » (fonction du livrable 4) ; Pièces à récupérer = pièces non reçues des dossiers ouverts ; Contrôles à dater = contrôles à l'état « À dater » ou « Dépassée » sans rendez-vous futur. Chaque carte ouvre l'onglet correspondant, filtre appliqué.
- Prochaines actions : tâches non terminées, Prioritaire d'abord, puis échéance croissante, « Date à fixer » en dernier ; 5 premières affichées, badge « N à suivre » (total), lien « Voir les N tâches ». Cocher passe la tâche à Terminé avec un message « Annuler » (≈ 5 s) qui la rétablit dans son état précédent.
- Encart « À confirmer en priorité » : toutes les tâches épinglées non terminées et dossiers épinglés ouverts, échéance la plus proche d'abord (dossier : échéance la plus proche parmi ses tâches ouvertes), sans échéance en dernier ; sans aucun épinglé, la tâche Prioritaire non terminée à l'échéance la plus proche ; encart masqué s'il n'y a rien.
- Véhicules : tous les véhicules de l'UL avec indicatif, modèle, immatriculation et nombre de dossiers ouverts ; clic → onglet Dossiers filtré sur le véhicule.
- Boutons « + Tâche » et « + Nouveau dossier » ; badges de comptage sur les sous-onglets Tâches (non terminées) et Dossiers (ouverts).
- Libellés impersonnels (pas de tutoiement) ; route au catalogue MCP ; CHANGELOG 5.55.0 finalisé (entrée complète du module).

**Never:**
- Pas de nouvelle table ni de nouvelle donnée : uniquement des agrégats de l'existant.
- Pas d'entrées « Messages » ni « Réglages ».

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Compteurs | 2 dossiers ouverts + 1 clos ; 3 pièces non reçues dont 1 dans le dossier clos | dossiers = 2 ; pièces = 2 | N/A |
| Échéances | tâche due dans 10 j, tâche due dans 40 j, tâche terminée due hier, contrôle dépassé | 2 | N/A |
| Tri prochaines actions | HIGH sans date, NORMAL due demain, HIGH due dans 3 j | HIGH 3 j, HIGH sans date, NORMAL demain | N/A |
| Épinglés | tâche épinglée due 20/11, dossier épinglé sans tâche datée, tâche épinglée terminée | tâche 20/11 puis dossier ; la terminée absente | N/A |
| Repli | aucun épinglé, 2 tâches HIGH | la HIGH à l'échéance la plus proche | N/A |
| Vide | UL sans données | compteurs à 0, encart masqué, message vide dans Prochaines actions | N/A |
| Autre UL | données de l'UL B | jamais comptées pour A | N/A |
| Rôle / session | CHVL ; anonyme | 403 ; 401 | N/A |

</frozen-after-approval>

## Code Map

- Livrables 1-4 (lire leurs Implementation Notes) -- `src/lib/fleetTracking/` (tâches, dossiers, `computeControls`), `src/components/fleetTracking/` (`FleetTrackingPanel`, `TaskModal`, `DossierModal`, onglets), routes `src/app/api/fleet-tracking/`.
- Maquette : écran 1 de `_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-11-18/mockups/suivi-technique.html` ; structure détaillée dans `dashboard-mockup.md` (context).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/fleetTracking/overview.ts` -- agrégation (fonctions pures de tri/sélection testables + chargement SQL pour une UL).
- [x] `src/app/api/fleet-tracking/overview/route.ts` -- GET `{ counters, nextActions, nextActionsTotal, priority: { pinned, fallback }, vehicles, tabCounts }`.
- [x] `src/components/fleetTracking/OverviewTab.tsx` (+ CSS Module) -- écran 1 ; toast « Annuler » ; onglet par défaut de `FleetTrackingPanel` ; navigation des cartes vers les onglets filtrés (paramètres d'URL déjà gérés par les onglets) ; badges de sous-onglets.
- [x] Tests -- unitaires des tris et du repli ; intégration de la route (matrice, 401/403) ; composant `OverviewTab` (compteurs, encart masqué, cocher puis annuler).
- [x] `npm run mcp:catalog`, CHANGELOG 5.55.0 finalisé.

**Acceptance Criteria:**
- Given une tâche cochée par erreur, when on clique « Annuler » dans le message, then elle retrouve son état précédent.
- Given la carte « Contrôles à dater », when on clique, then l'onglet Contrôles s'ouvre filtré sur « À dater ».

## Implementation Notes

- Découpage : `overview.ts` est **pur** (tris, sélection, compteurs, `buildOverview`, client-safe) et le chargement SQL est dans `overviewStore.ts` (`loadUlOverview`), selon la convention du module (`tasks.ts` / `tasksStore.ts`, `controls.ts` / `controlsStore.ts`). Réutilise `listTasks` (non terminées), `listDossiers` (ouverts) et `loadUlControls` : aucune requête nouvelle hors la liste des véhicules.
- Tri des prochaines actions : Prioritaire, échéance croissante, sans échéance en dernier, puis la plus ancienne (`createdAt`), puis l'id. Encart : échéance (dossier = la plus proche de ses tâches ouvertes), sans échéance en dernier, puis titre. Repli = première tâche HIGH dans l'ordre des prochaines actions (une HIGH sans date est retenue s'il n'y a qu'elles) ; seulement si aucun épinglé.
- Compteurs : « Échéances à traiter » = tâches non terminées à échéance ≤ aujourd'hui + 30 j (dépassées comprises) + contrôles `soon` ; « Contrôles à dater » = contrôles `state !== 'SCHEDULED'` (À dater + Dépassée, conformément à la note du livrable 4). Jour de référence : `parisDay()` côté serveur.
- Véhicules : `Vehicle` n'a pas de colonne de modèle ; le « modèle » affiché est `Vehicle.type` (VL, VPSP…). Le compteur par véhicule ignore un dossier dont le véhicule n'est plus dans l'UL. Tri par indicatif (numérique).
- Navigation des cartes : il n'existait pas de paramètres d'URL de filtre dans les onglets ; ajout de `?filtre=` et `?vehicule=` dans `useFleetTrackingView` (retirés au changement d'onglet), lus une fois comme état initial : Dossiers ouverts → Dossiers (Ouverts) ; Échéances à traiter → Contrôles « Sous 30 jours » (pas de filtre par échéance dans Tâches) ; Pièces à récupérer → Dossiers avec le nouveau filtre local « Pièces à récupérer » (`missingItemCount > 0`) ; Contrôles à dater → Contrôles « À dater » (critère d'acceptation) — ce filtre n'inclut pas les échéances dépassées comptées par la carte ; véhicule → Dossiers (Ouverts) filtrés sur le véhicule ; « Voir les N tâches » → Tâches.
- Données : `FleetTrackingPanel` détient `useFleetOverview` (un seul appel pour la vue et les badges Tâches / Dossiers, qui remplace `useOpenDossierCount`, supprimé) et le relit à chaque `onChanged` d'un onglet (`TasksTab` reçoit désormais `onChanged`). Les badges se lisent donc aussi depuis les autres onglets.
- Cocher / Annuler (`useCompleteWithUndo`) : la ligne est masquée aussitôt, PATCH `DONE`, message « Annuler » 5 s ; « Annuler » PATCH l'état précédent (le `completedAt` est effacé par la route). Échec : la ligne revient avec un message.
- « Modifier », « + Tâche » et une tâche de l'encart ouvrent `TaskModal` sur place ; « + Nouveau dossier » ouvre `DossierModal` puis le détail du dossier créé. Libellés impersonnels (sous-titre « Véhicules, dossiers et ce qui doit avancer. »).
- Après revue (coordinateur) : filtre « À dater » des Contrôles = `state !== 'SCHEDULED'` (dépassées comprises), comme le compteur ; « Échéances à traiter » détaillée « N tâches · M contrôles » (tâches → Tâches `?filtre=echeance`, nouveau filtre `due=soon` de `GET /tasks` et bouton « Échéances à traiter » de la barre ; contrôles → « Sous 30 jours ») ; la tâche liée (`appointment.taskId`) d'un contrôle compté n'est pas recomptée côté tâches (elle reste listée par le filtre Tâches) ; `filtre` / `vehicule` retirés de l'URL au premier changement de filtre local (`clearTabFilter`) ; véhicule d'ouverture inconnu retiré une fois la liste reçue (`vehiclesLoaded`) ; message « Annuler » (`UndoToast`) : focus porté sur « Annuler », décompte suspendu au survol ou à un focus de l'utilisateur (le focus automatique ne suspend pas) ; échec de l'annulation : ligne réaffichée, « Impossible d'annuler : la tâche reste terminée. » ; ouverture d'une tâche depuis la vue d'ensemble par `?tache=` sur l'onglet `ensemble` ; dossier créé sans id : modale fermée, vue relue ; pluriels, « Voir la tâche », « Aucune échéance » pour un dossier épinglé, couleur d'échéance et épingle dans l'encart, message d'information effacé après 5 s ou à l'action suivante.
- Vérification : `npm run lint` 0/0, `tsc --noEmit` propre ; tests unitaires, d'intégration et composants verts. `npm run test` : seuls 2 tests de `report-pdf.test.ts` échouent, pour une raison d'environnement du worktree (worker `pdfjs-dist` introuvable dans `node_modules` du worktree), sans rapport. `npm run build` : compilation, TypeScript et génération des pages réussies, puis arrêt par le contrôle de sécurité de Next.js sur la version installée (`SecurityFatalError`), sans rapport avec ce livrable. Non vérifié dans un navigateur.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route / preuve |
|---|---|---|---|---|
| 1 | blind / impl | « Contrôles à dater » compte À dater + Dépassée mais le filtre « À dater » exclut les dépassées | medium | patch — le filtre « À dater » de Contrôles couvre tout contrôle sans RDV futur (dépassés compris) |
| 2 | blind / edge | « Échéances à traiter » compte des tâches mais n'ouvre que Contrôles | medium | patch — détail « N tâches · M contrôles » cliquable, filtre Tâches « échéance ≤ 30 j » |
| 3 | blind | Contrôle avec RDV + sa tâche liée comptés deux fois | low | patch — tâche liée à un RDV non recomptée |
| 4 | blind / edge | Filtre d'ouverture figé dans l'URL après changement local | low | patch — `filtre`/`vehicule` retirés au premier changement local |
| 5 | blind / edge | Deuxième coche remplace l'annulation précédente ; quitter l'onglet perd l'annulation | low | rejeté — comportement courant des messages d'annulation, correctif complexe |
| 6 | blind | Message « Annuler » : pas de pause au survol/focus, focus perdu | low | patch — focus sur « Annuler », minuterie suspendue au survol/focus |
| 7 | blind / edge | Échec du PATCH d'annulation : tâche masquée sans recours | low | patch — réafficher la ligne et un message clair |
| 8 | blind / edge | `onOpenDossier('')` après création sans id | low | patch |
| 9 | blind | Agrégat rechargé sur tous les onglets à chaque changement | low | rejeté — volumétrie UL faible |
| 10 | blind | Véhicules sans filtre d'état | false | même ensemble que la vue flotte et les contrôles (aucun état « retiré » dans `Vehicle`) |
| 11 | blind | Libellés : « Voir les 1 tâche », pluriels « (s) », « Date à fixer » sur un dossier, encart sans couleur d'échéance, message jamais effacé, `?tache=` non écrit | low | patch |
| 12 | vgap | Filtre « Pièces à récupérer » non testé avec un dossier sans pièce manquante | medium | patch |
| 13 | vgap | Ouverture des dossiers filtrés par véhicule non testée | medium | patch |
| 14 | vgap | `TasksTab.onChanged` non testé | medium | patch |
| 15 | vgap | Enregistrements des modales de la vue d'ensemble non testés | medium | patch |
| 16 | edge | `?vehicule=` inconnu : sélection vide mais liste filtrée | low | patch |
| 17 | edge | Dossiers dont le véhicule a disparu : sommes par véhicule ≠ compteur | low | rejeté — cosmétique, cas rare |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/unit/fleet-tracking-overview.test.ts src/__tests__/integration/fleet-tracking-overview.test.ts` -- expected: tout passe
- `npm run test` -- expected: suite complète verte
- `npm run build` -- expected: succès

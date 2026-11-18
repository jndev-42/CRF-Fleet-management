---
title: 'Suivi technique 5/5 — vue d'ensemble « Le point sur la flotte »'
type: 'feature'
created: '2026-11-18'
status: 'draft'
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
- [ ] `src/lib/fleetTracking/overview.ts` -- agrégation (fonctions pures de tri/sélection testables + chargement SQL pour une UL).
- [ ] `src/app/api/fleet-tracking/overview/route.ts` -- GET `{ counters, nextActions, nextActionsTotal, priority: { pinned, fallback }, vehicles, tabCounts }`.
- [ ] `src/components/fleetTracking/OverviewTab.tsx` (+ CSS Module) -- écran 1 ; toast « Annuler » ; onglet par défaut de `FleetTrackingPanel` ; navigation des cartes vers les onglets filtrés (paramètres d'URL déjà gérés par les onglets) ; badges de sous-onglets.
- [ ] Tests -- unitaires des tris et du repli ; intégration de la route (matrice, 401/403) ; composant `OverviewTab` (compteurs, encart masqué, cocher puis annuler).
- [ ] `npm run mcp:catalog`, CHANGELOG 5.55.0 finalisé.

**Acceptance Criteria:**
- Given une tâche cochée par erreur, when on clique « Annuler » dans le message, then elle retrouve son état précédent.
- Given la carte « Contrôles à dater », when on clique, then l'onglet Contrôles s'ouvre filtré sur « À dater ».

## Implementation Notes

## Spec Change Log

## Review Triage Log

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npx vitest run src/__tests__/unit/fleet-tracking-overview.test.ts src/__tests__/integration/fleet-tracking-overview.test.ts` -- expected: tout passe
- `npm run test` -- expected: suite complète verte
- `npm run build` -- expected: succès

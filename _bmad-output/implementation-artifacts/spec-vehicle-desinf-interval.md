---
title: 'Périodicité de désinfection VPSP configurable (1, 2 ou 3 mois — défaut 3)'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: '7644803842f31b14911322cc67d2f169b7de4673'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** L'échéance de la prochaine désinfection des VPSP est codée en dur à « dernière désinfection + 42 jours », alors que la règle voulue est une désinfection tous les 3 mois par défaut, ajustable par véhicule.

**Approach:** Ajouter une périodicité en mois par véhicule (`Vehicle.desinfIntervalMonths`, valeurs 1, 2 ou 3, défaut 3), choisie dans les modales de création et d'édition du véhicule pour les types VPSP, et calculer `nextDesinfMaxDate = lastDesinfDate + N mois` partout où l'échéance est posée.

## Boundaries & Constraints

**Always:** Seuls les véhicules dont le type contient « VPSP » ont une échéance (règle existante `type.toUpperCase().includes('VPSP')`) ; le sélecteur n'apparaît que pour eux. Sans désinfection enregistrée (`nextDesinfMaxDate` NULL), l'affichage reste « Non planifiée ». Validation Zod : entier dans {1, 2, 3}. La migration recalcule `nextDesinfMaxDate = date(lastDesinfDate, '+3 months')` pour les véhicules existants qui ont une `lastDesinfDate` ; changer la périodicité d'un véhicule via PATCH recalcule aussi son échéance si `lastDesinfDate` existe.

**Never:** Pas de changement pour le suivi de désinfection des non-VPSP (`desinfTracking`, sans échéance). Pas de nouvelle échéance inventée pour un véhicule sans désinfection. Pas de notification/cron.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Retour de désinfection | VPSP, intervalle 2, check-in mission « Désinfection » le 2026-10-22 | lastDesinfDate 2026-10-22, nextDesinfMaxDate 2026-12-22 | N/A |
| Défaut | VPSP créé sans préciser l'intervalle | desinfIntervalMonths = 3 | N/A |
| Changement d'intervalle | VPSP lastDesinfDate 2026-09-01, PATCH intervalle 1 | nextDesinfMaxDate 2026-10-01 | N/A |
| Changement sans désinf. | VPSP lastDesinfDate NULL, PATCH intervalle 2 | nextDesinfMaxDate reste NULL → « Non planifiée » | N/A |
| Suppression du trajet de désinf. | Suppression d'un trajet « Désinfection » terminé | Recalcul depuis la désinf. précédente + intervalle du véhicule, ou NULL | N/A |
| Valeur invalide | PATCH/POST desinfIntervalMonths = 4 ou 0 | 400 | Erreur Zod |

</frozen-after-approval>

## Code Map

- `scripts/add-vehicle-desinf-interval.ts` (nouveau) -- migration prod sur le modèle de `scripts/add-vehicle-transmission.ts` + dry-run/`--apply` comme `scripts/add-stock-qr-token.ts`.
- `scripts/setup-dev.ts:180-270` -- CREATE TABLE Vehicle + migrations idempotentes `PRAGMA table_info` ; seed VPSP l.1007 (nextDesinfMaxDate à aligner sur +3 mois).
- `src/__tests__/integration/setup.ts:30-50, 670-710` -- schéma de test Vehicle + factory véhicule.
- `src/app/api/qr/[token]/checkin/route.ts:212`, `src/app/api/trips/[id]/checkin/route.ts:224`, `src/app/api/trips/[id]/route.ts:75` -- les trois `'+42 days'` à remplacer ; utiliser la colonne directement en SQL : `date(x, '+' || COALESCE(desinfIntervalMonths, 3) || ' months')`.
- `src/app/api/vehicles/[id]/route.ts` -- `updateVehicleSchema` (l.11), GET mappe la ligne (l.~125-142), PATCH boucle générique `setClauses` (l.270) : ajouter le recalcul d'échéance après l'UPDATE quand `desinfIntervalMonths` est fourni.
- `src/app/api/vehicles/route.ts:19, 333-374` -- schéma POST + INSERT + réponse.
- `src/app/vehicles/[id]/types.ts:67-83` -- interface `Vehicle` (ajouter `desinfIntervalMonths: number`, corriger le commentaire « +42 jours »).
- `src/components/vehicle/modals/EditVehicleModal.tsx`, `AddVehicleModal.tsx` -- état `form`, payload, bloc conditionnel VPSP à côté de la case `desinfTracking` (l.~310 / ~285). Réutiliser `form-group`/`form-label`/`form-input` (select).
- `src/app/vehicles/[id]/VehicleDetailGrid.tsx:94-138` -- carte « Prochaine désinf. » : ne pas changer la logique ; seuil orange 14 j conservé.
- `src/lib/demo/DemoDB.ts:24-50, 331-334` -- démo : `+42` jours → +N mois.
- `AGENTS.md` des routes touchées -- remplacer les mentions « 42 jours ».

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-vehicle-desinf-interval.ts` -- ajoute `desinfIntervalMonths INTEGER NOT NULL DEFAULT 3` si absent, puis recalcule `nextDesinfMaxDate` des véhicules ayant `lastDesinfDate` ; dry-run par défaut, `--apply` pour écrire, idempotente.
- [x] `scripts/setup-dev.ts` + `src/__tests__/integration/setup.ts` -- colonne dans le schéma + migration idempotente + seed/factory.
- [x] Trois routes de check-in/suppression -- remplacer `+42 days` par l'intervalle du véhicule.
- [x] `src/app/api/vehicles/[id]/route.ts` + `src/app/api/vehicles/route.ts` -- Zod `z.union([z.literal(1), z.literal(2), z.literal(3)])`, GET/POST exposent le champ, PATCH recalcule l'échéance.
- [x] `types.ts`, `EditVehicleModal.tsx`, `AddVehicleModal.tsx` -- select « Désinfection tous les… » (1 mois / 2 mois / 3 mois) affiché uniquement si le type contient VPSP ; défaut 3.
- [x] `src/lib/demo/DemoDB.ts` -- même règle en démo.
- [x] Tests -- étendre `src/__tests__/integration/desinf.test.ts` (échéance selon intervalle, défaut 3, recalcul suppression), tests intégration PATCH/POST véhicule (400 si 4, recalcul, NULL conservé), `src/__tests__/components/EditVehicleModal.test.tsx` (select visible pour VPSP seulement, valeur envoyée).
- [x] `CHANGELOG.md`, `package.json`/`package-lock.json` (5.26.0), `CLAUDE.md` -- entrée utilisateur + ligne de migration « À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.26.0 ».

**Acceptance Criteria:**
- Given un VPSP, when un admin ouvre la modale d'édition, then un sélecteur 1/2/3 mois présélectionné sur la valeur enregistrée (3 par défaut) est visible ; il est absent pour un VL.
- Given la migration appliquée, when on consulte un VPSP désinfecté le 2026-09-10, then « Prochaine désinf. » vise le 2026-12-10.

## Design Notes

SQLite normalise les fins de mois (`date('2026-01-31', '+1 months')` = 2026-03-03) : comportement accepté, cohérent avec l'existant basé sur `date()`.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npm run test` -- expected: tous verts
- `npx tsx scripts/add-vehicle-desinf-interval.ts` sur une base locale -- expected: dry-run affiche les changements sans écrire

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge/blind | Recalcul PATCH dans un 2e UPDATE non atomique | medium | Deux `db.execute` successifs hors transaction → patch : fusion dans le même UPDATE |
| 2 | edge/blind | VPSP non-VPSP avec desinfTracking passent de 42 j à 3 mois sans UI | false | `nextDesinfMaxDate` n'est lu que dans la carte VPSP de `VehicleDetailGrid.tsx:94` : aucun effet visible |
| 3 | edge/blind | Débordement fin de mois SQLite (31/01 + 1 mois = 03/03) | false | Comportement accepté explicitement dans Design Notes |
| 4 | edge | `lastDesinfDate` non parsable → NULL à la migration | false | Toujours écrit via `date()` (3 routes) : format garanti |
| 5 | edge | Démo : `updateVehicle` ne recalcule pas l'échéance | low | Réel mais mode démo seulement ; correctif = nouvelle branche → rejeté |
| 6 | edge (claim) | « même règle en démo » partiel | low | Même cause que #5 → rejeté |
| 7 | edge (claim) | PATCH « recalcule » non atomique | medium | Même cause que #1 → patch |
| 8 | verif-gap | Check-in QR : nextDesinfMaxDate non vérifié | medium | `qr.test.ts:284-288` ne lit que lastDesinfDate → patch : test ajouté |
| 9 | verif-gap | GET ne vérifie pas `desinfIntervalMonths` (sinon reset silencieux à 3) | medium | Aucun test GET ne lit le champ → patch : test ajouté |
| 10 | verif-gap/blind | AddVehicleModal : sélecteur et payload non testés | medium | Règle projet (composant avec logique = test) → patch |
| 11 | blind | Recalcul même si intervalle inchangé | false | Idempotent : après migration l'échéance vaut déjà lastDesinf + intervalle |
| 12 | blind | API n'impose pas VPSP pour l'intervalle | low | Seul l'UI admin l'envoie, sans effet visible hors VPSP → rejeté |
| 13 | blind | Intervalle non affiché sur la fiche | low | Hors intention ; ajout d'UI → rejeté |
| 14 | blind | CHANGELOG muet sur le recalcul rétroactif | low | Correction directe d'une phrase → patch |
| 15 | blind | Plan dry-run sans COALESCE vs --apply | low | Correction directe → patch |
| 16 | blind | Emoji ⚠️ pour « rien à faire », seed sans intervalle non-défaut, note dev:prod | low | Cosmétique/improbable → rejeté |
| 17 | blind | VL→VPSP→VL garde un intervalle obsolète | false | Sans effet : l'intervalle n'est utilisé que pour les VPSP |
| 18 | blind | Type `number` trop large, listes dupliquées | low | Ajout d'un type partagé = complexité → rejeté |
| 19 | blind | Pas de test PATCH sans le champ / DemoDB | low | Improbable, pas de défaut démontré → rejeté |

---
title: 'Thèmes saisonniers — limiter un thème à une ou plusieurs UL'
type: 'feature'
created: '2026-10-03'
status: 'done'
baseline_commit: '9545df627f2538dca13aa5a9d2b579d4716aa24a'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-themes-saisonniers.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un thème activé s'affiche aujourd'hui pour toutes les UL. Le super admin veut pouvoir le réserver à une ou plusieurs UL.

**Approach:** Chaque thème reçoit une liste optionnelle d'UL. Une liste vide signifie « toutes les UL », c'est le comportement actuel. Le thème ne s'affiche que si l'**UL active de l'utilisateur sur l'appli** (`session.user.ulId`, celle du sélecteur d'UL) fait partie de la liste. Changer d'UL active réévalue le thème.

## Boundaries & Constraints

**Always:**
- Liste vide = toutes les UL, ce qui garde la compatibilité avec la v5.21.0.
- Le filtre se fait côté serveur dans `GET /api/themes/active`, à partir de `session.user.ulId`.
- Un utilisateur sans UL active ne voit que les thèmes « toutes les UL ».
- Deux thèmes activés ne sont en conflit (409) que si leurs plages de dates **et** leurs périmètres d'UL se recouvrent. « Toutes les UL » recouvre n'importe quelle liste.
- Les identifiants d'UL inconnus sont refusés (400).
- La mutation reste sous `withAudit`, et la règle super admin seulement ne change pas.

**Never:**
- Pas de ciblage par DT, par rôle ni par utilisateur.
- On ne touche pas à la feuille de style du thème (chantier parallèle `spec-themes-saisonniers-2.md`).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Toutes les UL | thème actif, liste vide, UL active quelconque | `theme` renvoyé | N/A |
| UL ciblée | liste `[UL18]`, UL active = UL18 | `theme` renvoyé | N/A |
| UL non ciblée | liste `[UL18]`, UL active = UL17 | `{ theme: null }` | N/A |
| Sans UL active | liste `[UL18]`, `session.user.ulId` absent | `{ theme: null }` | N/A |
| Changement d'UL | l'utilisateur passe de UL17 à UL18 | le thème apparaît sans rechargement | N/A |
| UL inconnue | `PUT` avec `ulIds: ['inexistante']` | 400 | message en français |
| Chevauchement, UL disjointes | A `[UL17]` et B `[UL18]`, mêmes dates | 200 | N/A |
| Chevauchement, UL communes | A « toutes » et B `[UL18]`, mêmes dates | 409 | « Plage en conflit avec le thème X » |

</frozen-after-approval>

## Code Map

- `src/lib/themes/schema.ts` -- ajouter `SEASONAL_THEME_UL_DDL` : table `SeasonalThemeUL(theme_key TEXT NOT NULL, ul_id TEXT NOT NULL REFERENCES "UniteLocale"(id), PRIMARY KEY(theme_key, ul_id))`.
- `scripts/add-seasonal-themes.ts` -- même script, idempotent : crée chaque table manquante. La prod n'a encore rien reçu ; la preview a `SeasonalTheme` mais pas la table de liaison. Mettre à jour son entrée dans `CLAUDE.md`.
- `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- créer la nouvelle table et la vider dans `truncateTables`.
- `src/lib/themes/catalog.ts` -- `ThemeRow` gagne `ul_ids: string[]`. Ajouter `matchesUl(row, ulId)` et `scopesOverlap(a, b)` ; `pickActiveTheme(rows, today, ulId)`.
- `src/app/api/themes/active/route.ts` -- charge les UL de chaque thème activé et filtre sur `session.user.ulId`.
- `src/app/api/settings/themes/route.ts` -- renvoie `ulIds` par thème.
- `src/app/api/settings/themes/[key]/route.ts` -- `ulIds: z.array(z.string()).max(200).default([])`, validation contre `UniteLocale`, conflit = dates ∩ périmètres. Upsert du thème et remplacement des lignes de liaison dans une seule `db.batch(..., 'write')`.
- `src/lib/contexts/SeasonalThemeContext.tsx` -- refetch quand `session.user.ulId` change (`useSession().data`). Ne pas casser le refetch sur `visibilitychange` / `focus`.
- `src/components/admin/ThemesTab.tsx` -- sur chaque carte : « Toutes les UL » (par défaut) ou une sélection multiple de cases à cocher, nourrie par `GET /api/ul` (même usage que `ULsTab`). Résumé affiché : « Toutes les UL » ou « 2 UL : Paris 18, Paris 17 ».
- `src/lib/contexts/ULContext.tsx` -- `session.user.ulId` est l'UL active ; `switchUL` met à jour la session. Lecture seule ici.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/themes/schema.ts`, `scripts/add-seasonal-themes.ts`, `CLAUDE.md`, `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- table de liaison et migration idempotente.
- [x] `src/lib/themes/catalog.ts` -- logique de périmètre (fonctions pures).
- [ ] Les trois routes -- filtre par UL, `ulIds` en lecture et en écriture, 400, 409, écriture atomique.
- [x] `src/lib/contexts/SeasonalThemeContext.tsx` -- refetch au changement d'UL active.
- [x] `src/components/admin/ThemesTab.tsx` (+ CSS) -- choix du périmètre d'UL.
- [ ] Tests : unitaires (`matchesUl`, `scopesOverlap`, `pickActiveTheme` avec UL), intégration (chaque ligne de la matrice), composants (choix des UL dans `ThemesTab` et PUT attendu ; refetch du contexte au changement d'`ulId`).
- [x] `CHANGELOG.md` -- compléter l'entrée 5.21.0 : un thème peut être réservé à certaines UL.

**Acceptance Criteria:**
- Given un thème réservé à Paris 18, when un bénévole multi-UL passe de Paris 17 à Paris 18 dans le sélecteur, then l'habillage apparaît. Il disparaît quand il revient sur Paris 17.
- Given un thème déjà enregistré sans liste d'UL (v5.21.0), when on ouvre l'onglet, then il affiche « Toutes les UL » et s'applique partout.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge+blind+verif | « Certaines UL seulement » sans case cochée enregistre le thème pour toutes les UL | medium | `ThemesTab` envoie `[]`, que le serveur lit comme « toutes » → patch (enregistrement bloqué + message) |
| 2 | edge+blind+verif | Supprimer une UL laisse des lignes orphelines : thème vu par personne, id brut affiché, 400 à chaque enregistrement | medium | `DELETE /api/ul/[id]` ne nettoie pas `SeasonalThemeUL` et les FK sont inactives → patch (nettoyage dans la route UL + filtrage des ids inconnus en lecture) |
| 3 | edge+blind | Échec du refetch après un changement d'UL : le thème de l'UL précédente reste | low | `load()` ne vide pas `active` sur `!res.ok` ou sur erreur → patch |
| 4 | blind | Un `ulIds` absent du PUT efface le périmètre | low | `.default([])` ; correction directe : champ optionnel, périmètre conservé s'il est absent → patch |
| 5 | blind | Le message du 409 ne parle pas des UL ; le CHANGELOG et le commentaire du PUT décrivent l'ancienne règle | low | Correction de texte → patch |
| 6 | blind | Le résumé liste les UL dans l'ordre des clics | low | Tri direct → patch |
| 7 | blind | La session porte `ulId = 'default'` plutôt que null | false | `auth.ts` : aucune UL n'a l'id `default`, donc `matchesUl` renvoie bien false pour un thème ciblé → rejeté |
| 8 | blind | `/api/ul` renvoie les tampons en base64 pour un simple choix de noms | low | Onglet super admin, appel ponctuel → rejeté |
| 9 | blind | L'échec de chargement de la liste des UL est silencieux | low | Rare, ajouterait de l'état → rejeté |
| 10 | edge+blind | Vérification du conflit et écriture non atomiques | low | Il faudrait deux super admins simultanés → rejeté |
| 11 | blind | Validation de `ulIds` (longueur, mélange d'ids valides et inconnus) | low | La 400 est atomique (rien n'est écrit) → rejeté |
| 12 | verif | Le chemin de migration partielle du script n'est pas testé | medium (non vérifié) | Aucun script de migration n'est testé dans le dépôt → defer |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: suite verte, y compris `audit-routes-coverage`
- `npm run build` -- expected: succès

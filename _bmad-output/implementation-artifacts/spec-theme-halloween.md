---
title: 'Thèmes saisonniers — thème « Halloween »'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_commit: '7d6c49f1e1bea50fa99d75e6aadaaa1032c7a2b4'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-themes-saisonniers-2.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le catalogue des thèmes saisonniers ne contient que « Fête des vendanges de Montmartre ». Le super admin veut aussi pouvoir activer un habillage « Halloween » fin octobre.

**Approach:** Ajouter un second thème `halloween` au catalogue, avec sa feuille de style dédiée et ses illustrations SVG, sur le même modèle que le thème des vendanges : activation, plage de dates et UL ciblées se gèrent dans l'onglet « Thèmes » existant, sans aucune migration.

**Décision (ton) :** habillage **ludique** — citrouilles souriantes, chauves-souris, petits fantômes, toiles d'araignée ; palette orange citrouille, violet nuit, vert slime ; rien de gore ni d'inquiétant.

## Boundaries & Constraints

**Always:**
- Mêmes invariants que la feuille des vendanges : toutes les règles préfixées par `html[data-season="halloween"]` (variante `.dark`), aucun décalage de mise en page (ni padding, marge, dimension ni largeur de bordure ; seulement couleurs, fonds, ombres, polices et pseudo-éléments absolus ou à encombrement nul, `pointer-events: none`).
- Ne jamais redéfinir `--crf-red*`, ne jamais cibler `.btn-danger` ni `.nav-logout-btn`.
- Animations uniquement sous `@media (prefers-reduced-motion: no-preference)`.
- Variantes claire et sombre, contrastes lisibles (focus ≥ 3:1).
- Illustrations dans `public/seasons/halloween/`, référencées uniquement en `url("/seasons/halloween/…")`.

**Never:**
- Aucune modification du schéma, des routes ni de la logique d'activation (`catalog.ts` hors ajout de l'entrée).
- Ne pas toucher à la feuille ni aux illustrations des vendanges.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Onglet Thèmes | super admin ouvre l'onglet | deux cartes : vendanges puis Halloween, chacune réglable | N/A |
| Activation | Halloween activé du 25/10 au 01/11, aujourd'hui 31/10 | `GET /api/themes/active` → `{ theme: 'halloween' }`, `<html data-season="halloween">` | N/A |
| Conflit | vendanges et Halloween activés sur des plages et UL qui se recouvrent | 409 existant | message en français existant |
| Masquage | l'utilisateur masque le thème | `data-season` retiré, appli strictement identique | N/A |

</frozen-after-approval>

## Code Map

- `src/lib/themes/catalog.ts` -- `SEASONAL_THEMES` : ajouter `{ key: 'halloween', label: 'Halloween', description: … }` après les vendanges. Rien d'autre ne change : `THEME_KEYS`, `pickActiveTheme`, les routes et `ThemesTab` lisent le catalogue.
- `src/styles/seasons/vendanges-montmartre.css` -- modèle à suivre (variables `--vm-*` en tête avec jeux d'URL clair/sombre, scènes de marge `body::before/::after` dès 1280 px, `.header::before` qui pend sous la navbar, `.header-brand::before`, `.header-title::after` animé, `.page-title/.section-title` `::before` filet + `::after` ornement à encombrement nul, cartes `.detail-card/.vehicle-card/.kpi-card/.chart-card/.stat-card/.breakdown-card`, `.btn-primary`, `.tab-btn.active`, `.vehicle-type-badge`, focus des champs). Lecture seule.
- `src/styles/seasons/halloween.css` -- nouvelle feuille, variables préfixées `--hw-*`.
- `public/seasons/halloween/` -- nouvelles illustrations SVG, versions `-d` pour le sombre quand le trait change de couleur.
- `src/app/layout.tsx` -- importer la feuille ; charger une police d'affiche via `next/font/google` (`preload: false`, variable `--font-season-halloween`) et l'ajouter à la `className` de `<html>`, comme `Anton`.
- `src/__tests__/unit/seasonal-theme-css.test.ts` -- garde-fous de la feuille des vendanges ; les paramétrer par thème (`describe.each`) pour couvrir `halloween.css` et `/seasons/halloween/`.
- `src/lib/contexts/SeasonalThemeContext.tsx`, `src/components/admin/ThemesTab.tsx`, routes `/api/themes/active` et `/api/settings/themes*` -- inchangés.

## Tasks & Acceptance

**Execution:**
- [x] `public/seasons/halloween/*.svg` -- dessiner les illustrations (guirlande qui pend de la navbar, ornement du logo, ornement de titre, filet de titre, coin de carte, petit motif du bouton, scènes de marge gauche/droite, trame de fond) -- habillage propre au thème.
- [x] `src/styles/seasons/halloween.css` -- feuille complète sur le modèle des vendanges -- respecter tous les invariants.
- [x] `src/app/layout.tsx` -- import CSS + police -- disponibilité sous `data-season="halloween"`.
- [x] `src/lib/themes/catalog.ts` -- entrée `halloween` -- rend le thème activable.
- [x] `src/__tests__/unit/seasonal-theme-css.test.ts` -- garde-fous pour chaque thème du catalogue ; ajouter un test que chaque clé du catalogue a sa feuille `src/styles/seasons/<key>.css`.
- [x] `src/__tests__/unit/seasonal-themes.test.ts` -- `pickActiveTheme` choisit `halloween` quand c'est le seul actif.
- [x] `package.json`, `package-lock.json`, `CHANGELOG.md` -- 5.23.0, entrée en français orientée utilisateur.

**Acceptance Criteria:**
- Given Halloween activé pour la plage du jour, when un utilisateur ouvre l'appli en clair puis en sombre, then l'habillage s'affiche dans les deux modes sans qu'aucun élément ne bouge par rapport à l'appli sans thème.
- Given le thème masqué ou hors plage, when la page s'affiche, then aucune règle Halloween ne s'applique.

## Implementation Notes

- Police d'affiche : Creepster (`next/font/google`, `preload: false`). Illustrations : guirlande, cadre du logo, fantôme suspendu, ornement et filet de titre, toile de coin de carte, citrouille du bouton, scènes de marge (maison hantée / arbre et chaudron), trame — variantes `-d` pour le sombre.
- Tests ajoutés côté intégration : `/api/themes/active` renvoie `halloween` dans sa plage, 409 entre vendanges et Halloween ; l'onglet liste trois thèmes avec le mock `autre-theme`.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind | Scène de droite (clair) : trait intérieur du tronc de la même couleur que le contour, donc invisible | low | `scene-right.svg` : traits 11 px et 7 px en `#2a1245` (sombre : `#6a4a9a`) → patch |
| 2 | blind+verif | Commentaires recopiés des vendanges (« scènes du 18e », « filet noir et jaune », « capitales condensées », « lavande ») | low | Correction directe → patch |
| 3 | blind+edge | Creepster en capitales sur les titres : moins lisible et la largeur du texte change | medium | Lisibilité réelle sur `.section-title` (petit corps, ombre de 2 px) → patch : Creepster limité à la navbar et aux titres de page. Le changement de métrique de police existe déjà avec Anton (vendanges), accepté → pas d'autre action |
| 4 | edge | `loadCss` lève pendant la collecte si une clé n'a pas de feuille | low | Garde directe → patch |
| 5 | blind | Aucun test ne vérifie l'import de la feuille dans `layout.tsx` | low | Ajout d'un test simple → patch |
| 6 | blind | Feuille copiée ligne à ligne de celle des vendanges, pas de socle commun | medium | Factoriser obligerait à toucher la feuille des vendanges, que l'intention exclut → defer |
| 7 | blind | Bouton principal désactivé identique au bouton actif | false | `globals.css:848` `.btn:disabled { opacity: 0.5 }` s'applique toujours |
| 8 | blind | Toile de coin de carte et citrouille du bouton posées sur le contenu | low | Mêmes dimensions que la grappe des vendanges, motif déjà accepté → rejeté |
| 9 | blind | Focus thématisé seulement sur les champs et `.btn-primary` ; rien pour `forced-colors` | low | Même couverture que les vendanges → rejeté |
| 10 | blind | La guirlande de la navbar collante couvre ~20 px de contenu | low | Même comportement que le sarment des vendanges → rejeté |
| 11 | blind | `ASSET_DIRS` codé en dur ; pas de test des paires clair/sombre | low | Le test échoue si une clé manque ; ajouter un champ au catalogue étendrait l'API → rejeté |
| 12 | blind | Règle « pas de propriété de mise en page » non testée | low | Ajouterait une analyse CSS complexe → rejeté |
| 13 | blind | Pas de test de plages adjacentes vendanges / Halloween | low | `rangesOverlap` est déjà testé avec des bornes incluses → rejeté |
| 14 | blind | Glyphes accentués de Creepster non vérifiés | low | Le sous-ensemble latin de Google Fonts couvre le Latin-1 → rejeté |
| 15 | edge | `join(undefined)` si une clé manque dans `ASSET_DIRS` | false | `expect(...).toBeTruthy()` échoue avant, sans assertion souple |
| 16 | — | `licenseCheck.test.ts` n°6 échoue | low | Échoue aussi sur `main` (`expected 15 to be 14`), sans lien avec ce changement → defer |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: suite verte
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- Activer Halloween en dev, vérifier navbar, titres, cartes, boutons, onglets et scènes de marge en clair et en sombre, à 375 px, 1280 px et 1600 px.

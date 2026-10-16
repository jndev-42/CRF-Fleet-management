---
title: 'Thème saisonnier « Noël »'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_commit: '834d8e37903eb5ef8afd2eb37cd828cb688f50b4'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-themes-saisonniers-2.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le catalogue des thèmes saisonniers ne contient que « Fête des vendanges de Montmartre ». Le super admin veut aussi pouvoir programmer un thème « Noël », aussi visible et complet que celui des vendanges.

**Approach:** On réutilise toute l'infrastructure existante : table, routes, onglet « Thèmes », contexte, bouton afficher/masquer et attribut `data-season`. On ajoute la clé `noel` au catalogue, une feuille `src/styles/seasons/noel.css` qui habille les mêmes éléments que le thème des vendanges (navbar, logo, titres, cartes, `.btn-primary`, onglets, badges, focus, fond de page et scènes latérales), ses illustrations SVG dans `public/seasons/noel/` et une police de titre. Le bouton de la navbar affiche une icône propre à chaque thème.

**Décisions (checkpoint du 16 octobre) :**
- Direction artistique **Noël traditionnel chaleureux** : vert sapin, or et crème, houx, guirlande lumineuse sous la navbar, neige posée sur les titres, sapin et cadeaux dans les marges.
- **Neige animée légère** qui tombe sur la page : calque fixe en superposition, quelques flocons, `pointer-events: none`, sans aucun effet sur la mise en page, coupée sous `prefers-reduced-motion`.

## Boundaries & Constraints

**Always:**
- Les contraintes de `spec-themes-saisonniers-2.md` s'appliquent telles quelles. Toutes les règles sont préfixées par `html[data-season="noel"]`. Aucun décalage de mise en page : on ne change ni le padding, ni les marges, ni les dimensions. Le contraste est AA en clair et en sombre. Les ornements sont `pointer-events: none` et ne recouvrent aucun texte. Les animations sont coupées sous `prefers-reduced-motion`. La police est chargée avec `preload: false`.
- La croix du logo n'est jamais recouverte ni recolorée. `.btn-danger`, `.nav-logout-btn`, les erreurs et les alertes gardent leur style d'origine. On ne redéfinit pas `--crf-red*`.
- Les boutons principaux ne passent pas au rouge, pour ne pas les confondre avec les actions de danger.
- Thème des vendanges inchangé (sauf l'icône du bouton, qui passe par la même table de correspondance).

**Never:**
- Ni nouvelle table, ni nouvelle colonne, ni migration : une ligne `SeasonalTheme` est créée à la première sauvegarde.
- On ne touche pas aux routes, au contexte ni à l'onglet admin (le catalogue les alimente déjà).

</frozen-after-approval>

## Code Map

- `src/lib/themes/catalog.ts` -- `SEASONAL_THEMES` : ajouter `{ key: 'noel', label: 'Noël', description }`. Rien d'autre à changer (routes, onglet et contexte lisent le catalogue).
- `src/styles/seasons/vendanges-montmartre.css` -- modèle de structure à suivre (variables clair/sombre, `body::before/::after` en scènes fixes à ≥ 1280 px, `.header::before/::after`, `.header-brand::before`, `.header-title`, `.page-title` / `.section-title` avec `::after` en ligne à encombrement nul, cartes, `.btn-primary`, `.tab-btn.active`, `.vehicle-type-badge`, focus). Reprendre aussi les corrections de sa revue (Review Triage Log de `spec-themes-saisonniers-2.md` : géométrie de la couronne du logo, débord ≤ 20 px sous la navbar, ornements de `.btn-sm`, focus contrasté).
- Neige animée : `body::before/::after` portent déjà les scènes latérales. On pose donc la neige sur `html[data-season="noel"]::before` (`position: fixed; inset: 0`, `z-index` au-dessus du contenu, `pointer-events: none`), en SVG de flocons répétés, animé par `background-position` dans `@media (prefers-reduced-motion: no-preference)`. Flocons clairsemés, semi-transparents, sans gêner la lecture (en clair, flocons à liseré gris-bleu pour rester visibles).
- `src/app/layout.tsx` l.2-21 -- import de la feuille et de la police (`Anton` sous `--font-season-vendanges`) : ajouter la police de Noël sous `--font-season-noel` et sa classe sur le même élément.
- `src/components/themes/SeasonalThemeToggle.tsx` -- l'icône `Grape` est en dur : passer par une correspondance `clé → icône lucide` (`noel` → `TreePine` ou `Snowflake`, `Grape` par défaut).
- `src/__tests__/unit/seasonal-theme-css.test.ts` -- ce test ne vise que les vendanges : le paramétrer avec `describe.each` sur `THEME_KEYS`, et vérifier que chaque clé a sa feuille `src/styles/seasons/<clé>.css` et que layout.tsx l'importe.
- `src/auth.config.ts` l.23 -- `/seasons` est déjà public : rien à faire.
- `src/__tests__/components/Navbar.test.tsx` l.67 -- modèle de test du bouton avec un thème actif.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/themes/catalog.ts` -- ajouter le thème `noel`.
- [x] `src/app/layout.tsx` -- police de titre de Noël (Google Fonts, lisible en titre, encombrement voisin d'Inter en gras, `preload: false`) sous `--font-season-noel`, et import de `noel.css`.
- [x] `public/seasons/noel/*.svg` -- illustrations (variantes `-d` pour le sombre si nécessaire) selon la direction artistique choisie.
- [x] `src/styles/seasons/noel.css` -- habillage complet sur le modèle des vendanges.
- [x] `src/components/themes/SeasonalThemeToggle.tsx` -- icône selon le thème.
- [x] Tests : `seasonal-theme-css.test.ts` paramétré sur tous les thèmes ; `seasonal-themes.test.ts` (le catalogue contient `noel`) ; test de composant du bouton (icône du sapin pour `noel`, grappe pour les vendanges).
- [x] `package.json` / `package-lock.json` 5.23.0, `CHANGELOG.md` (✨ Nouveautés, orienté utilisateur).

**Acceptance Criteria:**
- Given un super admin, when il ouvre Administration → Thèmes, then « Noël » apparaît à côté des vendanges, et il peut l'activer sur une plage qui ne chevauche pas un autre thème activé.
- Given le thème Noël actif, when on ouvre `/vehicles` en clair puis en sombre, sur desktop et à 375 px, then la navbar, le logo, les titres, le CTA « Emprunter », les onglets et les cartes portent le thème. La croix et les boutons de danger restent inchangés, et rien ne déborde horizontalement.
- Given le thème Noël actif, when on clique sur l'icône du thème dans la navbar, then l'appli redevient identique au rendu sans thème, sans aucun décalage.

## Implementation Notes

- Police : Playfair Display 700/800 (`next/font/google`, `preload: false`), plus étroite qu'Inter en gras : aucun titre ne passe à la ligne (boîtes mesurées identiques thème affiché / masqué).
- Illustrations générées en SVG (`public/seasons/noel/`) ; variantes `-d` seulement là où le sombre l'exige (guirlande : fil or ; filet des titres ; trame ; neige sans liseré).
- Neige : `html::before` fixe, rendu seulement sous `prefers-reduced-motion: no-preference`, `z-index: 90` (sous la navbar à 100 et sous les modales), deux couches de la même tuile (320 et 480 px), opacité 0,65 en clair et 0,4 en sombre ; calque dépassant de 960 px vers le haut, animé par `transform: translateY(960px)` (multiple commun des tuiles). Masquée à l'impression avec les scènes et la guirlande.
- Guirlande : 24 px à `top: calc(100% - 4px)` → débord de 20 px sous la navbar (18 px / 15 px en mobile), comme le sarment des vendanges.
- Bouton du thème : table `clé → { icône lucide, couleur }` ; `noel` → `TreePine` vert sapin, grappe violette par défaut.
- Test d'intégration `seasonalThemes.test.ts` : la longueur codée en dur du catalogue (2) passe à la liste explicite des clés, plus un cas « Noël activable hors de la plage des vendanges, 409 sinon ».
- Captures (appli réelle, dev port 3123, `data-season` posé côté client sans écriture en base) : `/vehicles`, `/users`, `/stats`, `/admin`, clair/sombre, 1440 et 375 px ; aucun débord horizontal, boîtes des boutons, onglets et cartes identiques thème affiché / masqué.
- Échec hors périmètre : `licenseCheck.test.ts` cas 6 (attend 14 jours, obtient 15) — calcul `Math.ceil` sur une période qui traverse le passage à l'heure d'hiver du 25 octobre ; fichiers non touchés ici.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind | La neige anime `background-position` sur un calque plein écran : la page entière est repeinte à chaque image | medium | `@keyframes noel-snow` sur `html::before` (`inset: 0`) ; coûteux sur les téléphones du terrain → patch (calque surdimensionné animé par `transform`) |
| 2 | blind | Sous `prefers-reduced-motion`, les flocons restent figés sur le texte | medium | La décision dit « neige coupée sous `prefers-reduced-motion` » ; aujourd'hui seule l'animation est coupée → patch (calque affiché uniquement sous `no-preference`) |
| 3 | blind | La neige passe au-dessus du contenu (z-index 90) | false | La décision gelée demande un « calque fixe en superposition » ; les flocons sont clairsemés, sous la navbar (100) et les modales (≥ 200) → rejeté |
| 4 | blind | Une carte sur trois a un bandeau rouge, qui se lit comme une alerte | low | `#a3161f` via `nth-child(3n)` sur les cartes de véhicule et de KPI ; correction directe → patch (vert et or seulement) |
| 5 | blind | Le bandeau en `inset` se superpose à la barre de statut de `.stat-card` (`::before`, 3 px) | low | `globals.css` l.420 → patch (retirer `.stat-card` des règles de bandeau) |
| 6 | edge | Au survol, les cartes de véhicule perdent leur ombre portée | low | La règle du thème (0,2,1) l'emporte sur `.vehicle-card:hover` (l.515, `--shadow-lg`) → patch |
| 7 | blind | Aucune règle d'impression : neige, scènes et guirlande s'impriment | low | Correction directe (`@media print` qui masque les ornements) → patch |
| 8 | blind | Aucun test d'une plage qui passe le Nouvel An | low | Cas naturel pour Noël (jusqu'à l'Épiphanie) ; un test suffit → patch |
| 9 | blind | Le changement de police peut modifier la largeur des titres | low | Même constat que le n°10 des vendanges : la police « à encombrement voisin » est autorisée ; aucun retour à la ligne vu à 375 px → rejeté |
| 10 | blind | Correspondance icône ↔ thème séparée du catalogue | low | La grappe par défaut est voulue ; le catalogue reste sans React → rejeté |
| 11 | blind+edge | Test des `url()` élargi à `/seasons/` : un chemin hors dossier ou mal écrit peut passer | low | Le test vérifie quand même l'existence sur disque ; risque théorique → rejeté |
| 12 | blind | Promesses de l'en-tête CSS non testées (`pointer-events`, z-index) | low | Ajouterait un analyseur plus lourd ; vérifié à la main → rejeté |
| 13 | blind | Double filet or sous la navbar ; or clair codé en dur en sombre | low | Bordure de 1 px + filet de 3 px = un seul trait de 4 px ; écart de teinte cosmétique → rejeté |
| 14 | blind | Le test du bouton s'appuie sur les classes de lucide et ne couvre pas l'état affiché | low | Cosmétique côté tests → rejeté |
| 15 | blind | `package-lock.json` absent du diff | false | Exclu volontairement du fichier de revue ; la version y est bien passée à 5.23.0 → rejeté |
| 16 | edge | L'ornement devient un élément flex dans les titres `flex` | low | Même constat que le n°27 des vendanges → rejeté |
| 17 | edge | L'ornement déborde de ~42 px quand le titre remplit la ligne | low | Aucun débordement horizontal mesuré à 375 px (même géométrie que les vendanges) → rejeté |
| 18 | edge | `THEME_ICONS['constructor']` ferait planter le bouton | false | `theme` vient de `/api/themes/active`, qui ne renvoie que des clés du catalogue → rejeté |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: suite verte
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- **Obligatoire, avec captures :** `npm run dev`, activer « Noël » sur une plage couvrant aujourd'hui (en désactivant les vendanges si leur plage chevauche). Capturer `/vehicles`, `/users` et une page de cartes, en clair et en sombre, sur desktop et à 375 px. Comparer avec le même écran thème masqué.

---
title: 'Thème « Fête des vendanges de Montmartre » — refonte visuelle « affiche Montmartre »'
type: 'feature'
created: '2026-10-03'
status: 'in-review'
baseline_commit: 'ecb3c8a5fcb27faab819509a73a8c56c58042010'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/_bmad-output/implementation-artifacts/spec-themes-saisonniers.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le premier rendu du thème (quelques grappes et un sarment) est jugé trop discret et « cheap » (capture du 3 octobre). L'utilisateur veut un vrai thème qui se voit : boutons modifiés, logo habillé, décoration des textes, etc.

**Approach:** On garde toute l'infrastructure livrée par `spec-themes-saisonniers.md` (table, routes, onglet admin, contexte, bouton afficher/masquer, attribut `data-season`). Seule la feuille `vendanges-montmartre.css` est réécrite (avec ses éventuels assets) dans une direction « affiche Montmartre ».

**Décisions (checkpoint du 3 octobre) :**
- Direction artistique **affiche Montmartre / Belle Époque**, façon Toulouse-Lautrec : bordeaux profond, or et crème, titres dans une typo Art nouveau, ornements de vigne en arabesques, filets dorés.
- **Boutons principaux** (`.btn-primary`) **recolorés** en dégradé bordeaux, liseré or et petite grappe. Les boutons de danger (`.btn-danger`) restent rouges.
- Le thème habille **tout** :
  - la navbar et le logo : fond thématisé, couronne de vigne autour du logo, « Martine » dans la typo du thème ;
  - les titres et les textes : typo du thème, soulignement ornemental, fleuron ;
  - les cartes et le fond de page : ornements de vigne aux coins, bordure dorée, motif discret en fond ;
  - les onglets, badges et champs : onglet actif, badges et focus aux couleurs du thème.

**Révision demandée par l'utilisateur (3 octobre, après revue visuelle) :** le style Belle Époque ne fait pas penser aux vendanges (« on veut du raisin ! des vignes ! »). La direction artistique devient **celle de l'affiche officielle 2026** (pop, sérigraphie / risographie) : aplats vifs jaune, cyan, rose, vert feuille et violet raisin tramé, typo condensée grasse en capitales, filets noirs épais. Motifs dominants : grappes et feuilles de vigne, plus des clins d'œil Montmartre et musique (Sacré-Cœur, enceintes, « Le 18e donne le rythme »). On s'inspire de l'affiche sans reprendre son image. Le bordeaux et l'or ne sont plus imposés. Le reste du périmètre et toutes les contraintes ci-dessous restent valables.

## Boundaries & Constraints

**Always:**
- Toutes les règles restent préfixées par `html[data-season="vendanges-montmartre"]` : masquer le thème ou sortir de la plage rend l'appli strictement identique à aujourd'hui.
- Toujours aucun décalage de mise en page. On peut changer couleurs, fonds, bordures, ombres, polices et pseudo-éléments superposés. On ne change ni le padding, ni les marges, ni les dimensions. Une police de remplacement doit garder un encombrement voisin : titres sur une ligne qui ne passent pas à deux.
- Contraste texte/fond au moins AA, en clair et en sombre. Les ornements sont `pointer-events: none` et `aria-hidden`, et ne recouvrent aucun texte. Animations coupées sous `prefers-reduced-motion`.
- La police Art nouveau est chargée via `next/font/google` et exposée en variable CSS, utilisée seulement sous le sélecteur du thème.
- Les assets sont en SVG inline (data URI) ou en `.png` dans `public/`.

**Never:**
- La croix rouge du logo n'est ni recolorée, ni déformée, ni recouverte : l'emblème est protégé. On décore autour (couronne, cadre).
- `.btn-danger`, les erreurs et les alertes restent rouges.
- On ne redéfinit pas `--crf-red*` globalement, car cela repeindrait les erreurs.
- On ne touche pas aux routes, à la table ni à l'onglet admin.

</frozen-after-approval>

## Code Map

- `src/styles/seasons/vendanges-montmartre.css` -- la feuille du thème, à réécrire entièrement (variables du thème, puis composants).
- `src/app/globals.css` -- classes à habiller :
  - `.header` l.147 (sticky), `.header-brand` l.163, `.header-logo` l.171 (`<Image src="/crf-logo.svg">`, `Navbar.tsx` l.38), `.header-title` l.177 ;
  - `.nav-link` / `.nav-link.active` l.230-245, `.page-title` l.391, `.section-title` l.491, `.detail-card` l.737 ;
  - `.btn-primary` l.853 (+ `:hover` l.859), `.btn-secondary` l.865, `.form-input:focus` l.937, `.tab-btn.active` l.2111.
  - Repérer aussi les classes de carte et de badge génériques et le fond de `body` / `.app-container`.
- `src/app/vehicles/QuickBorrowCta.tsx` l.33 -- le gros CTA « Emprunter » est un `btn btn-primary btn-lg` : c'est le cas témoin de la capture.
- `src/app/layout.tsx` -- `Inter` via `next/font/google` (l.6) : y ajouter la police du thème sur le même modèle (variable CSS sur `<html>` ou `<body>`).
- `src/lib/contexts/SeasonalThemeContext.tsx` -- pose `data-season` ; à ne pas modifier.
- 38 feuilles CSS Modules utilisent `--crf-red` pour des accents locaux. On les laisse, sauf un accent très visible qui jurerait (à noter dans Implementation Notes).

## Tasks & Acceptance

**Execution:**
- [x] `src/app/layout.tsx` -- charger une police Art nouveau / Belle Époque de Google Fonts (par exemple `Cinzel Decorative`, `Limelight` ou `Federo` ; choisir la plus lisible en titre) sous une variable CSS `--font-season-vendanges`, sans l'appliquer hors thème.
- [x] `src/styles/seasons/vendanges-montmartre.css` -- réécriture selon les décisions :
  - variables (bordeaux, or, crème, vert vigne), avec des déclinaisons clair et sombre ;
  - navbar : fond bordeaux avec motif de vigne, filet or en bas, couronne de vigne autour du logo, « Martine » dans la typo du thème avec une grappe ;
  - liens de navigation actifs en or ;
  - titres : typo du thème, filet ou fleuron doré en `::after` sous le titre (superposé) ;
  - `.btn-primary` : dégradé bordeaux, liseré or, grappe, hover ;
  - cartes : bordure or et ornements de coin ;
  - fond de page : motif très léger ;
  - onglets actifs, badges et focus des champs en or ou bordeaux.
- [x] `public/seasons/vendanges/*.png` (si besoin) -- ornements trop riches pour un data URI.
- [x] `CHANGELOG.md` -- réécrire l'entrée 5.21.0 du thème (orientée utilisateur) pour décrire le nouveau rendu (version inchangée, la PR #132 n'est pas mergée).
- [x] `src/__tests__/unit/seasonal-theme-css.test.ts` -- lire la feuille et vérifier que chaque sélecteur commence par `html[data-season="vendanges-montmartre"]` (ou est un `@keyframes` / `@media` qui l'englobe), et qu'aucune règle ne cible `.btn-danger` ni ne redéfinit `--crf-red`.

**Acceptance Criteria:**
- Given le thème actif, when on ouvre `/vehicles` en sombre puis en clair, then la navbar, le logo, le titre, le CTA « Emprunter », les onglets et les cartes portent visiblement le thème, alors que la croix et les boutons de danger restent inchangés.
- Given le thème actif, when on clique sur l'icône 🍇 pour le masquer, then l'appli redevient identique au rendu sans thème et aucun élément ne change de position.
- Given un mobile (375 px), when le thème est actif, then rien ne déborde horizontalement et les titres ne passent pas à la ligne à cause de la police.

## Implementation Notes

- Police : Federo (`next/font/google`, `preload: false`), utilisée seulement sous `data-season`.
- Déconnexion : le bouton danger d'origine (texte rouge sur fond transparent) était illisible sur la navbar bordeaux. Il passe en rouge plein (fond `--crf-red`, texte blanc) : il reste rouge et reconnaissable. Le test borne les seules déclarations autorisées.
- Captures vérifiées (clair, sombre, tiroir mobile) dans le scratchpad de la session.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | blind+edge+moi | Le bouton Déconnexion (`btn btn-danger nav-logout-btn`, Navbar l.149) est recoloré en crème, et devient illisible au survol | medium | Contredit « `.btn-danger` restent rouges » ; vu sur la capture → patch (retirer la règle, et le test interdit aussi `nav-logout-btn`) |
| 2 | edge+impl | Cloche sombre sur la navbar bordeaux en clair | medium | Couleur inline `var(--text-primary)`, visible sur `z-light-vehicles.png` → patch |
| 3 | edge+blind | Tiroir mobile en clair : texte crème hérité de `.header` sur fond clair | medium | `.header` impose la couleur crème, le tiroir garde un fond clair → patch |
| 4 | blind | Le cadre du logo et sa grappe débordent sur l'emblème | medium | Géométrie : le rect intérieur va de 10,5 à 43,5 alors que le logo occupe 9 à 45, et la grappe descend jusqu'à y ≈ 52 → contredit le « Never » sur la croix → patch |
| 5 | blind+edge | Les ornements de coin (20 px à 3 px du bord) débordent sur le contenu des cartes (padding de 16 à 20 px) | medium | Contredit « ne recouvrent aucun texte » → patch (12 px, à 2 px du bord) |
| 6 | blind+edge | Federo préchargée sur toutes les pages, toute l'année | low | Correction directe `preload: false` → patch |
| 7 | edge | La grappe du `.btn-primary` à -6/-4 px est rognée, ou ajoute une barre de défilement dans les conteneurs qui défilent | low | Correction directe (ornement à l'intérieur de la boîte) → patch |
| 8 | blind | `--vm-grape` jamais utilisée, et `transform` sans effet | low | Suppression → patch |
| 9 | blind | `backdrop-filter` inutile sous une navbar opaque | low | Correction directe → patch |
| 10 | blind+edge | Le changement de police modifie la largeur des titres | low | La spec gelée autorise la police du thème « à encombrement voisin », décision de l'utilisateur → rejeté |
| 11 | blind | Le mode sombre ne teinte que `--bg-primary` | low | Cosmétique, pas de défaut fonctionnel → rejeté |
| 12 | edge | Lien actif du tiroir mobile en bordeaux plutôt qu'en or | low | Contraste correct sur fond clair → rejeté |
| 13 | edge | Le test lit la CSS relativement au cwd | false | Vitest s'exécute toujours à la racine (`npm run test`) → rejeté |
| 14 | blind | Regex reduced-motion fragile ; `translateY` du hover déjà présent dans globals | low | Le hover existait avant ce changement ; fragilité théorique → rejeté |
| 15 | blind | Aucun test contre les décalages de mise en page | low | Contrôle visuel exigé par la spec → rejeté |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: suite verte
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- **Obligatoire, avec captures :** `npm run dev`, puis activer le thème sur une plage couvrant aujourd'hui (super admin dev). Capturer `/vehicles`, `/users` (onglets) et une page avec des cartes, en sombre et en clair, sur desktop et à 375 px. Comparer avec la capture du même écran thème masqué, pour confirmer qu'il n'y a aucun décalage. Joindre les captures au rapport.

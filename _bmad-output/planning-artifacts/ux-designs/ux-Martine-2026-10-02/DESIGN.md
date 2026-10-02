---
name: Martine — Vue DT (filtres de disponibilité)
description: Référence visuelle de l'incrément « filtres de la Vue DT » du tableau de bord véhicules. Aucun nouveau langage visuel — ce document pointe vers les variables et classes existantes de src/app/globals.css et ne précise que les deux variantes de badge manquantes.
status: draft
updated: 2026-10-02
sources:
  - src/app/globals.css
  - src/app/vehicles/page.tsx
colors:
  # Valeurs recopiées de globals.css (:root = clair, .dark = sombre) — globals.css fait foi.
  crf-red: '#E30613'
  crf-red-light: '#FF2D3A'
  bg-primary: '#F9FAFB'
  bg-primary-dark: '#0A0B0E'
  bg-secondary: '#FFFFFF'
  bg-secondary-dark: '#12141A'
  bg-card: '#FFFFFF'
  bg-card-dark: '#181B23'
  bg-card-hover: '#F3F4F6'
  bg-card-hover-dark: '#1E2230'
  border-primary: '#E5E7EB'
  border-primary-dark: 'rgba(255,255,255,0.06)'
  border-hover: '#D1D5DB'
  text-primary: '#111827'
  text-primary-dark: '#F0F1F5'
  text-secondary: '#4B5563'
  text-secondary-dark: '#9398A7'
  text-muted: '#6B7280'
  status-available: '#22C55E'
  status-inuse: '#F59E0B'
  status-maintenance: '#EF4444'
typography:
  body:
    fontFamily: 'var(--font-inter), Inter, -apple-system, sans-serif'
    note: 'Hérité de globals.css, aucune surcharge.'
  filter-label:
    fontSize: 13px
    fontWeight: '500'
    note: 'Identique à .filter-btn.'
  legend:
    fontSize: 12px
    fontWeight: '600'
    letterSpacing: 0.3px
    note: 'Intitulés de groupe (« Disponibilité », « Type ») — même métrique que .status-badge, sans majuscules forcées.'
rounded:
  sm: 8px   # --radius-sm
  md: 12px  # --radius-md
  lg: 16px  # --radius-lg
  xl: 20px  # --radius-xl
  pill: 20px # .filter-btn / .status-badge / .vehicle-type-badge
spacing:
  chip-gap: 8px      # .filters-bar gap
  bar-bottom: 24px   # .filters-bar margin-bottom
components:
  filter-chip:
    class: '.filter-btn'
    radius: '{rounded.pill}'
    border: '{colors.border-primary}'
    foreground: '{colors.text-secondary}'
  filter-chip-active:
    class: '.filter-btn.active'
    background: '{colors.crf-red}'
    foreground: '#FFFFFF'
  status-badge-available:
    class: '.status-badge.available'
    foreground: '{colors.status-available}'
  status-badge-inuse:
    class: '.status-badge.inuse'
    foreground: '{colors.status-inuse}'
  status-badge-maintenance:
    class: '.status-badge.maintenance'
    foreground: '{colors.status-maintenance}'
  status-badge-partial:
    note: 'NOUVELLE variante, composée de tokens existants.'
    background: 'transparent'
    border: '1px dashed {colors.status-available}'
    foreground: '{colors.status-available}'
  status-badge-reserved:
    note: 'NOUVELLE variante, composée de tokens existants.'
    background: '{colors.bg-card-hover}'
    foreground: '{colors.text-secondary}'
  ul-badge:
    note: 'Badge « UL xxx » déjà présent sur les cartes en Vue DT — inchangé.'
  filters-panel:
    class: '.card'
    background: '{colors.bg-secondary}'
    border: '{colors.border-primary}'
    radius: '{rounded.lg}'
---

## Brand & Style

Aucune évolution d'identité. L'incrément s'insère dans l'interface existante de Martine : cartes blanches (ou anthracite en sombre) sur fond gris clair, accent rouge Croix-Rouge `{colors.crf-red}` réservé à l'état actif, pastilles de statut vert / ambre / rouge. Le panneau de filtres de la Vue DT doit avoir l'air d'avoir toujours été là. **`src/app/globals.css` fait foi** : les valeurs de ce fichier en sont une copie, pour lecture seule.

## Colors

- **Rouge CRF `{colors.crf-red}`** — puce de filtre active (`.filter-btn.active`) et segment actif du sélecteur Maintenant / Période. Rien d'autre dans le panneau.
- **Statuts** — on réutilise `--status-available`, `--status-inuse` et `--status-maintenance` (avec leurs fonds `-bg`) pour Disponible, En mission et Maintenance, comme aujourd'hui.
- **Deux variantes de badge sont nouvelles mais ne créent aucun token** :
  - *Partiellement disponible* : texte `--status-available`, fond transparent, bordure **pointillée** `--status-available`. On lit « vert, mais pas entièrement ». [ASSUMPTION]
  - *Réservé* : texte `--text-secondary` sur `--bg-card-hover`, un neutre. Un véhicule réservé n'est ni en panne ni en route : il est seulement pris. [ASSUMPTION]
- **Clair / sombre** : géré par `next-themes` (classe `.dark`). Les variantes ci-dessus ne s'appuient que sur des variables qui ont déjà une valeur dans les deux thèmes.

## Typography

Inter, héritée. Les puces reprennent la métrique de `.filter-btn` (13 px / 500). Le compteur placé dans une puce suit le libellé, au même corps, entre parenthèses ou séparé par un espace fin. Les intitulés de groupe utilisent `{typography.legend}` en `--text-muted`.

## Layout & Spacing

- Panneau de filtres = un bloc `.card` placé **entre FleetStatsRow et le calendrier** de la Vue DT. Les groupes s'y empilent verticalement : Temporalité, Disponibilité, Type, puis Options d'affichage.
- Dans un groupe, les puces suivent la mécanique de `.filters-bar` (flex, `wrap`, gap `{spacing.chip-gap}`).
- La grille de résultats reste `.vehicle-grid`. En mode « Regrouper par UL », chaque groupe a un intitulé de section simple (texte `--text-primary`, compteur `--text-muted`) suivi de sa propre `.vehicle-grid`.

## Shapes

Les puces, les badges de statut, de type et d'UL sont en pilule (`{rounded.pill}`). Le panneau est en `{rounded.lg}` comme les autres `.card`. Les champs date-heure reprennent le style d'input existant (`--bg-input`, `--radius-sm`).

## Components

| Élément | Classe existante | Delta |
|---|---|---|
| Sélecteur Maintenant / Période | `.filter-btn` ×2 accolés | Aucun ; l'actif prend `.active` |
| Raccourcis de période | `.filter-btn` | Aucun ; un raccourci est « actif » tant que les dates saisies correspondent exactement |
| Puces Disponibilité / Type | `.filter-btn` + compteur | Compteur en `opacity: .8` dans l'état actif |
| Badge statut sur carte | `.status-badge` + `.available` / `.inuse` / `.maintenance` | + `.partial`, `.reserved` (voir frontmatter) |
| Badge type | `.vehicle-type-badge` | Aucun |
| Ligne « créneaux » sur carte (mode Période) | texte `--text-secondary`, 12 px | Nouvelle ligne de texte, pas de composant graphique |
| Bouton Réinitialiser / Réessayer | `.btn` (variante secondaire existante) | Aucun |

## Do's and Don'ts

- **À faire** : ne composer qu'avec des variables existantes ; vérifier chaque nouvel élément en thème clair puis en thème sombre.
- **À faire** : toujours accompagner la couleur d'un statut d'un libellé texte (les pastilles 🟢🟡🔴 actuelles restent).
- **À éviter** : créer une palette, une ombre ou une police nouvelle.
- **À éviter** : utiliser le rouge CRF pour un statut. Il signale l'état « actif » d'un filtre, alors que `--status-maintenance` signale la maintenance.

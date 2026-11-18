---
name: Martine — Suivi technique de la flotte
description: Référence visuelle du module « Suivi technique » (onglet de /vehicles). Aucun nouveau langage visuel ; réutilise src/app/globals.css et ne précise que les pastilles, cartes de tableau et encart prioritaire.
status: final
updated: 2026-11-18
sources:
  - _bmad-output/specs/spec-vehicle-action-tracking/SPEC.md
  - src/app/globals.css
colors:
  # globals.css fait foi (:root clair, .dark sombre). Seules les teintes ajoutées sont listées.
  crf-red: '#E30613'
  status-available: '#22C55E'
  status-inuse: '#F59E0B'
  status-maintenance: '#EF4444'
  state-todo: '#9398A7'      # = text-secondary
  state-doing: '#60A5FA'
  state-waiting: '#F59E0B'   # = status-inuse
  state-done: '#22C55E'      # = status-available
  pill-contact: '#A78BFA'    # fond rgba(139,92,246,.14), déjà utilisé par le bandeau Vue DT
  pin: '#FBBF24'
typography:
  body:
    fontFamily: 'var(--font-inter), Inter, -apple-system, sans-serif'
  stat-value:
    fontSize: 36px
    fontWeight: '800'
  card-title:
    fontSize: 13.5px
    fontWeight: '600'
  pill:
    fontSize: 12px
    fontWeight: '600'
rounded:
  sm: 8px   # --radius-sm : boutons, champs
  md: 12px  # --radius-md : cartes de tâche, bascule
  lg: 16px  # --radius-lg : cartes, compteurs
  xl: 20px  # --radius-xl : modale, pastilles
spacing:
  grid-gap: 16px
  kanban-gap: 14px
  card-pad: 12px
components:
  view-toggle:
    reuse: 'bascule Vue UL / Vue DT de src/app/vehicles/page.tsx (.btn-primary / .btn-secondary)'
  sub-tabs:
    class: '.tab-bar / .tab-btn'
  stat-card:
    radius: '{rounded.lg}'
    value: '{typography.stat-value}'
  task-card:
    radius: '{rounded.md}'
    background: 'var(--bg-card)'
  pill-vehicle:
    background: '#262B38'
  pill-contact:
    foreground: '{colors.pill-contact}'
  priority-panel:
    border: 'rgba(245,158,11,.28)'
    title: '{colors.pin}'
---

## Brand & Style

Outil interne sobre de la Croix-Rouge : même en-tête, mêmes boutons et onglets que le reste de Martine. La maquette « Flotte 18 » fournie donne la structure, pas un thème. Maquette de référence : [mockups/suivi-technique.html](mockups/suivi-technique.html) — ce document l'emporte en cas d'écart.

## Colors

Rouge CRF réservé aux actions principales et à l'onglet actif. Les quatre états de tâche portent une pastille de couleur en tête de colonne ({colors.state-todo}, {colors.state-doing}, {colors.state-waiting}, {colors.state-done}). Compteurs : valeur colorée selon l'urgence (rouge échéances, ambre pièces, bleu contrôles, neutre dossiers). Clair et sombre via les variables existantes uniquement.

## Typography

Inter hérité. Titre de page 28/800 (`.page-title`). Valeurs de compteur {typography.stat-value}. Titres de carte {typography.card-title}.

## Layout & Spacing

Tableau de bord : 4 compteurs en grille, puis colonne principale « Prochaines actions » et colonne droite de 340 px (encart prioritaire, véhicules). Tableau : 4 colonnes égales ; 2 sous 1100 px ; sections empilées sous 700 px.

## Shapes

Cartes {rounded.lg}, cartes de tâche {rounded.md}, pastilles en pilule.

## Components

- **Pastilles** : véhicule (indicatif, fond gris), contact (violet, 🏷), incident (rouge), contrôle (bleu), Prioritaire (ambre), échéance (rouge si dépassée ou ≤ 7 j, ambre ≤ 30 j, neutre sinon).
- **Carte de tâche** : pastilles, titre, dossier/incident en ligne secondaire, pied échéance + 📎 nombre + avatars des assignés ; 📌 à droite si épinglée ; terminée = barrée et atténuée.
- **Contact partagé** : bordure pointillée violette et pastille « Proposé par l'UL X » ; cadenas à la place du crayon.
- **Encart « À confirmer en priorité »** : fond ambre léger, un sous-bloc par élément épinglé.

## Do's and Don'ts

- Do : réutiliser `.btn`, `.tab-bar`, `.status-badge`, les variables de couleur.
- Don't : introduire une barre latérale ou un thème propre au module ; coder l'état par la couleur seule (le libellé est toujours présent).

---
title: 'Cloche de notifications lisible sur mobile (modale)'
type: 'bugfix'
created: '2026-10-22'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Sur mobile, la cloche est rangée dans le menu hamburger ; son menu déroulant (320 px, positionné en absolu dans ce panneau) déborde et devient illisible.

**Approach:** Sur petit écran (≤ 768 px, point de rupture de l'appli), ouvrir le contenu de la cloche dans une modale en feuille basse (même habillage que les modales existantes, rendue hors du menu hamburger), avec un bouton de fermeture, fermeture par Échap et par clic sur le fond ; le menu déroulant desktop reste inchangé. Le contenu (liste, « Effacer », interrupteur push, messages d'erreur) est le même dans les deux cas.

</frozen-after-approval>

## Implementation Notes

- `src/components/NotificationBell.tsx` : contenu extrait dans un `panel` commun ; desktop = menu déroulant inchangé ; mobile (`matchMedia('(max-width: 768px)')` via `useSyncExternalStore`) = modale rendue par portail dans `document.body` (classes `.modal-overlay` / `.modal`, au-dessus du panneau hamburger : z-index 1100 > 1000), bouton de fermeture, Échap, clic sur le fond, défilement bloqué, focus dans la modale puis rendu à la cloche, `aria-expanded` / `aria-haspopup` sur la cloche.
- `src/components/Navbar.tsx` : nouvelle prop `onNavigate` de la cloche, qui referme le menu hamburger quand une notification ouvre une page.
- `src/__tests__/setup.ts` : `matchMedia` simulé (desktop par défaut), absent de jsdom.
- Vérification : lint 0/0, 278 fichiers / 3354 tests verts, build OK. Rendu non vérifié visuellement sur un vrai téléphone.

## Review Triage Log

- La modale se ferme au `mousedown` : le clic qui suit traverse vers le menu hamburger — medium, corrigé (fermeture au `click` sur le fond, clic extérieur ignoré sur mobile).
- Pas de gestion du focus dans la modale — medium, corrigé (focus sur la fermeture, rendu à la cloche) ; piège de focus complet non ajouté (low, la modale se ferme par Échap et par le fond).
- `aria-expanded` / `aria-haspopup` absents sur la cloche — low, corrigé (direct).
- Changelog « rien ne change sur ordinateur » alors qu'Échap ferme aussi le menu — low, corrigé (texte).
- Fond de la modale différent de l'en-tête et du pied collants — low, corrigé (fond `--bg-card`).
- Pas de prise en compte de la zone de l'indicateur d'accueil iOS ni des barres du navigateur — medium, corrigé (`85dvh`, `env(safe-area-inset-bottom)`).
- `id` du titre codé en dur — low, corrigé (`useId`).
- Défilement déjà bloqué par une autre fenêtre — couvert par un test ajouté.
- Notifications non atteignables au clavier (`div` cliquables) — low, préexistant : reporté dans `deferred-work.md`.
- Double tap sur une notification pendant la suppression — low, préexistant et rare : rejeté.
- Passage mobile ↔ desktop (rotation) non testé — low, simulation d'événements `matchMedia` coûteuse : rejeté.
- Spec non finalisée — false, finalisée à cette étape.


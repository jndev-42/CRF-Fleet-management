---
name: Martine — Suivi technique de la flotte
status: final
updated: 2026-11-18
sources:
  - _bmad-output/specs/spec-vehicle-action-tracking/SPEC.md
companions:
  - DESIGN.md
  - mockups/suivi-technique.html
---

## Foundation

Web responsive (bureau et téléphone, PWA existante). Pas de bibliothèque d'interface : composants maison, CSS Modules + `globals.css`. Visuel : [DESIGN.md](DESIGN.md). Maquettes : [mockups/suivi-technique.html](mockups/suivi-technique.html) (8 écrans) ; ce document l'emporte en cas d'écart.

## Information Architecture

`/vehicles` → bascule « 🚗 Flotte » / « 🔧 Suivi technique » (visible des seuls RESP_VEHICULE / ADMIN ; mémorisée dans l'URL `?vue=suivi`). Sous-onglets :

| Onglet | Contenu | CAP |
|---|---|---|
| Vue d'ensemble | 4 compteurs, prochaines actions, encart prioritaire, véhicules | 11 |
| Tâches | tableau à colonnes ou liste, filtres | 4, 5, 6 |
| Dossiers | liste, puis détail d'un dossier | 7, 8, 9 |
| Contrôles | échéances CT / révision / désinfection, rendez-vous | 10 |
| Contacts | contacts de l'UL, prestataires proposés, export | 1, 2, 3 |

Fiche véhicule : nouvelle section « Suivi technique » (historique, CAP-13). Modale de tâche ouverte depuis partout. Notifications d'attribution : cloche existante (CAP-12).

## Voice and Tone

Tutoiement absent, phrases courtes, verbes d'action : « Fixer un RDV », « Marquer reçue », « Clore le dossier », « Déplacer vers… ». Échéance vide = « Date à fixer ». Partage = « Proposé par l'UL X ».

## Component Patterns

| Composant | Comportement |
|---|---|
| Compteur | clic → onglet correspondant, filtre appliqué |
| Ligne « Prochaines actions » | case à cocher → Terminé (annulable par un toast « Annuler ») ; « Modifier » → modale |
| Carte de tâche | clic → modale ; glisser vers une colonne → change l'état |
| Sélecteur d'assignés | recherche ; ne liste que RESP_VEHICULE / ADMIN actifs de l'UL |
| Rattachements | un champ unique « + Véhicule · contact · incident · maintenance », résultats groupés par type |
| Pièce à récupérer | « Marquer reçue » → saisie facultative d'une valeur ou d'un fichier |
| Épingle | bouton bascule sur tâche et dossier ; plusieurs épingles possibles |
| Export contacts | télécharge un `.vcf` (contacts de l'UL + proposés) |

## State Patterns

- Vide : « Aucune tâche pour l'instant » avec bouton « + Tâche » ; contacts proposés vides = section masquée.
- Chargement : squelettes des cartes, pas d'écran bloquant.
- Erreur d'enregistrement : la carte revient à sa colonne d'origine et un message s'affiche.
- Terminé : colonne repliée au-delà de quelques cartes (« Afficher les N autres »), jamais purgée.
- Lecture seule : contact proposé par une autre UL, cadenas, aucune action d'édition.

## Interaction Primitives

Glisser-déposer au pointeur ; sans pointeur (clavier, mobile) l'état se change par la pastille d'état ou la modale. Sur mobile, la pastille ouvre une feuille « Déplacer vers… ». Téléphone d'un contact cliquable (`tel:`).

## Accessibility Floor

Chaque déplacement a une alternative non gestuelle. L'état est toujours écrit, jamais porté par la couleur seule. Cases à cocher et boutons ≥ 44 px de cible sur mobile. Modale avec focus piégé et fermeture Échap.

## Key Flows

**Camille, responsable véhicule à Paris XVIII, lundi soir après un DPS.**
1. Elle ouvre `/vehicles`, bascule sur « Suivi technique ».
2. « + Nouveau dossier » : « Sinistre roue arrière droite », véhicule 75-188, rattache l'incident du 14/11.
3. Ajoute les pièces à récupérer : constat, photos, référence du sinistre, devis.
4. Crée la tâche « Récupérer la référence du sinistre », l'attribue à Thomas, rattache l'assureur proposé par l'UL Paris XV.
5. Épingle le dossier : il apparaît dans « À confirmer en priorité ».
6. **Climax** — mardi, Thomas reçoit le push, appelle l'assureur depuis la tâche sur son téléphone, coche « Référence du sinistre » avec le numéro reçu, passe sa tâche à Terminé ; le compteur « Pièces à récupérer » baisse chez Camille sans qu'elle ne fasse rien.

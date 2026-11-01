---
title: 'Type de mission « Entraînement » pour la prise d''un véhicule'
type: 'feature'
created: '2026-11-01'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Lors de l'emprunt d'un véhicule, aucun type de mission ne correspond à un entraînement : les bénévoles doivent choisir un type inexact (Logistique, Autre…), ce qui fausse l'historique et les statistiques par type.

**Approach:** Ajouter « Entraînement » à la liste des types de mission proposés partout où l'on emprunte un véhicule (modale de prise, modale de modification de la prise, formulaire de prise par QR code). Le type est stocké tel quel dans `Trip.missionType` (chaîne libre) : aucune migration.

</frozen-after-approval>

## Implementation Notes

- Fichiers : `src/components/vehicle/modals/CheckOutModal.tsx`, `src/components/vehicle/modals/EditCheckOutModal.tsx` (option `<option value="Entraînement">` après « Maraude »), `src/app/qr/[token]/CheckOutForm.tsx` (liste `missionTypes`, après « Formation »).
- Valeur stockée : « Entraînement » (avec accent, comme « Réseaux » / « Désinfection »). Le schéma Zod (`checkOutSchema.missionType: z.string().min(1)`) l'accepte déjà ; aucune route API à modifier.
- Hors périmètre : le filtre « Type de mission » de la page Statistiques (`src/app/stats/page.tsx`, liste déjà désalignée des formulaires) n'est pas modifié ; les graphiques par type affichent automatiquement les valeurs présentes en base.
- Tests : une assertion par formulaire (option « Entraînement » présente, et envoyée telle quelle dans le corps du POST pour la modale de prise).
- Le `<label>` « Type de mission » du formulaire QR n'était pas relié à son `<select>` : ajout de `htmlFor`/`id` (`qr-checkout-mission-type`), utile à l'accessibilité et aux tests.
- Version 5.36.0, entrée CHANGELOG.

## Review Triage Log

- Changelog promettant « Entraînement » dans les statistiques alors que le filtre ne le propose pas — medium, réel (src/app/stats/page.tsx:49) → patch : formulation limitée à l'historique et aux graphiques.
- Listes de types dupliquées dans trois formulaires — medium, réel mais antérieur → defer (constante partagée).
- EditCheckOutModal sans option pour les types propres au QR — medium, réel, antérieur, hors changement → defer.
- Test EditCheckOutModal limité à la présence de l'option — low, réel → patch : test de pré-sélection ajouté.
- Pas de validation serveur de missionType — medium, réel, choix de conception antérieur → defer.
- Seed de dev sans trajet « Entraînement » — low, rejeté : sans effet pour les utilisateurs, une prise en local suffit à le voir.
- Frontmatter de la spec obsolète, htmlFor non documenté — low, réel → corrigé lors de la finalisation.
- Note « Hors périmètre » non suivie — low → couvert par l'entrée deferred de la constante partagée.


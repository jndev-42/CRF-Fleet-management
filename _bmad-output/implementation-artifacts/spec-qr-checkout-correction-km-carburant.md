---
title: 'Emprunt par QR code : signaler et corriger le kilométrage / carburant'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le formulaire d'emprunt affiché après le scan du QR code d'un véhicule (`/qr/[token]`) ne propose pas la case « Le kilométrage et/ou le niveau d'essence est erroné » ni la saisie des valeurs réelles, contrairement à la modale d'emprunt de la fiche véhicule. Le bénévole ne peut donc pas corriger des données fausses au départ.

**Approach:** Ajouter au formulaire QR le même bloc de correction que la modale d'emprunt (case à cocher, kilométrage réel, niveau réel par curseur), envoyer `dataIncorrect` / `correctedMileage` / `correctedFuel` à `POST /api/qr/[token]/checkout` (qui les accepte déjà), et aligner la route QR sur `POST /api/trips` en notifiant les responsables lorsqu'une correction est signalée.

</frozen-after-approval>

## Implementation Notes

- `src/app/qr/[token]/CheckOutForm.tsx` : bloc de correction extrait dans un composant dédié (règle « carpaccio ») ; valeurs initiales = `vehicle.mileage` / `vehicle.fuelLevel` ; libellé adapté si le véhicule est connecté (`vehicle.connection?.status`).
- `src/app/api/qr/[token]/checkout/route.ts` : notification push « Données incorrectes » (PRESIDENT, CADRE, ADMIN) après commit, copie du comportement de `src/app/api/trips/route.ts:247-269`, en mémorisant les valeurs avant correction. Le reste de la route (bypass inter-UL volontaire) ne change pas.
- Tests : intégration (`qr.test.ts`) pour l'enregistrement des valeurs corrigées et la notification ; test de composant pour le formulaire.
- Après revue : seules les valeurs réellement modifiées sont envoyées (la télémétrie d'un véhicule connecté n'est pas écrasée par la valeur stockée) ; un kilométrage vidé reste vide (plus de 0 km) ; `step={1}` ; le serveur ne notifie que si une valeur change.

## Review Triage Log

- Valeurs stockées écrasant la télémétrie (véhicule connecté) — medium, réel : le formulaire envoyait `vehicle.mileage`/`fuelLevel` même non modifiés. Corrigé.
- Champ kilométrage vidé → 0 — medium, réel (`Number('')`). Corrigé dans le parcours QR ; même bug dans CheckOutModal reporté (préexistant).
- Correction sans changement → notification « 1 000 → 1 000 » — low, réel, correctif simple. Corrigé client et serveur.
- Saisie décimale → erreur générique — low, corrigé par `step={1}`.
- Commentaire « même comportement que POST /api/trips » alors que la notification d'incident manque — low pour le commentaire (corrigé) ; notification d'incident manquante reportée (préexistante).
- Notification et bloc UI dupliqués — low, mutualisation reportée avec le bug de la modale.
- Styles en ligne / couleur codée en dur — rejeté : toute la page QR utilise ce style, et la même couleur est déjà dans CheckOutModal.
- Libellés « essence » / « Batterie réel » — low, rejeté : libellés identiques à la modale existante, hors périmètre.
- Valeurs non resynchronisées si le véhicule est rechargé — low, rejeté : le formulaire est remonté après chaque action, cas rare.
- Tests manquants — partiellement retenu : ajout des cas « valeur modifiée seule », « aucun changement », « champ vidé ».
- Rubrique du changelog — rejeté : du point de vue de l'utilisateur, c'est un manque corrigé.
- Fichier de spec non suivi — faux : les specs de `_bmad-output/implementation-artifacts` sont versionnées dans le dépôt.

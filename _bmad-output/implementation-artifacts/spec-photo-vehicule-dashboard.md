---
title: 'Photo du véhicule sur les cartes du dashboard'
type: 'feature'
created: '2026-11-06'
status: 'done'
route: 'dispatch'
baseline_commit: '1697e9f06715670c8dc582786d679c93c95e2a12'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La photo du véhicule (v5.43.0) n'apparaît que sur la page du véhicule et la page QR. Sur le dashboard, rien ne permet de reconnaître un véhicule d'un coup d'œil.

**Approach:** Afficher la vignette sur chaque carte du dashboard (`/vehicles`), à gauche du nom comme sur la page du véhicule, pour tout véhicule qui a une photo. Cette spec lève, pour le dashboard, l'interdiction « pas de vignette sur le tableau de bord ni la liste » de `spec-photo-vehicule.md`.

**Décisions de l'utilisateur :**
- Un clic sur la vignette l'agrandit en plein écran ; le reste de la carte ouvre toujours la page du véhicule.
- En Vue DT, toutes les cartes ont leur photo : le rôle DT peut lire la photo des véhicules de sa DT, en lecture seule.

## Boundaries & Constraints

**Always:** `GET /api/vehicles` expose `photoUpdatedAt`, jamais `photoR2Key`. L'URL est construite par `vehiclePhotoUrl`. Sans photo ou image illisible : aucun emplacement vide. Toute carte reste un `a.vehicle-card` (utilisé par `e2e/checkout-checkin.spec.ts` et `e2e/reservation.spec.ts`). Les vignettes hors écran ne se chargent pas avant d'en approcher (`loading="lazy"`).

**Never:** Pas de `<button>` imbriqué dans le `<a>`. Pas de second fichier ni de redimensionnement à la volée (fichier unique, cf. spec précédente). Pas de vignette ailleurs : formulaires de mission, statistiques, sections de prise rapide, `/api/qr-ul/[token]/vehicles`. Pas de migration : les colonnes existent déjà. L'élargissement DT ne concerne que `GET /api/vehicles/[id]/photo` : ni `POST`/`DELETE`, ni `GET /api/vehicles/[id]`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Avec photo, Vue UL | `photoUpdatedAt` renseigné | Vignette à gauche du nom | N/A |
| Sans photo | `photoUpdatedAt` null | Carte identique à aujourd'hui, sans décalage du contenu | N/A |
| Image en échec | 404/409/erreur réseau | Vignette retirée, contenu recalé à gauche | Pas de message |
| Clic sur la vignette | Carte avec photo | Plein écran, sans navigation ; fermeture sans navigation | N/A |
| Vue DT, autre UL de sa DT | Rôle DT, même `dtCode` | Photo servie (200) | N/A |
| Autre DT, ou UL sans `dtCode` | Rôle DT, `dtCode` différent ou absent | 404 identique à « non trouvé » | Vignette retirée |
| Autre UL sans rôle DT, ou INACTIF | Rôle non DT | 404 hors UL ; 403 inactif, inchangés | Vignette retirée |
| Remplacement de la photo | Nouveau `photoUpdatedAt` | Nouvelle URL, nouvelle image au prochain chargement de la liste | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/vehicles/route.ts` -- GET : la ligne vient de `v.*`, le mappage liste ses champs ; y ajouter `photoUpdatedAt`. Le `dtCode` de la Vue DT est lu là (l. 157-168).
- `src/app/vehicles/types.ts` -- `DashboardVehicle` : ajouter `photoUpdatedAt`.
- `src/app/vehicles/VehicleCard.tsx` -- carte unique des vues UL et DT, rendue par `page.tsx:273` et `DtVehicleResults.tsx:91` ; c'est un `<Link className="vehicle-card">`.
- `src/components/vehicle/VehiclePhoto.tsx` -- réutiliser : vignette 56 px, plein écran en portail, disparaît en cas d'échec. Ajouter le chargement différé.
- `src/app/vehicles/[id]/VehicleDetailHeader.tsx:48` -- modèle de construction de l'URL.
- `src/lib/vehiclePhoto.ts` -- `vehiclePhotoUrl`.
- `src/app/globals.css:497-527` -- `.vehicle-grid` et `.vehicle-card` (hauteur étirée par la grille tant que la carte est l'enfant direct).
- `src/app/api/vehicles/[id]/photo/route.ts` -- GET, contrôle `isOutsideUl` ; `findVehicleByName` lit `id, ulId, photoR2Key`. `src/lib/roles.ts:142` `hasDTRole` (refuse déjà INACTIF).
- `src/__tests__/integration/vehicle-photo.test.ts` -- le test « GET /api/vehicles ne porte ni la clé ni aucune donnée de vignette » devient faux.
- `src/__tests__/components/VehiclePhoto.test.tsx`, `DtVehicleResults.test.tsx` -- compléter ; aucun test ne couvre `VehicleCard` seul.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/vehicles/route.ts`, `src/app/vehicles/types.ts` -- exposer `photoUpdatedAt` -- donnée nécessaire à la carte.
- [x] `src/components/vehicle/VehiclePhoto.tsx` -- `loading="lazy"` et `decoding="async"` sur la vignette -- une image par carte.
- [x] `src/app/api/vehicles/[id]/photo/route.ts` -- GET : hors UL, autoriser si `hasDTRole` et si l'UL de la session et celle du véhicule ont le même `dtCode` non nul, sinon 404 inchangé -- décision Vue DT.
- [x] `src/app/vehicles/VehicleCard.tsx`, `src/app/globals.css` -- envelopper le `a.vehicle-card` dans un conteneur positionné ; la vignette, sœur du lien, se pose sur la carte en haut à gauche ; le contenu ne se décale que si la vignette existe (`:has`) ; carte à `height: 100%` et effet de survol porté par le conteneur pour que lien et vignette bougent ensemble -- objectif principal, sans `<button>` dans `<a>`.
- [x] `src/__tests__/` -- API (`photoUpdatedAt` présent, clé absente ; matrice d'accès DT de la photo), composant `VehicleCard` (avec et sans photo, vignette hors du lien) ; adapter le test devenu faux -- règle projet.
- [x] `src/app/vehicles/AGENTS.md` -- signaler la vignette sur la carte et l'accès DT -- doc des modules.
- [x] `package.json`, `package-lock.json` → 5.45.0 (5.44.0 pris par #162 avant le rebase) ; `CHANGELOG.md` -- convention projet.

**Acceptance Criteria:**
- Given une carte avec photo, when on clique ailleurs que sur la vignette, then la page du véhicule s'ouvre.
- Given une grille de cartes de hauteurs différentes, when elle s'affiche, then les cartes d'une même ligne gardent la même hauteur.
- Given un écran de téléphone, when une carte a une photo, un nom long et un statut long, then rien ne déborde.

## Implementation Notes

- Vérification en navigateur faite sur une page statique reprenant le balisage de la carte et les vraies CSS (`globals.css`, thèmes saisonniers), dans Chromium, de 320 à 1280 px : hauteurs égales, aucun débordement, vignette cliquable sous chaque thème, recalage après retrait de la vignette. Non rejouée dans l'appli avec de vraies données.
- Seuil de 420 px : sur la plupart des largeurs (bureau compris), une carte avec photo place ses badges sous le nom, une carte sans photo les garde à droite.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Suite |
|---|---|---|---|---|---|
| 1 | blind | `package-lock.json` absent du diff | false | Exclu volontairement du diff de revue ; le fichier est bien modifié | rejet |
| 2 | blind + gap | Carte d'une autre UL en Vue DT : le clic mène à « Véhicule non trouvé » | medium | Comportement antérieur (`GET /api/vehicles/[id]` répond 404 hors UL), hors de l'élargissement décidé ; la phrase du changelog qui le contredisait est retirée | patch + defer |
| 3 | blind | Photo résolue par nom, ambiguë entre deux UL | false | `POST /api/vehicles` et `PATCH /api/vehicles/[id]` refusent un nom déjà pris, toutes UL confondues (`UPPER(name)`, sans filtre d'UL) | rejet |
| 4 | blind | Sélecteurs restants `.vehicle-card:nth-child` ou `:hover` | false | Recherche dans toutes les CSS : seuls `.vehicle-card` et `::after` restent, indépendants de la position dans la grille | rejet |
| 5 | blind | Décalages de la vignette codés en dur | low | Aucun point de rupture ne modifie le padding de la carte ; pas de dérive aujourd'hui | rejet |
| 6 | blind | Pas de repli sans `:has()` ou `@container` | low | Navigateurs visés : iOS ≥ 16.4 pour la PWA ; garde supplémentaire pour un cas rare | rejet |
| 7 | blind + edge | Badge long hors de sa boîte sur une carte avec photo de 381 à ~400 px | medium | Mesuré dans Chromium par le relecteur, puis contrôlé dans l'appli : seuil porté à 420 px | patch |
| 8 | blind + edge | Nom d'UL tronqué sans moyen de le lire | low | Correction directe : attribut `title` | patch |
| 9 | blind | Pas de reprise après un échec si l'URL change | false | `failedSrc` mémorise l'URL en échec, couvert par `VehiclePhoto.test.tsx` | rejet |
| 10 | blind | Chaque vignette télécharge le fichier complet | low | Choix de la spec, signalé à l'utilisateur avant approbation | rejet |
| 11 | blind | Le survol de la carte laisse croire que la vignette navigue | low | Curseur `zoom-in` déjà distinct sur la vignette | rejet |
| 12 | blind | Combinaisons de rôles DT non testées | low | `isOutsideUl` et `hasDTRole` sont déjà testés ; les cas restants n'ouvrent aucun accès | rejet |
| 13 | blind | Suivi de la spec incomplet | false | Sections remplies à cette étape ; la correction serait d'éditer la spec | rejet |
| 14 | gap | Comportement navigateur de la vignette non couvert par un test automatisé | medium | Playwright hors CI et sans données photo : contrôle ponctuel fait dans Chromium, automatisation reportée | defer |
| 15 | gap | `photoUpdatedAt` de la liste non conditionné à `photoR2Key` | low | Les deux colonnes sont toujours écrites ensemble ; il faudrait des données incohérentes | rejet |
| 16 | edge | Version 5.44.0 déjà prise par `main` (#162) | high | Confirmé sur `origin/main` : rebase et passage en 5.45.0 | patch |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npx tsc --noEmit` -- expected: aucune erreur
- `npx vitest run` -- expected: tous les tests passent
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- Sur `/vehicles` : vignette, carte sans photo, largeur de téléphone.

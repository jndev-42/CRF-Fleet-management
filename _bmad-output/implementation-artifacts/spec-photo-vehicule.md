---
title: 'Photo par véhicule (vignette agrandissable, page véhicule et page QR)'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '1f0fe7ee36721276c1baef189b9b2fd9613874b4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Rien dans l'appli ne montre à quoi ressemble un véhicule ; un bénévole qui arrive sur la page d'un véhicule, ou qui scanne son QR, ne peut pas vérifier visuellement qu'il s'agit du bon.

**Approach:** Un gestionnaire enregistre (ou remplace / retire) une photo unique par véhicule depuis les modales de création et de modification, comme le guide de vérification. Elle s'affiche en petite vignette à côté du nom sur la page du véhicule et sur la page QR ; un clic l'agrandit en plein écran.

## Boundaries & Constraints

**Always:**
- Mêmes droits que le guide : dépôt et retrait par `canManageVehicles` + contrôle d'UL ; lecture via `/api/vehicles/[id]/photo` (session non `isQrBlocked` + même UL, 404 sinon) et via `/api/qr/[token]/photo` (compte non `isQrBlocked`, sans contrôle d'UL).
- Stockage R2, préfixe `vehicle-photos/`, clé versionnée ; base : `Vehicle.photoR2Key` et `Vehicle.photoUpdatedAt`. Remplacement : écrire, basculer la base, puis supprimer l'ancien objet (échec = log).
- Normalisation serveur par `sharp` avant stockage : orientation EXIF appliquée, 1600 px max sans agrandissement, JPEG, métadonnées retirées (la position GPS d'une photo de téléphone ne doit jamais être conservée). Le format réel est lu dans les octets : JPEG, PNG ou WebP seuls.
- Taille max à l'envoi : 4 Mo (limite Vercel). Compression navigateur préalable pour qu'une photo de téléphone passe.
- Vignette et plein écran : même fichier unique. URL suffixée `?v=<photoUpdatedAt>`, réponse `private, max-age=86400`, pour qu'un remplacement s'affiche aussitôt sans retélécharger à chaque visite.
- Sans photo, ou image illisible : aucune vignette ni emplacement vide. Plein écran fermé par bouton, clic sur le fond ou Échap.

**Never:** Pas de binaire en base ni sur Google Drive. Pas de photo dans les payloads JSON de `POST /api/vehicles` ni `PATCH /api/vehicles/[id]`. Pas de `photoR2Key` dans une réponse API. Pas de dépôt depuis la page QR. Pas de vignette sur le tableau de bord ni la liste des véhicules. Pas de galerie (une seule photo). Pas de conversion en Server Component (M-4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dépôt OK | Gestionnaire même UL, JPEG 3 Mo | 200, `photoUpdatedAt` renvoyé, objet JPEG normalisé dans R2 | N/A |
| Remplacement | Photo existante + nouvelle | Nouvelle clé en base, ancien objet supprimé | Échec delete → log |
| Fichier invalide | PDF renommé `.jpg`, SVG, HEIC, octets quelconques | 400 « La photo doit être au format JPEG, PNG ou WebP. » | Rien n'est écrit |
| Trop gros | 5 Mo après compression | 413 « La photo est trop volumineuse (4 Mo maximum). » | Rien n'est écrit |
| Pas de fichier / pas de session / rôle insuffisant / autre UL | — | 400 / 401 / 403 / 403 au dépôt et retrait, 404 en lecture hors UL | — |
| Compte INACTIF | Lecture véhicule ou QR | 403 | — |
| Pas de photo | GET | 404 | Pas de vignette |
| Clé absente du bucket | GET | 409 + log | Vignette masquée |
| Retrait | DELETE, avec ou sans photo | 200 idempotent, colonnes à NULL, objet supprimé | Échec delete → log |
| Création, dépôt échoue | Véhicule créé, photo refusée | Véhicule conservé, message « Véhicule créé, photo non enregistrée : … » | Réessai via modification |
| Suppression du véhicule | Véhicule avec photo | Objet R2 supprimé après la base | Échec → log |

</frozen-after-approval>

## Code Map

- `src/app/api/vehicles/[id]/guide/route.ts` -- modèle complet POST/GET/DELETE ; `[id]` = **nom** du véhicule ; `withAudit` sur POST et DELETE.
- `src/app/api/qr/[token]/guide/route.ts` -- modèle de la route QR.
- `src/lib/vehicleGuide.ts` (sans dépendance serveur) / `src/lib/vehicleGuideResponse.ts` -- modèle de séparation règles partagées / restitution R2.
- `src/lib/r2.ts` L95 `buildVehicleGuideKey` -- modèle de clé ; `putObject`, `getObject`, `deleteObject`, `newAttemptId`.
- `src/lib/imageCompression.ts` + `src/components/ui/PhotoPicker.tsx` -- **réutiliser** : mode simple (`file`, `onFileChange`) avec boutons appareil photo / galerie, compression et aperçu. Ne pas modifier.
- `src/components/vehicle/VehicleGuideField.tsx` -- modèle `GuideChange` keep/replace/remove et `applyGuideChange`.
- `src/components/vehicle/modals/AddVehicleModal.tsx` (L35-43 reset à l'ouverture car modale toujours montée, L102-108) / `EditVehicleModal.tsx` (L37-46, L130-132, L389) -- points d'accroche, à côté du guide.
- `src/components/vehicle/VehicleGuideReader.tsx` -- modèle d'overlay : `createPortal`, `useEscapeKey` (`@/lib/hooks/useEscapeKey`), blocage du défilement, `role="dialog"`.
- `src/app/vehicles/[id]/VehicleDetailHeader.tsx` L48-50 (`.vehicle-detail-info`, nom) ; `src/app/vehicles/[id]/types.ts`.
- `src/app/qr/[token]/VehicleInfoCard.tsx` L18-35 (nom + plaque) ; `types.ts` L36-39 `QRVehicle`. La carte n'a pas le token : lui passer `photoSrc`, depuis `page.tsx`.
- `src/app/api/vehicles/[id]/route.ts` L145-148 (métadonnées guide au GET), L365 et L408-414 (nettoyage à la suppression) ; `src/app/api/qr/[token]/vehicle/route.ts` L117-121.
- `src/app/api/vehicles/route.ts` -- GET en `v.*` : vérifier que `photoR2Key` ne ressort pas de la réponse, le retirer sinon.
- `scripts/add-vehicle-guide.ts` -- modèle de migration ; `scripts/setup-dev.ts` L290 ; `src/__tests__/integration/setup.ts` L54-57.
- `src/__tests__/integration/vehicle-guide.test.ts`, `resp-vehicule-authz.test.ts` L29 et L301 -- modèles de test.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-vehicle-photo.ts` -- migration idempotente des 2 colonnes (dry-run ; `--apply`) -- prod.
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- ajouter les colonnes -- parité dev/test.
- [x] `src/lib/r2.ts` -- `buildVehiclePhotoKey(vehicleId, attempt)` → `vehicle-photos/<id>/<attempt>.jpg` -- clés versionnées.
- [x] `src/lib/vehiclePhoto.ts` -- constante de taille, messages d'erreur, `vehiclePhotoUrl(base, updatedAt)` ; sans dépendance serveur -- partagé client/serveur.
- [x] `src/lib/vehiclePhotoServer.ts` -- `normalizeVehiclePhoto(buffer)` (sharp) et `vehiclePhotoResponse(row)` -- commun aux deux routes ; `sharp` ne doit jamais atteindre le client.
- [x] `src/app/api/vehicles/[id]/photo/route.ts` -- POST, GET, DELETE -- cœur (invoquer `/api-route-template`).
- [x] `src/app/api/qr/[token]/photo/route.ts` -- GET -- lecture via QR (invoquer `/api-route-template`).
- [x] `src/app/api/vehicles/[id]/route.ts`, `src/app/api/qr/[token]/vehicle/route.ts`, `src/app/api/vehicles/route.ts` -- exposer `photoUpdatedAt` (jamais la clé) ; supprimer l'objet avec le véhicule.
- [x] `src/lib/mcp/catalog.generated.ts` -- `npm run mcp:catalog` -- nouvelles routes.
- [x] `src/components/vehicle/VehiclePhoto.tsx` -- vignette cliquable + plein écran ; se masque sur `onError` -- invoquer `/component-templates`.
- [x] `src/components/vehicle/VehiclePhotoField.tsx` -- photo actuelle, `PhotoPicker`, Retirer / Annuler ; `PhotoChange`, `applyPhotoChange` -- invoquer `/component-templates`.
- [x] `AddVehicleModal.tsx`, `EditVehicleModal.tsx` -- champ, reset à l'ouverture, envoi après succès JSON, échec partiel signalé par `alert()` comme pour le guide.
- [x] `src/app/vehicles/[id]/VehicleDetailHeader.tsx`, `types.ts` -- vignette à gauche du nom.
- [x] `src/app/qr/[token]/VehicleInfoCard.tsx`, `types.ts`, `page.tsx` -- vignette à gauche du nom, URL de la route QR.
- [x] Tests : `src/__tests__/integration/vehicle-photo.test.ts` (matrice complète, y compris EXIF/GPS retirés et nettoyage à la suppression), `src/__tests__/unit/vehiclePhoto.test.ts`, RTL `VehiclePhoto` et `VehiclePhotoField`, ligne DELETE dans `resp-vehicule-authz.test.ts`.
- [x] `package.json`, `package-lock.json` → 5.43.0 (5.40.0 avant le rebase sur le mode démo) ; `CHANGELOG.md` (centré utilisateur) ; `CLAUDE.md` -- ligne de migration « À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.40.0 ».

**Acceptance Criteria:**
- Given un gestionnaire dans la modale de modification, when il choisit une photo et valide, then la vignette apparaît aussitôt à côté du nom sur la page du véhicule.
- Given une photo de téléphone de 8 Mo, when elle est envoyée, then elle est acceptée et l'objet stocké est un JPEG de 1600 px max, à l'endroit, sans EXIF.
- Given un bénévole de l'UL, when il clique sur la vignette, then la photo s'affiche en plein écran et se ferme par bouton, clic sur le fond ou Échap.
- Given un bénévole d'une autre UL qui scanne le QR, when la page s'ouvre, then il voit la vignette et peut l'agrandir, sur les étapes consultation, emprunt et restitution.
- Given un véhicule sans photo, when sa page ou sa page QR s'ouvre, then la mise en page reste celle d'aujourd'hui.

## Implementation Notes

- Le sous-agent a ajouté `omitVehiclePhotoKey` (`src/lib/vehiclePhoto.ts`), renommé ensuite `omitVehicleR2Keys`, et l'applique dans `trips`, `trips/[id]/checkin` et `vehicles/[id]/metrics`, qui renvoient une ligne en `SELECT *` : exigence « pas de `photoR2Key` dans une réponse API ».
- `GET /api/vehicles` liste ses champs : ni la clé, ni `photoUpdatedAt` n'en sortent, conformément à l'interdiction de vignette en liste.
- `src/__tests__/integration/vehicle-photo.test.ts` : type du mock de `db.execute` corrigé après revue, car il cassait la vérification de types de `npm run build`.
- Échecs hors périmètre : 2 tests de récurrence de `ReservationFormModal.test.tsx`, fichier inchangé ici ; corrigés par `c644a7c` et `d42ce6b` sur `feat/mode-demo-lecture-seule`, pas encore sur `main`.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind | `package-lock.json` absent du diff | false | Exclu volontairement du diff de revue ; il est modifié et passe en 5.40.0, puis 5.43.0 au rebase | rejet |
| 2 | blind | `sharp` peut-être transitif ou absent sur Vercel | false | Dépendance directe (`package.json:55`), déclarée dans `next.config.ts`, déjà utilisée en prod | rejet |
| 3 | blind + edge | `UPDATE` sans contrôle de `rowsAffected` : véhicule supprimé pendant le dépôt → 200 et orphelin | low | Réel mais très rare ; orphelin sans effet visible ; le correctif ajoute une branche ; même comportement que le guide | rejet |
| 4 | blind + edge | Dépôts ou retrait concurrents : objet R2 orphelin, ou plus récent perdu | low | Deux gestionnaires simultanés improbables ; la correction demande un compare-and-swap ; déjà accepté pour le guide | rejet |
| 5 | blind | Échec de suppression R2 seulement journalisé, sans reprise | false | Comportement exigé par la matrice (« Échec → log ») | rejet |
| 6 | blind | `omitVehiclePhotoKey` laisse fuiter la clé via d'autres `SELECT *` | false | Tous les `SELECT *` relus : `qr/checkin` et `qr/checkout` ne renvoient pas la ligne, `GET` et `POST` listent leurs champs, `PATCH` renvoie `data` filtré par Zod | rejet |
| 7 | blind | `guideR2Key` reste renvoyée par les réponses en `SELECT *` | low | Antérieur à ce changement : `trips`, `checkin` et `metrics` étalent la ligne entière. Reporté au tri, puis corrigé à la demande de l'utilisateur (`omitVehicleR2Keys`) | patch |
| 8 | blind | Réponses `POST`/`PATCH` véhicule non contrôlées pour la clé | low | Champs listés (`POST`) et `data` filtré par Zod (`PATCH`) : fuite impossible en l'état ; la base est bien vérifiée | rejet |
| 9 | blind | Pas de `limitInputPixels` explicite | maybe-false | Dépôt réservé aux gestionnaires, limite `sharp` par défaut active ; à trancher par un test mémoire sur Vercel ; au pire low | rejet |
| 10 | blind + edge | Toute erreur `sharp` devient un 400 « mauvais format » | low | Pannes `libvips` rares ; distinguer les erreurs ajoute de la logique | rejet |
| 11 | blind | Pas de contrôle de format côté navigateur | low | Le sélecteur de galerie filtre déjà ; le refus serveur est clair et prévu par la matrice | rejet |
| 12 | blind | Vignette périmée après remplacement | false | `page.tsx:517-525` : `onSuccess` appelle `fetchVehicle()` après l'envoi de la photo | rejet |
| 13 | blind | Annuler reste actif pendant l'envoi dans `AddVehicleModal` | low | Antérieur pour le guide ; le fond et ✕ ferment aussi ; l'envoi se termine quand même | rejet |
| 14 | blind | Vignette de 56 px chargeant jusqu'à 1600 px | false | Fichier unique et cache de 24 h imposés par la spec | rejet |
| 15 | blind + edge | Plein écran sans piège de focus ; focus perdu si l'image échoue | low | Rare au clavier sur mobile ; ajoute de la logique ; même niveau que `VehicleGuideReader` | rejet |
| 16 | blind + edge | Statut « Photo actuelle. » alors que l'image ne se charge pas | low | Réel ; correction directe du libellé | patch |
| 17 | blind | Vignette masquée jusqu'au rechargement après panne réseau passagère | low | Masquage exigé par la spec ; l'emplacement revient au rechargement | rejet |
| 18 | blind | `Vehicle.updatedAt` non modifié par la photo | false | Le guide ne le modifie pas non plus ; `photoUpdatedAt` sert de version | rejet |
| 19 | blind | IPTC et XMP non injectés dans le test ; assertion GPS lâche | low | `after.exif` absent et `SECRET-EXIF` absent des octets stockés prouvent le retrait ; `sharp` ne recopie rien par défaut | rejet |
| 20 | gap + blind | Câblage de l'URL QR non testé | medium | Filé par la couche verification-gap ; test ajouté à `QRVehiclePage.test.tsx` | patch |
| 21 | gap + blind | Nettoyage du nouvel objet si l'`UPDATE` échoue, non testé | medium | Filé par la couche verification-gap ; test ajouté | patch |
| 22 | gap | Ordre `applyPhotoChange` puis `onSuccess` non testé | medium | Filé par la couche verification-gap ; test à promesse différée ajouté | patch |
| 23 | gap | Test de liste sans assertion sur `photoUpdatedAt` | low | Titre du test plus large que ses assertions ; une assertion ajoutée | patch |
| 24 | gap | Script de migration jamais exécuté par les tests | low | Copie de `add-vehicle-guide.ts`, lui aussi sans test ; dry-run lu avant `--apply` | defer |
| 25 | gap + edge | La tâche annonce `photoUpdatedAt` dans `GET /api/vehicles`, absent du code | false | Le code respecte l'interdiction de vignette en liste ; la seule correction serait d'éditer la spec | rejet |
| 26 | edge | Validation pendant la compression : véhicule enregistré sans photo ni message | low | Fenêtre inférieure à la seconde ; le correctif modifie `PhotoPicker`, interdit par le Code Map | rejet |
| 27 | edge | Compression terminée après fermeture et réouverture : photo sur le véhicule suivant | low | Fermer, rouvrir et saisir en moins d'une seconde ; le correctif ajoute un suivi de session | rejet |
| 28 | edge | PNG transparent de 800 Ko ou plus : fond noir via le canvas | low | Une photo de véhicule n'est pas transparente ; le correctif modifie la compression partagée | rejet |
| 29 | edge | Fichier de plus de 4 Mo refusé puis resélectionné : aucun nouvel événement | low | Comportement existant de `PhotoPicker` ; le message d'erreur reste affiché | rejet |

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- tous verts
- `npm run build` -- succès

**Manual checks (if no CLI):**
- `npm run dev` : déposer, agrandir, remplacer, retirer une photo sur la page véhicule et la page QR, en largeur bureau et mobile.

---
title: 'Documents liés au véhicule (plusieurs fichiers)'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '1697e9f06715670c8dc582786d679c93c95e2a12'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un véhicule ne peut porter qu'un seul fichier, le « guide de vérification » ; impossible d'y joindre d'autres documents (carte grise, procédures…).

**Approach:** Le champ devient « Documents liés au véhicule » et accepte plusieurs fichiers. Chaque fichier part dans son propre appel d'upload, donc le total peut dépasser la limite de 4 Mo d'une requête. Les guides déjà enregistrés sont repris comme premiers documents, sans déplacer leur objet R2.

**Décisions :**
- **PDF uniquement** : tous les documents s'ouvrent dans la liseuse, avec le même contrôle de contenu qu'aujourd'hui.
- **4 Mo maximum par fichier** : un fichier plus lourd est refusé avec un message clair. Le total par véhicule n'est pas limité.
- **Liseuse au nom générique** : `VehicleGuideReader` devient `PdfReader`, elle ne parle plus de « guide » dans ses textes par défaut.

## Boundaries & Constraints

**Always:** Table `VehicleDocument` (`id`, `vehicleId`, `r2Key` unique, `fileName`, `size`, `createdAt`). Objets existants conservés sous leur clé `vehicle-guides/…` ; nouveaux objets sous le même préfixe. Mêmes droits qu'aujourd'hui : dépôt/retrait `canManageVehicles` + même UL ; lecture même UL hors INACTIF (404 sinon) ; QR sans contrôle d'UL, `isQrBlocked` → 403. Un document n'est résolu que par `id` ET `vehicleId` : un jeton QR n'ouvre jamais le document d'un autre véhicule. Jamais de clé R2 dans une réponse. Écrire R2 puis la base, retirer de la base puis de R2 (échec R2 = log). Migration idempotente, relançable, écriture atomique.

**Never:** Pas de suppression ni de déplacement d'objet R2 par la migration. Pas de suppression des colonnes `Vehicle.guide*` (retour arrière possible). Pas de PDF dans les payloads JSON véhicule. Pas de conversion en Server Component (M-4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Reprise | Véhicule avec guide, migration `--apply` | Une ligne `VehicleDocument` même clé, nom, taille, date ; objet R2 intact | Relance : aucun doublon |
| Ajout multiple | 3 PDF de 3 Mo chacun | 3 POST successifs, 3 documents | N/A |
| Échec partiel | 1 fichier sur 3 refusé | Les 2 autres enregistrés ; message nommant le fichier refusé | Véhicule conservé |
| Fichier invalide | Non PDF, `%PDF` absent | 400 « Le fichier doit être un PDF » | Rien n'est écrit |
| Trop gros | Fichier de 5 Mo | Refus navigateur et 413 serveur « 4 Mo maximum » | Rien n'est écrit |
| Retrait | DELETE d'un document | Ligne et objet supprimés ; les autres restent | Échec R2 → log |
| Retrait d'un ancien guide | Document issu de la reprise | Colonnes `guide*` remises à NULL si elles portent cette clé | Une relance ne le recrée pas |
| Autre véhicule | `documentId` d'un autre véhicule | 404 (véhicule et QR) | — |
| Suppression véhicule | Véhicule avec N documents | Lignes et N objets supprimés | Échec R2 → log |
| Aucun document | Véhicule sans document | Pas de carte (page véhicule et QR) | — |

</frozen-after-approval>

## Code Map

- `src/app/api/vehicles/[id]/guide/route.ts`, `src/app/api/qr/[token]/guide/route.ts`, `src/lib/vehicleGuideResponse.ts` -- à remplacer ; ⚠️ `[id]` = nom du véhicule.
- `src/lib/vehicleGuide.ts` -- validation et noms de fichiers : à réutiliser tel quel (importé aussi par le référentiel).
- `src/lib/r2.ts` L120 `buildVehicleGuideKey` -- à réutiliser ; lectures/suppressions déjà compatibles démo (`demo/<clé>`).
- `src/components/vehicle/VehicleGuideReader.tsx` + `.module.css`, `useGuidePdf.ts` -- liseuse à renommer et déplacer ; utilisée aussi par `src/components/referentiel/ReferentielChatPanel.tsx` L189 (qui passe son propre `label`). Clé localStorage `vehicleGuideReader.rotated` conservée : un renommage ferait perdre le réglage de rotation des utilisateurs.
- `src/components/vehicle/VehicleGuideField.tsx`, `VehicleGuideCard.tsx` -- à remplacer.
- `src/components/vehicle/modals/AddVehicleModal.tsx` L107, `EditVehicleModal.tsx` L134 -- upload après succès JSON, réinitialisation à l'ouverture.
- `src/app/api/vehicles/[id]/route.ts` L145 (GET), L367-416 (DELETE) ; `src/app/api/qr/[token]/vehicle/route.ts` L117 -- métadonnées, nettoyage.
- `src/app/vehicles/[id]/page.tsx` L272, `src/app/qr/[token]/page.tsx` L184, `types.ts` des deux -- carte.
- `src/lib/vehiclePhoto.ts` `omitVehicleR2Keys` -- à garder : les colonnes `guide*` restent.
- `src/lib/demo/readOnly.ts` L43 -- nouvelle regex ; `cloneDatabase.ts` lit `sqlite_master` : aucune modification.
- `src/lib/alerts/schema.ts` + `src/__tests__/integration/setup.ts`, `scripts/setup-dev.ts` -- modèle de DDL partagé.
- `scripts/add-vehicle-photo.ts` -- modèle de migration.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/vehicleDocuments/schema.ts` -- DDL table + index `vehicleId` -- partagé migration/dev/tests.
- [x] `scripts/add-vehicle-documents.ts` -- crée la table, reprend les guides (`INSERT` si `r2Key` absente), vérifie les comptes ; dry-run, `--apply` -- conservation des fichiers.
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- table -- parité.
- [x] `src/lib/vehicleDocuments/server.ts` -- `listVehicleDocuments`, `vehicleDocumentResponse` -- commun aux routes véhicule et QR.
- [x] `src/app/api/vehicles/[id]/documents/route.ts` -- POST un fichier -- ajout.
- [x] `src/app/api/vehicles/[id]/documents/[documentId]/route.ts` -- GET (`?download=1`), DELETE.
- [x] `src/app/api/qr/[token]/documents/[documentId]/route.ts` -- GET.
- [x] Routes `guide` et `vehicleGuideResponse.ts` -- supprimer ; `readOnly.ts`, `npm run mcp:catalog` -- suivre le changement.
- [x] `src/app/api/vehicles/[id]/route.ts`, `src/app/api/qr/[token]/vehicle/route.ts` -- exposer `documents` ; DELETE véhicule nettoie lignes et objets.
- [x] `src/components/ui/PdfReader.tsx`, `PdfReader.module.css`, `usePdfDocument.ts` -- déplacer et renommer la liseuse et ses hooks (`usePdfDocument`, `usePdfPageRender`) ; libellé par défaut « Document », textes « Télécharger le document », « Chargement du document » -- nom générique ; `ReferentielChatPanel.tsx` et tests à suivre.
- [x] `src/components/vehicle/VehicleDocumentsField.tsx` -- sélection multiple, retrait, annulation, `applyDocumentChanges` (un appel par fichier).
- [x] `src/components/vehicle/VehicleDocumentsCard.tsx` -- liste Lire/Télécharger -- invoquer `/component-templates`.
- [x] Modales, pages véhicule et QR, `types.ts` -- brancher, retirer `guide*`.
- [x] Tests : intégration des routes (401/403/400/413/404, cloisonnement), migration (reprise, relance), RTL champ et carte ; adapter les tests existants.
- [x] `package.json`/lock → 5.44.0 ; `CHANGELOG.md` ; `CLAUDE.md` (migration « À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.44.0 »).

**Acceptance Criteria:**
- Given un véhicule avec un guide en production, when la migration passe et la v5.44.0 est déployée, then ce fichier reste lisible et téléchargeable dans « Documents liés au véhicule ».
- Given un gestionnaire dans une modale véhicule, when il sélectionne plusieurs PDF et valide, then chacun apparaît sur la page du véhicule et sur sa page QR.
- Given un véhicule à plusieurs documents, when un bénévole clique « Lire » sur l'un, then la liseuse ouvre ce document-là.

## Implementation Notes

- `applyDocumentChanges` ajoute avant de retirer : un remplacement dont l'upload échoue garde l'ancienne version.
- Le nom de repli d'un document sans nom devient `document.pdf` ; la migration garde `guide-verification.pdf` pour les vrais guides sans nom.
- Vérifié par lint, tests et build. Le parcours réel (R2, navigateur, migration sur une vraie base) n'a pas été exécuté : voir « Manual checks ».

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|--------|---------|---------|--------|-------|
| 1 | blind + edge + gap | Ligne reprise morte si l'ancienne route remplace ou retire un guide entre migration et déploiement | low | Réel mais fenêtre de quelques minutes ; 409 explicite, retrait possible par le bouton ; le correctif exige de distinguer les lignes reprises | rejet |
| 2 | blind | Relance après déploiement présentée comme facultative dans `CLAUDE.md` | medium | Plus aucune route ne lit `guide*` : un guide déposé après la dernière exécution disparaît de l'interface | defer (fichier de contexte agent) |
| 3 | blind + edge | Suppression d'un véhicule avec guide non repris : objet R2 orphelin | low | SELECT `guideR2Key` retiré ; orphelin inoffensif, limité à la même fenêtre | rejet |
| 4 | blind + edge | Retrait non atomique : `DELETE` puis `UPDATE` séparés | low | `documents/[documentId]/route.ts` ; un échec de l'UPDATE permet à une relance de recréer le document ; `db.batch` disponible | patch |
| 5 | blind + edge | 500 après suppression du véhicule si `deleteVehicleDocuments` échoue en base, photo non nettoyée | medium | Seules les erreurs R2 sont capturées ; l'ancien code ne pouvait pas lever à cet endroit | patch |
| 6 | blind | Retraits avant ajouts : un remplacement dont l'upload échoue perd les deux versions | medium | `applyDocumentChanges` ; l'ancienne route écrivait le nouveau avant de supprimer l'ancien | patch |
| 7 | blind + edge | Échec de retrait sans nom de document | low | `remove` ne porte que des id ; correction directe | patch |
| 8 | blind + edge | Base démo sans table jusqu'à la recopie de 23h59 : fiches véhicule en 500 en mode démo | medium | `db` route la démo vers sa base ; le script ne vise que `TURSO_DATABASE_URL` ; à documenter | defer (fichier de contexte agent) |
| 9 | blind | Audit des retraits : `entityId` = id du document avec `entityType: 'vehicle'` | medium | `entityIdFrom` prend le dernier paramètre sans `idParam` | patch |
| 10 | blind + edge | Doublons si le même fichier est choisi deux fois, pas de progression par fichier | low | Réel, sans perte ; garde et indicateur ajoutent de la logique | rejet |
| 11 | blind | Nom de repli `guide-verification.pdf` pour un document sans nom | low | `vehicleGuide.ts:14` ; correction directe d'une constante | patch |
| 12 | blind | Noms `GUIDE_*` et `vehicleGuide.ts` conservés | low | Choix de la spec : réutilisés aussi par le référentiel ; seul le renommage de la liseuse a été demandé | rejet |
| 13 | blind | `VehicleDocumentsField.tsx` à 205 lignes, styles en ligne | low | Une seule responsabilité d'interface ; même style que l'ancien champ ; la règle interdit de découper pour un nombre de lignes | rejet |
| 14 | blind | Espace manquant `usePdfPageRender(doc,pageNumber` | low | `PdfReader.tsx` ; correction directe | patch |
| 15 | blind | Migration : sortie sur colonne absente, atomicité non testées | low | Échec bruyant ; atomicité portée par `db.batch` | rejet |
| 16 | edge | Index absent alors que la table existe | false | Table et index passent dans le même lot, ou via `setup-dev` qui crée les deux : cet état n'est pas atteignable | rejet |
| 17 | edge | Collision de l'identifiant de 8 caractères dans la clé R2 | low | 32 bits par véhicule pour une poignée de documents | rejet |
| 18 | edge | Véhicule supprimé pendant un upload | low | Fenêtre très courte, orphelin inoffensif | rejet |
| 19 | edge | Fermeture de la modale pendant les envois | low | Comportement existant, fenêtre allongée ; ajoute des gardes dans deux modales | rejet |
| 20 | edge | Retrait en 404 quand le document est déjà parti | low | Exige deux gestionnaires simultanés ; ajoute une branche | rejet |
| 21 | edge | Tâche « vérifie les comptes » non tenue | false | Le script vérifie que chaque guide a sa ligne, ce qui est la réconciliation utile | rejet |
| 22 | gap | Page véhicule : URL et absence de carte non testées | medium | Aucun test ne rend la page ; ligne « Aucun document » de la matrice | patch |
| 23 | gap | Échecs de retrait et échecs multiples non testés | medium | Aucune occurrence de « Retrait impossible » dans les tests | patch |
| 24 | gap | Replis de migration (nom, taille, date NULL) non testés | medium | Aucun jeu d'essai avec clé et métadonnées NULL | patch |
| 25 | gap | POST non testé pour RESP_VEHICULE | medium | `resp-vehicule-authz.test.ts` ne couvre que le DELETE | patch |
| 26 | gap | Alerte « non enregistré(s) » affichée pour un retrait échoué | low | `EditVehicleModal.tsx:136` ; correction directe du texte | patch |

## Design Notes

Colonnes `guide*` gardées et plus lues par les routes, sauf remise à NULL au retrait : un retour arrière retrouve les guides, et une relance de la migration après déploiement rattrape un guide déposé entre migration et bascule, sans ressusciter un document retiré.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- tous verts
- `npm run build` -- succès

**Manual checks (if no CLI):**
- `npm run dev` : déposer 3 PDF totalisant plus de 4 Mo, lire, télécharger, retirer l'un d'eux ; vérifier sur la page QR.

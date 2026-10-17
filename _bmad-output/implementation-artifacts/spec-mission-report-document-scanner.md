---
title: 'Scanner de document pour le compte rendu de mission'
type: 'feature'
created: '2026-10-16'
status: 'done'
baseline_commit: '7d6c49f1e1bea50fa99d75e6aadaaa1032c7a2b4'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La prise de photo du compte rendu de mission ouvre simplement l'appareil photo natif : l'image contient la table, les bords, la perspective, et le document est peu lisible une fois archivé sur Drive.

**Approach:** Remplacer le bouton « Appareil photo » par un scanner intégré, comme celui des iPhone / Android : flux caméra en direct, détection des bords du document en temps réel, capture (automatique dès que le cadre est stable, ou manuelle), ajustement des 4 coins, redressement de la perspective et amélioration du contraste. Le résultat remplace la photo brute dans le flux d'envoi existant.

**Décisions (validées le 2026-10-16) :**
- Périmètre : étape 7 « Compte rendu signé » uniquement ; l'étape 8 (photos de communication) garde l'appareil photo natif.
- Multi-pages : le scanner enchaîne les pages et produit un seul PDF (une page seule produit aussi un PDF d'une page), sous 4 Mo.
- Rendu : couleur à contraste amélioré par défaut, avec bascule « Noir & blanc ».

## Boundaries & Constraints

**Always:**
- Traitement 100 % côté navigateur ; le moteur de détection n'est chargé qu'à l'ouverture du scanner (aucun impact sur le poids des autres pages).
- Repli systématique sur l'actuel `<input capture="environment">` si la caméra est refusée/indisponible ou si le moteur ne charge pas — l'utilisateur n'est jamais bloqué.
- Si aucun bord n'est détecté, la capture reste possible avec le cadre plein et des coins ajustables.
- Le fichier produit passe par le circuit actuel (`PhotoPicker` → `uploadFilesToDriveSafely`) et respecte la limite serveur de 4,2 Mo par fichier.
- Libellés et messages en français ; dark mode et mobile (cible principale) pris en charge.

**Never:**
- Pas de nouvelle route API, pas de migration, pas de changement de schéma (`signed_report_drive_id` reste un identifiant unique).
- Pas de service tiers / CDN externe pour le traitement d'image ; pas de dépendance à binaire natif (ex. `jscanify` tire `canvas` + `jsdom`).
- Pas d'OCR.
- Ne pas toucher au bouton « Galerie » ni aux autres usages de `PhotoPicker` (check-in/out, frais).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scan nominal | Document posé, caméra autorisée | Contour surligné en direct ; capture auto après ~1 s de stabilité ; écran d'ajustement ; image redressée ajoutée | N/A |
| Aucun bord détecté | Fond uniforme / document hors champ | Bouton déclencheur manuel actif ; coins par défaut = cadre entier | N/A |
| Caméra refusée | `getUserMedia` rejette (NotAllowedError) | Message « Accès caméra refusé » + bouton « Utiliser l'appareil photo du téléphone » (input natif) | Pas d'erreur bloquante |
| Moteur indisponible | Échec du chargement OpenCV | Même repli que ci-dessus | Erreur journalisée en console |
| Fichier trop lourd | Résultat > 4 Mo | Recompression automatique (qualité/dimension) ; si toujours trop lourd, message clair | Ajout refusé |
| Fermeture | Utilisateur ferme le scanner | Flux caméra arrêté (pistes `stop()`), rien n'est ajouté | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ui/PhotoPicker.tsx` -- seule UI de capture ; bouton « Appareil photo » L145-153, input `capture` L166-173, `handleFiles` L54-111 (compression + contrôles de taille) à réutiliser pour injecter le fichier scanné.
- `src/components/missions/steps/Step7SignedReport.tsx` -- `PhotoPicker` mode simple, `accept="image/*,application/pdf"`, L24-31.
- `src/components/missions/steps/Step8Photos.tsx` -- `PhotoPicker` mode multiple ; ne pas modifier.
- `src/components/missions/MissionWizard.tsx` -- envoi L236-283 (`uploadFilesToDriveSafely`, `allowPdf: true` pour le compte rendu) ; ne pas modifier.
- `src/lib/imageCompression.ts` -- `compressImage(file, 1600, 0.78)` (ignore < 800 Ko) ; upload par lots ≤ 3,5 Mo.
- `src/app/api/drive/upload/route.ts` -- limite 4,2 Mo/fichier (L45-46), PDF seulement si `allowPdf` ; ne pas modifier.
- `next.config.ts` L46 -- `Permissions-Policy: camera=()` bloque `getUserMedia` : passer à `camera=(self)`.
- `pdf-lib` (déjà en dépendance) -- assemblage PDF multi-pages côté client.
- Tests : `src/__tests__/components/PhotoPicker.test.tsx` (mock `@/lib/imageCompression` L9-12), `MissionWizard.test.tsx`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` / `package-lock.json` -- ajouter `@techstark/opencv-js@4.12.0-release.1` ; version 5.23.0 -- moteur de détection pur JS/wasm, chargé dynamiquement.
- [x] `src/lib/documentScanner/geometry.ts` -- fonctions pures : ordonnancement des coins, aire/convexité d'un quadrilatère, taille de sortie (longueurs des bords, max 2000 px), test de stabilité entre images successives.
- [x] `src/lib/documentScanner/opencv.ts` -- chargeur singleton (`import()` dynamique, attente de l'init wasm) + `detectQuad(frame)` (gris → flou → Canny → dilatation → contours → `approxPolyDP`, plus grand quadrilatère convexe > 20 % du cadre, analyse sur image réduite ~480 px) + `warpAndEnhance(image, quad, mode)` (`getPerspectiveTransform`/`warpPerspective`, normalisation du contraste, mode `color` | `bw` avec seuillage adaptatif).
- [x] `src/lib/documentScanner/output.ts` -- pages (canvas) → JPEG puis un seul PDF `compte-rendu-scan.pdf` via `pdf-lib`, recompression progressive pour rester sous 4 Mo ; nombre de pages plafonné à 10.
- [x] `src/components/ui/DocumentScanner.tsx` + `.module.css` -- modale plein écran (via `/component-templates`) : vidéo caméra arrière, calque du contour (~8 analyses/s), capture auto + déclencheur, écran d'ajustement des 4 coins (glisser tactile/pointeur), aperçu redressé avec bascule « Couleur / Noir & blanc », « Reprendre » / « Ajouter une page » / « Terminer », vignettes des pages (suppression possible), repli natif, arrêt du flux au démontage.
- [x] `src/components/ui/PhotoPicker.tsx` -- prop optionnelle `scanDocument?: boolean` : le bouton « Appareil photo » ouvre `DocumentScanner` ; le fichier produit passe par `handleFiles` ; le repli déclenche l'input `capture` existant.
- [x] `src/components/missions/steps/Step7SignedReport.tsx` -- passer `scanDocument`.
- [x] `next.config.ts` -- `camera=(self)`.
- [ ] Tests : `src/__tests__/unit/documentScanner-geometry.test.ts`, `documentScanner-output.test.ts`, `src/__tests__/components/DocumentScanner.test.tsx` (mock `getUserMedia` + module OpenCV), compléments `PhotoPicker.test.tsx` -- couvrir la matrice I/O.
- [x] `CHANGELOG.md` -- entrée 5.23.0 en français, orientée utilisateur.

**Acceptance Criteria:**
- Given l'étape « Compte rendu signé », when l'utilisateur touche « Appareil photo », then le scanner s'ouvre et les autres usages de `PhotoPicker` gardent l'appareil photo natif.
- Given un scan validé, when le compte rendu est envoyé, then le fichier redressé est déposé sur Drive comme aujourd'hui, sans changement côté serveur.
- Given une page sans scanner ouvert, then le moteur OpenCV n'est pas téléchargé.

## Implementation Notes

- L'export d'OpenCV.js est un « thenable » auto-référent (`Module.then(f)` appelle `f(Module)`) : il est exposé via l'enveloppe `src/lib/documentScanner/opencvModule.ts` (boîte `{ cv }`), `then` est supprimé avant résolution, et le chargement est borné à 20 s. Vérifié sur le vrai module dans Node (résolution OK, `new cv.Mat` OK).
- `next.config.ts` : repli webpack `fs`/`path`/`crypto` côté client (code Node d'OpenCV.js inutile au navigateur).
- Build : OpenCV dans un chunk asynchrone séparé (~10,8 Mo), référencé uniquement par la table de chargement à la demande de webpack.
- `licenseCheck.test.ts` (test 6) échoue indépendamment de ce changement : calcul de jours dépendant de la date (15 au lieu de 14).
- Non vérifié : comportement réel sur téléphone (caméra, détection, capture auto).

## Spec Change Log

## Review Triage Log

Passe 1 (Blind Hunter = B, Edge Case Hunter = E, Verification Gap = V)

| # | Constat | Verdict | Preuve | Route |
|---|---------|---------|--------|-------|
| E1/E14 | Le module OpenCV est un « thenable » auto-référent : `await` boucle à l'infini | high | `dist/opencv.js` : `Module["then"]=function(func){… func(Module)}` ; webpack renvoie l'objet tel quel au `import()` d'un CJS doté de `then` ; résoudre une promesse avec lui la ré-adopte sans fin → onglet figé, pas de repli | patch |
| B4/E2 | Aucun délai max sur l'init wasm | medium | `onRuntimeInitialized` sans rejet ; « Chargement du scanner… » sans fin, `engineFailed` jamais posé | patch (avec E1) |
| B15/E15 | Le chargeur réel (`loadOpenCv`) n'est pas testé | medium | Tous les tests simulent `@/lib/documentScanner/opencv` ; c'est ce qui a masqué E1 | patch |
| B1 | `toDataURL` (≤ 2000 px) recalculé à chaque rendu de l'aperçu | medium | `src={canvasUrl(processed.canvas, 0.85)}` dans le JSX, rendu à chaque `busy`/`error` | patch |
| B2 | Vignettes = data URL pleine taille | medium | `thumb: canvasUrl(canvas, 0.6)` sur le canvas complet ; ×10 pages en mémoire mobile | patch |
| B3 | Nouveau canvas d'analyse ~8×/s | medium | `document.createElement('canvas')` dans `detectQuad` ; plafond mémoire canvas d'iOS Safari | patch |
| B6/E5 | Capture auto immédiate de la même page après « Ajouter une page » | medium | La boucle redémarre à l'entrée en phase caméra, stabilité 1 s, aucun réarmement | patch |
| E6 | Capture auto pendant l'enregistrement (« Terminer » en phase caméra) | medium | `active: phase === 'camera'` ne tient pas compte de `busy` | patch |
| B9/E9 | Coins croisés/dégénérés acceptés | medium | `CornerAdjuster` ne contrôle rien ; `process` ne vérifie pas `isConvexQuad` → sortie miroir/illisible | patch |
| B11/E13 | Bouton retour Android / Échap ne ferment pas le scanner | medium | Aucune entrée d'historique ni écoute `keydown` ; retour quitte l'assistant en cours | patch |
| E3 | Caméra laissée allumée derrière l'écran de repli moteur | low | Le hook reste monté quand `engineFailed` → flux actif | patch |
| B12/E7 | Bascule de rendu désynchronisée si le traitement échoue | low | `setMode(next)` avant `process` | patch |
| E8 | Erreur précédente conservée après « Reprendre » | low | `retake` ne remet pas `error` à null | patch |
| E10 | Poignées à moitié hors cadre avec les coins par défaut | low | `.body` padding 12 px < demi-poignée 22 px | patch |
| E11 | Rotation : ratio et calque obsolètes | low | `videoSize` seulement sur `loadedmetadata` | patch |
| B5 | Le spinner ne s'affiche pas pendant le redressement | low | `await` d'une promesse déjà résolue = microtâche, pas de rendu avant le calcul synchrone | patch |
| B14 | Test de fermeture n'affirme pas l'arrêt des pistes | low | Pas d'`expect(stop)` dans ce test | patch |
| V1 | Retirer `scanDocument` de l'étape 7 ne casse aucun test | medium | Aucun test de `Step7SignedReport` | patch |
| V2 | Test « supprimer une vignette » ne supprime rien | medium | Aucun clic « Supprimer la page » | patch |
| V3/B8 | `MAX_SCAN_BYTES` non lié à la limite serveur | low | Constante libre ; serveur `4.2 * 1024 * 1024` (route.ts L45) | patch (test de borne) |
| V4 | `encodeCanvasToJpeg` jamais exécuté | low | Tous les tests injectent `encode` | patch |
| V5 | Revenir à `camera=()` ne casse aucun test | medium | Aucun test de `next.config.ts` | patch |
| V6/B15 | Chemin « caméra indisponible » non testé | low | Seul `NotAllowedError` est testé | patch |
| B16 | Changelog muet sur la limite de 10 pages | low | Entrée 5.23.0 | patch |
| B8 (indice 15 Mo) | Indice « 15 Mo » de l'étape 7 alors que le serveur refuse > 4,2 Mo | medium | Préexistant (galerie), non causé par ce changement | defer |
| B7 | Un scan refusé perd toutes les pages | false | PDF ≤ 4 Mo < `maxSizeMB` 15 / total 150 en mode simple : refus inatteignable à l'étape 7 | rejet |
| B10 | Poignées non utilisables au clavier | low | Réel, mais cible mobile tactile et correctif ajoute des gestionnaires | rejet |
| B13 | Clés d'index sur les vignettes | false | Vignettes sans état ; React met à jour `src`/`alt`, rendu correct | rejet |
| E4 | Échec moteur après pages scannées | false | Une page ne peut exister qu'après `warpAndEnhance`, donc moteur chargé | rejet |
| E12 | Échec de téléchargement du chunk du scanner | low | Rare (déploiement en cours) ; correctif ajoute un composant de secours | rejet |

## Design Notes

OpenCV.js (~9 Mo wasm, mis en cache après la première ouverture) est retenu plutôt qu'une détection maison : la détection de contours robuste (Canny + contours + approximation polygonale) et la transformation de perspective sont éprouvées. Le reste de la logique (géométrie, stabilité, sortie) est isolé en fonctions pures testables sans wasm.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- suite verte
- `npm run build` -- build OK, OpenCV dans un chunk séparé

**Manual checks (if no CLI):**
- Sur mobile (HTTPS ou localhost) : détection du contour en direct, capture, ajustement des coins, image redressée lisible.

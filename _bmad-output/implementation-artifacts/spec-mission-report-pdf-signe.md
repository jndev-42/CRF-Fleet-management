---
title: 'Rapport de mission DPS/PAPS : photo, signature dans l''appli (PDF) ou aucun rapport'
type: 'feature'
created: '2026-11-16'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '26aacf8bf8057326e5eed26790e1441ee6ed4baf'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Pour un DPS ou un PAPS, l'étape « Rapport signé » impose une photo ou un scan du rapport papier signé. On ne peut ni signer le rapport dans l'appli, ni soumettre sans rapport.

**Approach:** L'étape « Rapport signé » propose trois choix :
1. **Prendre en photo le rapport papier signé** : comportement actuel, inchangé.
2. **Signer / faire signer le rapport dans l'appli** : le serveur remplit le PDF modèle officiel « Rapport de mission – Dispositif Prévisionnel de Secours » avec les données du compte rendu et les deux signatures. Le PDF est rangé sur R2 comme les photos.
3. **Ne pas fournir de rapport.**

Les champs du modèle absents aujourd'hui sont ajoutés au parcours.

**Décisions (réponses du 2026-11-16) :**
- **Horaires et responsable (étape Général, DPS/PAPS uniquement, pour tous les modes).** On ajoute :
  - heure de début et heure de fin de mission ;
  - heure d'arrivée sur place et heure de départ des lieux ;
  - le responsable de la mission, pré-rempli avec le nom du soumetteur et modifiable ;
  - son téléphone, saisi à la main.

  Ces champs sont facultatifs en mode photo ou aucun rapport, obligatoires en mode appli.
- **Observations, en mode appli.** L'étape affiche d'abord la case « Observations Croix-Rouge », puis la signature du soumetteur (« Responsable de l'équipe »). Elle affiche ensuite la case « Observations organisateur », le nom et la fonction de l'organisateur, puis sa signature (« Responsable de l'organisation »), apposée sur l'appareil du soumetteur. Les deux cases d'observations sont facultatives.
- **Signatures.** Image de signature (dessin ou nom tapé) plus date. Pas de scellement cryptographique.
- **PDF.** Le PDF modèle fourni est rempli tel quel : texte et images posés aux coordonnées de ses cases.
- **Aucun rapport.** Pas de justification. Un avertissement s'affiche : « L'UL est responsable de l'absence de rapport de mission signé ».

## Boundaries & Constraints

**Always:**
- Le choix ne concerne que les DPS et les PAPS.
- Le mode est stocké dans `mission_reports.signed_report_mode` : PHOTO, APP ou NONE ; NULL pour RESEAU et pour l'existant.
- Le PDF est rangé sous `mission-report-photo/<UL>/<mission>-<horodatage>-<xxxx>/<id>-rapport-de-mission.pdf` et référencé par `signed_report_drive_id`.
- Écriture R2 via `putObject` (compatible avec le mode démo), avant l'INSERT.
- Le parcours QR UL suit le même code.
- Les nouveaux champs de contenu sont modifiables en édition et tracés dans l'historique.
- La migration prod `scripts/add-*.ts` est inscrite dans CLAUDE.md.

**Never:**
- Ne pas modifier ni régénérer le rapport ou le PDF après soumission.
- Ne pas toucher aux grilles d'intervention.
- Ne pas stocker les images de signature en base : elles n'existent que dans le PDF.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Photo | DPS, PHOTO + fichier | Identique à aujourd'hui ; mode=PHOTO | Fichier absent → étape bloquée, 400 serveur |
| Appli | PAPS, APP, 2 signatures, horaires, responsable et téléphone | PDF rempli, PUT R2, INSERT avec la clé, mode=APP | Champ ou signature manquant → 400 Zod ; échec R2 → 500 sans INSERT |
| Aucun | DPS, NONE | Avertissement affiché ; INSERT sans clé, mode=NONE | — |
| RESEAU | aucun mode | Étape absente, mode NULL, nouveaux champs ignorés | — |
| Édition vers DPS/PAPS | rapport RESEAU passé en DPS | Accepté, mode=NONE, avertissement affiché | — |

</frozen-after-approval>

## Code Map

- `src/components/missions/MissionWizard.tsx` -- `MissionFormData` L30-62, `activeSteps` L184-199, `showReportStep` L181, validation L313-315/L334, refus en édition L287-293 (à remplacer par NONE + avertissement), envoi L385-430.
- `src/components/missions/steps/Step7SignedReport.tsx` -- étape actuelle (PhotoPicker + scanner) : sélecteur des 3 modes, sous-parcours APP.
- `src/components/missions/steps/Step1General.tsx` -- nouveaux champs horaires et responsable, si DPS/PAPS.
- `src/lib/missionDraft.ts` -- brouillon IndexedDB : on garde les nouveaux champs et le mode, mais pas les signatures.
- `src/components/expenses/ElectronicSignatureModal.tsx` -- à rendre générique : texte de consentement L513 et verbe passés en props. On en réutilise `SignatureData.image`, un PNG en data URL.
- `src/app/api/missions/route.ts` -- `missionReportContentSchema` L53-82 (nouveaux champs) et `createMissionReportSchema` L169-191. Pour ce dernier :
  - ajouter `signed_report_mode` et `app_report` : signatures, noms, fonction, observations, plafonnés en taille ;
  - superRefine : PHOTO ⇒ clé ; APP ⇒ pas de clé et champs requis ; NONE ⇒ ni l'un ni l'autre.
- `src/lib/missions/create-mission-report.ts` -- `insertMissionReport` L222. En mode APP : génération du PDF, `buildMediaFolderRef('mission-report-photo', …)` avec le même segment UL que la route d'upload, `putObject`, puis INSERT des colonnes nouvelles.
- `src/lib/missions/update-mission-report.ts`, `src/app/api/missions/[id]/route.ts` -- `updateMissionReportSchema` L199-203. Nouveaux champs éditables ; passage vers DPS/PAPS ⇒ mode NONE.
- `src/app/api/qr-ul/[token]/mission-report/route.ts` -- même schéma, même code.
- `src/lib/media/refs.ts` (`buildMediaFolderRef` L100, `buildMediaFileKey` L125), `src/lib/media/server.ts` -- segment UL.
- `src/lib/r2.ts` -- `putObject` L311.
- `src/lib/mission-interventions.ts` -- correspondance avec les cases du PDF :
  - MODE : SOINS / DECHARGE / DAE / EVAC_CRF / EVAC_AUTRES ;
  - NATURE : PETITS_SOINS / MALAISE / TRAUMATISME / INCONSCIENCE / ARRET_CARDIAQUE ;
  - total = `victim_count`.
- `src/app/missions/[id]/page.tsx` -- L183 / L437 `SignedReportLightbox` (gère déjà le PDF) : afficher le mode, les horaires et le responsable.
- `scripts/setup-dev.ts` L612-710, `scripts/add-mission-report-edits.ts` -- schéma dev et modèle de migration.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/add-mission-report-signed-mode.ts` + `scripts/setup-dev.ts` + `CLAUDE.md` -- colonnes `signed_report_mode` (CHECK PHOTO/APP/NONE), `start_time`, `end_time`, `arrival_time`, `departure_time` (TEXT HH:MM), `mission_lead_name`, `mission_lead_phone`, `crf_observations`, `organizer_observations`, `organizer_name`, `organizer_function` ; idempotent, dry-run/--apply/--env.
- [x] `src/lib/missions/report-template/rapport-mission-dps.pdf` + `src/lib/missions/report-pdf.ts` -- `fillMissionReportPdf(data, signatures)` avec pdf-lib : texte et signatures (et dates) posés dans les cases ; modèle chargé via `fs` + `outputFileTracingIncludes` dans `next.config`.
- [x] Schémas Zod, `create-mission-report.ts`, `update-mission-report.ts`, routes missions et QR -- règles décrites dans le Code Map.
- [x] `ElectronicSignatureModal.tsx`, `Step1General.tsx`, `Step7SignedReport.tsx`, `MissionWizard.tsx`, `missionDraft.ts` -- UI des 3 modes, avertissement NONE, sous-parcours APP.
- [x] `src/app/missions/[id]/page.tsx` -- affichage du mode et des nouveaux champs.
- [x] Tests :
  - unitaires `report-pdf` : PDF valide d'une page, textes présents ;
  - intégration `missions` et `qr-ul-mission-report` : 400/happy path pour chaque mode et R2 mocké ;
  - composant `MissionWizard` : sélection des modes, avertissement, champs requis en APP.
- [x] `package.json`, `package-lock.json`, `CHANGELOG.md` -- version mineure et entrée en français, centrée sur l'utilisateur.

**Acceptance Criteria:**
- Given un PAPS en mode APP, when il est soumis, then la fiche ouvre un PDF au format du modèle, avec les deux signatures datées et les compteurs d'interventions.
- Given un compte rendu existant, when la migration a tourné, then son affichage est inchangé.

## Design Notes

La signature de l'organisateur est apposée sur l'appareil du soumetteur, dans la même session : aucun compte organisateur, aucun lien externe. La modale de signature est ouverte deux fois, avec des libellés distincts. Le PDF est généré côté serveur à partir de données déjà validées, de sorte que son contenu correspond toujours à la ligne insérée.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | PATCH : `.required()` rend obligatoires les 10 nouvelles clés (client en cache, MCP → 400) | medium | `create-mission-report.ts:297` ; patch : clés facultatives en édition, valeur stockée conservée si absente |
| 2 | DPS/PAPS → Réseaux : la fiche affiche encore le mode et l'avertissement NONE | medium | `page.tsx:321-323` ne teste pas `mission_type` ; patch : n'afficher que pour DPS/PAPS |
| 3 | Création et édition stockent différemment observations / organisateur (APP seulement vs tout DPS/PAPS) | low | `dpsFieldsToStore` vs `dpsFieldsForUpdate`, Step9 `showReportFields` ; patch : en édition, seulement si le mode stocké est APP |
| 4 | Signature organisateur périmée si nom/fonction modifiés après signature | medium | `SignedReportAppPanel.tsx:156` capte `organizer_name` à la signature ; patch : effacer la signature au changement |
| 5 | DPS/PAPS sans mode ni fichier → NONE implicite (MCP, scripts) | medium | `effectiveSignedReportMode` ; patch : 400 si mode absent sans fichier |
| 6 | `db.transaction` hors du try : PDF orphelin si l'ouverture échoue | low | `create-mission-report.ts:451` ; patch : ouvrir la transaction dans le bloc gardé |
| 7 | Modales : `actionVerb="valider"` ; nom du soumetteur vide possible | low | `SignedReportAppPanel.tsx:145-160` ; patch : verbe « signer », repli sur `mission_lead_name` |
| 8 | Test absent : envoi APP du wizard (payload `app_report`) | gap | patch : test `MissionWizard` |
| 9 | Test absent : `reportToWizardState` des nouveaux champs | gap | patch : test unitaire |
| 10 | Test absent : affichage fiche (mode, avertissement, champs) | gap | patch : test `MissionDetailPage` |
| 11 | Test absent : suppression R2 si l'INSERT échoue | gap | patch : test intégration |
| 12 | Inclusion du modèle PDF dans la fonction Vercel non vérifiable en test | gap | defer : à vérifier sur la preview |
| 13 | Champs modifiables en édition divergent du PDF signé | false | conforme à l'intention : champs éditables, PDF jamais régénéré |
| 14 | Pas de rattrapage du mode sur l'existant | false | spec : NULL pour l'existant, affichage inchangé |
| 15 | `signed_at` / nom fournis par le client | low | rejeté : utilisateur authentifié, garde ajoutée non triviale |
| 16 | Champs requis affichés trop tard (Général avant le choix du mode) | low | rejeté : décision de placement validée, message renvoie à Général |
| 17 | Cohérence des horaires, format du téléphone | low | rejeté : missions de nuit, ajout de règles |
| 18 | Pas d'entrée d'audit | false | les routes sont enveloppées par `withAudit` |
| 19 | PNG corrompu → 500 au lieu de 400 ; PNG « bombe » | low | rejeté : rare, utilisateur authentifié, garde non triviale |
| 20 | Changement de mode absent de l'historique | low | rejeté : rare, ajout au snapshot |
| 21 | Champs APP vidables en édition | false | conforme : champs éditables |
| 22 | `missionDraft.ts` absent du diff | false | le brouillon reprend `INITIAL_FORM` ; signatures exclues (état séparé) |
| 23 | Modèle DPS 2009 valable pour les PAPS ? | false | décision humaine : même modèle pour DPS et PAPS |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: suite verte
- `npx tsx scripts/add-mission-report-signed-mode.ts` -- expected: dry-run listant les colonnes à ajouter

**Manual checks (if no CLI):**
- Soumettre un DPS dans chacun des 3 modes en dev ; ouvrir le PDF du mode APP et vérifier l'alignement des cases.

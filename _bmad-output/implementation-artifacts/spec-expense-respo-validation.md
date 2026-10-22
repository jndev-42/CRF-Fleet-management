---
title: 'Notes de frais : validation par le responsable d''activité (RESPO) puis par le président'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: '1e03f248dd7b9a8a0fdfd286a055269cad1cd805'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aujourd'hui, une NDF soumise est validée en une seule étape par le président (ou un super admin), puis payée par le trésorier. Le tampon de l'UL est imprimé dès la soumission, avant toute validation. Rien n'empêche un président de créer une NDF à son propre nom.

**Approach:**
- Créer le rôle `RESPO` (responsable d'activité).
- Insérer une étape « responsable d'activité » entre la soumission et la validation par le président :
  1. Le RESPO signe dans la colonne « Le responsable ».
  2. Le président signe ensuite. Sa signature visible et le tampon de l'UL (s'il est configuré) sont alors apposés ensemble, dans la colonne « Tampon de la structure ».
- Si le président signe à la place du RESPO, les deux signatures sont posées d'un coup et les deux étapes sont validées.
- Le paiement par le trésorier reste inchangé.
- Un président ne peut plus créer de NDF à son nom.

## Boundaries & Constraints

**Always:**
- Les rôles sont évalués sur l'UL active, comme partout ailleurs.
- Le président peut agir à l'étape RESPO comme à l'étape président. SUPER_ADMIN garde les mêmes droits que le président.
- Chaque signature est une révision incrémentale scellée, journalisée dans `signatureRevisions`.
- Une signature combinée par le président produit deux révisions : une dans le champ RESPO, puis une dans le champ président.
- Les quatre champs de signature sont posés avant la certification #1.
- Un refus reste signé et définitif. Un refus du président ne porte pas de tampon.
- Les NDF déjà soumises avant le déploiement (PDF scellé avec 3 champs) suivent l'ancien circuit : le président valide en une étape.

**Never:**
- Ajouter un champ de signature après la certification.
- Imprimer le tampon de manière statique dans le PDF scellé à la soumission.
- Modifier le circuit de paiement du trésorier.
- Bloquer la création de NDF pour SUPER_ADMIN.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| RESPO valide | NDF v2 `soumis` ; RESPO de l'UL signe | Signature #2 dans la colonne « Le responsable ». Statut `valide_respo`. Push aux présidents de l'UL. | N/A |
| Président finalise | `valide_respo` ; le président signe | Révision « président » avec signature et tampon (s'il existe). Statut `en_attente_paiement` ou `traité`. Push au trésorier si un remboursement est demandé. | N/A |
| Président à la place du RESPO | `soumis` ; le président signe | Deux révisions (RESPO, puis président avec tampon). Les deux étapes sont horodatées. Même statut final que ci-dessus. | N/A |
| Pas de tampon | UL sans `stampImage` | Le widget président porte la signature seule | N/A |
| RESPO à l'étape président | `valide_respo` ; un RESPO non président agit | Refusé | 403 |
| RESPO refuse | `soumis` ; RESPO refuse avec commentaire | Refus signé dans le champ RESPO. Statut `refusé`. | 400 si commentaire ou signature manquant |
| Président crée une NDF | POST par un PRESIDENT de l'UL active | Refusé, bouton masqué | 403 |
| NDF héritée | `workflowVersion` 1, `soumis` | Le président valide en une étape, comme avant. Le RESPO ne voit aucune action. | 403 pour le RESPO |
| Concurrence | Deux validations simultanées | La seconde est rejetée | 409 |
| Auto-validation | Un RESPO valide sa propre NDF | Refusé. Un autre RESPO de l'UL ou le président peut la valider. | 403 |

**Décisions (2026-10-22) :**
- **D1 — Anciennes vérifications RESPO :** les vérifications `includes('RESPO')` héritées de l'ancien rôle sont purgées, ainsi que les tests associés. Le nouveau RESPO n'a que des droits sur les NDF.
- **D2 — Auto-validation :** personne ne peut signer une étape de validation sur sa propre NDF. Une NDF créée par un RESPO peut être validée par un autre RESPO de l'UL ou par le président.
- **D3 — Notification à la soumission :** les RESPO et le président de l'UL sont notifiés. Après la validation RESPO, seul le président est notifié.
- **D4 — Libellés du PDF :** les libellés du modèle officiel sont conservés (« Le responsable : », « Tampon de la structure : »).

</frozen-after-approval>

## Code Map

**Rôles**
- `src/lib/roles.ts` : `ROLES`, `MANAGEABLE_ROLES`, `ROLE_LABELS`, `isExpenseManager` (l.146), `denyWhenInactive`. Ajouter `RESPO` et les prédicats `canValidateExpenseAsRespo` et `isPresident`, enveloppés dans `denyWhenInactive`.
- `src/__tests__/unit/roles.test.ts` : matrice des rôles l.41 ; tous les exports doivent être enveloppés dans `denyWhenInactive` (l.276).
- Points d'enregistrement d'un rôle, à reprendre sur le modèle du commit `19e7758` :
  - `src/auth.ts` `DEV_USERS`
  - `src/app/login/page.tsx`
  - `src/lib/preview-accounts.ts`
  - `scripts/seed-preview-users.{ts,sql}`
  - `scripts/setup-dev.ts:159`
  - `scripts/ensure-system-roles.ts`
  - `src/__tests__/integration/setup.ts:750`
  - `src/lib/demo/fetchInterceptor.ts:161`
  - `src/components/users/RoleLegend.tsx`
- Aucune contrainte CHECK en base sur les rôles. `GET /api/users` ajoute automatiquement les entrées de `MANAGEABLE_ROLES` à la table `Role`.

**Statuts et transitions**
- `src/app/api/expenses/[id]/route.ts` : transitions de la NDF.
  - zod l.17
  - `validate` l.236-295, `reject` l.296-341, `pay` l.342
  - notifications l.274 et l.511
  - `sealFailure` l.68
- `src/app/api/expenses/route.ts` : création (POST, vers l.205) et liste.

**Scellement**
- `src/lib/expenses/sealing.ts` : `sealStep1`, `sealStep2`, `sealStep3` ; type `SignatureRevision` avec `step: 1|2|3`.
- `src/lib/expenses/persist-seal.ts` `persistSealed` : n'accepte qu'un seul `seal` ; à étendre pour accepter plusieurs révisions.
- `src/lib/expenses/signature-layout.ts` : `SIGNATURE_WIDGET_RECTS` et `SIGNATURE_FIELDS`, qui sont contractuels. Ajouter `Signature4`, le champ président, aligné sur la colonne tampon. Mesurer son rectangle avec `scripts/measure-signature-rects.ts`, sans le deviner.
- `src/lib/pdf/signature.ts` `sealPdf({appearancePng})` : réutiliser tel quel.
- Composition tampon + signature : `sharp`, déjà utilisé dans `src/lib/stamp.ts`.

**PDF**
- `src/components/expenses/ExpensePdfDocument.tsx` l.480-580 : en mode `forSealing`, la colonne tampon devient une zone de widget vide (couleur de repérage `MEASURE_ZONE_COLORS`). Le rendu hors scellement reste inchangé.
- `src/lib/expenses/pdf.ts` : charge `ul.stampImage`.

**Interface**
- `src/app/expenses/page.tsx` : drapeaux de rôle l.44 et `signingContext` l.88.
- `src/app/expenses/ExpenseDetailSidebar.tsx` : boutons d'action l.246.
- `src/app/expenses/utils.tsx` : libellés et badges.
- `src/components/expenses/ExpenseForm.tsx` et le bouton de création.

**Données**
- Schéma : `scripts/setup-dev.ts:770-827` et le miroir de test `src/__tests__/integration/setup.ts:463`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/roles.ts` et les points d'enregistrement listés dans la Code Map : déclarer `RESPO`, son libellé et sa légende, plus les prédicats d'étape. Le rôle doit être assignable et testable en local et en preview.
- [x] `scripts/add-expense-respo-step.ts` (nouveau ; à copier aussi dans `setup-dev.ts` et dans le setup de test) : ajouter les colonnes `workflowVersion INTEGER DEFAULT 1`, `respoValidatedAt`, `respoValidatedBy`, `respoSignature`, et la ligne `Role` RESPO. Le script est idempotent : dry-run par défaut, `--apply` pour écrire.
- [x] `signature-layout.ts` et `ExpensePdfDocument.tsx` : ajouter le champ `Signature4` (président) sur la zone tampon, et retirer le tampon statique en mode `forSealing`. Mesurer le rectangle par script.
- [x] `sealing.ts` :
  - `sealStep1` pose 4 champs et écrit `workflowVersion = 2`.
  - Nouveau `sealPresident`, dont l'apparence compose le tampon (s'il existe) et la signature via `sharp`.
  - `sealStep2` sert à l'étape RESPO.
  - Le rôle de révision `'Responsable d'activité' | 'Président'` est ajouté.
  - Le journal reste rétrocompatible.
- [x] `persist-seal.ts` : accepter une suite de scellements (enchaînés en mémoire, une seule écriture R2 finale, toutes les révisions dans la même transaction).
- [x] `src/app/api/expenses/[id]/route.ts` :
  - L'action `validate` choisit l'étape selon le statut et `workflowVersion` : RESPO, président, ou combinée.
  - Ajouter le statut `valide_respo`.
  - `reject` autorisé aux deux étapes.
  - Les NDF v1 gardent l'ancien chemin.
  - Notifications selon D3.
  - Garde D2 (`userId` du demandeur ≠ signataire).
- [x] Fichiers listés par la Code Map (section Rôles, purge) : retirer les vérifications héritées `includes('RESPO')` dans :
  - `reservations/[id]/route.ts`
  - `reservations/recurrence/[groupId]/route.ts`
  - `vehicles/[id]/reservations/route.ts`
  - `VehicleDetailGrid.tsx`
  - `stats/page.tsx`
  - `GuidedTour.tsx`
  - `ReservationBlock.tsx`
  - `ReservationFormModal.tsx`

  Adapter ensuite les tests qui utilisent `roles: ['RESPO']`. Leur rôle n'est que décoratif : `missions`, `reservations`, `bugReport` et `licenseCheck`. Remplacer `RESPO` par un rôle équivalent, comme le prévoit D1.
- [x] `src/app/api/expenses/route.ts` : 403 si l'utilisateur est PRESIDENT de l'UL active ; la liste inclut les NDF `valide_respo` pour les RESPO et présidents de l'UL.
- [x] UI (`page.tsx`, `ExpenseDetailSidebar.tsx`, `utils.tsx`, bouton de création) :
  - badge « Validée par le responsable » ;
  - boutons selon l'étape et le rôle ;
  - libellé « Signer pour le responsable et valider » pour le président à l'étape `soumis` ;
  - bloc d'information RESPO ;
  - bouton de création masqué pour le président.
- [x] Tests :
  - intégration `expenses.test.ts` : chaque ligne de la matrice I/O ;
  - unitaires : `sealing` et `persist-seal` multi-révisions, `roles.test.ts`, géométrie (`signature-geometry.test.ts`) ;
  - composant : sidebar.
- [x] `CHANGELOG.md`, `package.json`, `package-lock.json` : version mineure. Dans `CLAUDE.md`, ajouter la ligne du script de migration, à exécuter avant le déploiement.

**Acceptance Criteria:**
- Given une NDF v2 validée par un RESPO puis par le président, when on télécharge le PDF, then `verify-signed-pdf.ts` rapporte 3 signatures valides, et le tampon n'apparaît que dans le widget président.
- Given une NDF validée en combiné par le président, when on lit `signatureRevisions`, then on trouve deux entrées (steps RESPO et président) du même signataire, et le PDF compte 3 signatures.
- Given une NDF v1 en `soumis` au moment du déploiement, when le président la valide, then elle suit l'ancien circuit sans erreur de scellement.

## Implementation Notes

- Pendant l'implémentation, origin/main a avancé de 3 commits (#144 Web Push remplace OneSignal, #145 notifications, #146 alertes). La branche a été rebasée sur `1dac237fd53e3be20ea21e4d10615185d5800fc6` : c'est la base de diff à utiliser pour la revue (`baseline_commit` en est un ancêtre).
- `src/lib/push.ts` : `RESPO` n'est plus un alias de PRESIDENT+CADRE ; les appelants historiques (trips, checkin, réservations véhicule, incidents) nomment désormais PRESIDENT et CADRE explicitement, sans changement de destinataires.
- Nouveau module pur `src/lib/expenses/workflow.ts` (étape, droits de signature, visibilité). Rectangle `president` mesuré par `scripts/measure-signature-rects.ts`.
- Garde UL active ajoutée sur validation/refus (hors super admin) ; la soumission d'un brouillon est aussi refusée à un président.
- Le test hérité de main « le valideur ne se notifie pas lui-même » attend désormais 403 (D2).
- Version 5.30.0 ; commit local `61b912d` (non poussé).

## Spec Change Log

## Review Triage Log

Passe 1 (base de diff `1dac237`) :

| # | Source | Constat | Verdict | Route / preuve |
|---|---|---|---|---|
| 1 | edge | RESPO+TRESORIER : la branche `isRespo` (route.ts:121) précède `isTresorier` (l.139), la file « en attente de paiement » disparaît | medium | patch — ordre des branches vérifié |
| 2 | edge+blind | `ulId` NULL : `checkSigningRights` et `canViewExpense` comparent sans le repli `'ul-paris-18'` utilisé partout ailleurs → 403 sur d'anciennes notes | medium | patch — colonne nullable (setup-dev), repli présent dans le reste de la route |
| 3 | edge | Tampon illisible par sharp → 500 sur toute validation président de l'UL | medium | patch — `compressStampImage` renvoie l'entrée brute en cas d'échec, donc un tampon non image peut être stocké |
| 4 | edge | Signature combinée : la révision RESPO journalise une clé R2 jamais écrite | low | patch — `persistSealed` n'écrit que `last.key` ; correction directe |
| 5 | edge | Mise à jour optimiste après signature combinée : bloc « validée par le responsable » absent jusqu'au rechargement | low | patch — correction directe dans page.tsx |
| 6 | edge+blind+gap | `backfill-signed-pdfs.ts` pose désormais 4 champs, perd le tampon (forSealing) et ignore le circuit v2 | medium | patch — le script étale `SIGNATURE_FIELDS` et appelle `forSealing` |
| 7 | blind | Avertissement de migration sous-estimé : la liste et le détail répondent aussi 500 sans les colonnes | low | patch (en-tête du script) + defer (ligne CLAUDE.md, fichier de contexte agent) |
| 8 | blind | Détenteurs hérités du rôle RESPO en prod non vérifiés avant `--apply` | medium | patch — le dry-run doit les lister |
| 9 | blind+gap | Pas d'accès Drive aux justificatifs pour le RESPO (`driveAuth.canAccessDriveFolder`) | medium | patch — règle divergente de `canViewExpense`, vérifiée |
| 10 | blind+gap | Statistiques et CSV ignorent `valide_respo` (total en attente, libellés) | medium | patch — `stats-expenses.ts:266`, `csv/route.ts:80` |
| 11 | blind | Refus non notifié au RESPO ni au président | false | rejeté — l'intention n'exige que la notification du demandeur, comportement inchangé |
| 12 | blind | AGENTS.md et commentaires décrivent encore l'ancien RESPO | low | defer — fichiers de contexte agent |
| 13 | blind | Couleurs codées en dur (dark mode) | false | rejeté — les badges existants de `utils.tsx` utilisent la même convention rgba/hex |
| 14 | blind+gap | Pas de test composant pour `ExpensesTable` ni pour le bouton de création masqué | medium | patch — règle de tests de CLAUDE.md |
| 15 | blind | CHANGELOG : ligne vide manquante avant `## [5.29.0]` | low | patch |
| 16 | blind | Id du rôle RESPO aléatoire (migration, setup-dev) vs `role-respo` (preview, auto-seed `role-<lower>`) | low | patch — correction directe |
| 17 | blind | `businessDate` nul sur le chemin direct | false | rejeté — comportement préexistant (`sealStep2` lisait déjà `validatedAt` avant persistance) |
| 18 | gap | Destinataires des alertes trips/checkin (PRESIDENT+CADRE) non vérifiés par les tests | medium | patch (pré-vérifié) |
| 19 | gap | Aucun test RESPO → 403 sur les routes de réservation purgées | medium | patch (pré-vérifié) |

## Design Notes

**Versionnage :** `workflowVersion` (1 pour l'ancien circuit, 2 pour le nouveau) évite de deviner la disposition des champs à partir du PDF. Il est écrit au scellement #1.

**Numérotation :**
- Champs : `Signature1` demandeur, `Signature2` RESPO (colonne « Le responsable »), `Signature3` payeur (invisible, inchangé), `Signature4` président (colonne tampon). Ajouter `Signature4` en dernier conserve les noms et l'ordre des trois champs existants.
- Steps du journal : 1 demandeur, 2 RESPO, 3 payeur, 4 président.

**Apparence président :** une seule image PNG, composée côté serveur à la taille du widget : le tampon en fond, la signature au premier plan.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: toute la suite passe
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- Ouvrir dans Acrobat un PDF v2 finalisé : 3 signatures valides, et le tampon et la signature du président dans la colonne tampon.

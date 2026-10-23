---
title: 'Validation des papiers cloisonnée aux membres de l''UL et mise à jour des AGENTS.md sur les papiers'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_commit: '4619cc21c10a67ccb8634245e4b9b32731e7f2ad'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `PATCH /api/users/[email]/validate-papers` permet à un gestionnaire de valider les papiers de n'importe quel utilisateur, y compris d'un membre d'une autre UL seulement. Plusieurs AGENTS.md décrivent encore le contrôle des papiers comme réservé aux chauffeurs.

**Approach:**
- La validation des papiers est limitée aux utilisateurs membres de l'UL active du gestionnaire, et aux comptes sans UL.
- Le reste de la gestion des utilisateurs ne change pas.
- Les AGENTS.md obsolètes sont corrigés.

## Boundaries & Constraints

**Always:**
- **Membre de l'UL** : utilisateur qui a une ligne `UserUL` pour l'UL active de l'acteur, de rattachement ou secondaire.
- Hors SUPER_ADMIN, `validate-papers` répond **404** si la cible a au moins une `UserUL` et aucune dans l'UL active de l'acteur. Une session sans UL (absente ou `'default'`) est refusée de même, sauf si la cible n'a aucune UL.
- Une cible sans aucune `UserUL` reste validable par tout gestionnaire, comme aujourd'hui.
- Les garde-fous existants restent en place : l'auto-validation est refusée (403) et un rôle insuffisant reçoit 403.

**Never — décisions de l'utilisateur (2026-10-23) :**
- Ne pas filtrer `GET /api/users` : la liste entière reste visible des gestionnaires, comme aujourd'hui.
- Ne pas modifier `GET`/`PATCH`/`PUT /api/users/[email]/ul` ni `PATCH`/`DELETE /api/users/[email]`. Un admin peut toujours :
  - fixer l'UL de rattachement d'une personne qui n'en a pas ;
  - lui ajouter des droits pour son UL.
- Ne pas modifier les droits de SUPER_ADMIN.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Membre de l'UL | Gestionnaire de A valide un membre de A (rattachement) | Autorisé | N/A |
| Membre secondaire | Cible rattachée à B, secondaire dans A ; gestionnaire de A | Autorisé (validation globale) | N/A |
| Autre UL | Cible membre de B seulement ; gestionnaire de A | Refusé, rien n'est écrit | 404 |
| Compte sans UL | Cible sans aucune `UserUL` ; gestionnaire de A | Autorisé, comme aujourd'hui | N/A |
| Session sans UL | Gestionnaire avec ulId `'default'`, cible membre d'une UL | Refusé | 404 |
| Super admin | SUPER_ADMIN, n'importe quelle cible | Autorisé | N/A |
| Auto-validation | L'acteur valide ses propres papiers | Refusé, comme aujourd'hui | 403 |

</frozen-after-approval>

## Code Map

- `src/app/api/users/[email]/validate-papers/route.ts:20-72` : garde actuelle `canAccessAdminPanel` (l.29) et anti auto-validation (l.38). Le paramètre `email` est en réalité l'id utilisateur (l.34). Ajouter la garde de membre après l'auto-validation et avant l'UPDATE, avec une seule requête : existe-t-il une `UserUL` pour cette cible, et en existe-t-il une pour `session.user.ulId` ?
- Si le motif peut resservir, ajouter un helper dans `src/lib/apiAuth.ts`, à côté d'`isOutsideUl` (l.40) ; sinon, la logique reste locale à la route.
- Tests : `src/__tests__/integration/licenseCheck.test.ts`. `respoSession` (CADRE sans `ulId`, l.42) sert au cas validate-papers de la l.264 : lui donner `ulId: 'ul-paris-18'` et une `UserUL` à la cible. Un test par ligne de la matrice.
- AGENTS.md à corriger :
  - `src/app/api/me/AGENTS.md:7,10,15` : papiers « réservés aux chauffeurs » ; ils concernent désormais tout compte qui peut emprunter (`canBorrowVehicles`, `src/lib/licenseStatus.ts`).
  - `src/app/api/users/[email]/validate-papers/AGENTS.md:7,12` : même correction, et décrire la nouvelle garde de membre.
  - `src/app/api/users/AGENTS.md:28` : à vérifier.
  - `src/app/users/AGENTS.md:22` : affirme que président et cadre ne voient que les membres de leur UL, ce qui est faux. Écrire qu'ils voient la liste complète.
  - `src/app/api/vehicles/[id]/checklist/AGENTS.md:17` et `src/app/api/trips/[id]/refresh-renault/AGENTS.md:18` : « (Cross-UL ( » → minuscule.
- `_bmad-output/implementation-artifacts/deferred-work.md` : marquer résolues les deux dernières entrées. Préciser que la liste complète et la gestion des UL restent ouvertes par décision de l'utilisateur.
- `CHANGELOG.md` : compléter la section 🔒 Sécurité de la 5.31.0.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/api/users/[email]/validate-papers/route.ts` : ajouter la garde de membre (plus un helper éventuel), avec un test d'intégration par ligne de la matrice.
- [x] `licenseCheck.test.ts` : compléter la session et les données de la cible ; ne pas affaiblir les assertions.
- [x] Les AGENTS.md, `deferred-work.md` et `CHANGELOG.md` du Code Map.

**Acceptance Criteria:**
- Given un gestionnaire de l'UL A, when il tente de valider les papiers d'un membre de l'UL B seulement, then il reçoit 404 et rien n'est écrit. La page Utilisateurs, elle, liste toujours tous les comptes.

## Implementation Notes

- **Logique gardée dans la route, sans helper.** Le motif « cible avec UL mais aucune dans l'UL active » n'a qu'un appelant ; `isOutsideUl` compare deux UL scalaires et ne couvre pas « cible sans UL → autorisé ». Une seule requête (`EXISTS` sur la cible, `EXISTS` sur la cible dans l'UL active), placée après l'anti auto-validation et la 404 d'utilisateur inconnu, avant l'UPDATE. L'auto-validation reste donc un 403, même par un acteur d'une autre UL.
- **Normalisation de `'default'`.** Un `ulId` absent ou `'default'` est remplacé par `NULL` avant la requête : `ulId = NULL` ne matche aucune ligne, si bien qu'une session sans UL ne valide que les comptes sans UL, sans branche dédiée.
- **Message de la 404.** Statut 404 conservé, mais message explicite « Ce membre n'appartient pas à votre unité locale » : la page Utilisateurs affiche la cible, un « Utilisateur introuvable » passerait pour un bug.
- **`src/app/api/users/AGENTS.md:28` vérifiée.** La ligne (rôle chauffeur → invalidation si jamais validé) est exacte ; seule une précision a été ajoutée : le contrôle des papiers vise tout compte qui emprunte. La ligne POST (l.22) était fausse — `POST` remet toujours les papiers à 0 — et a été corrigée.
- **Limite du rattachement secondaire.** Un ADMIN peut rattacher la cible à son UL en membre secondaire (`PATCH /api/users/[email]/ul`), puis valider ses papiers. C'est voulu (décision de l'utilisateur, routes `ul` non modifiées) ; PRESIDENT et CADRE, qui n'ont pas cet accès en écriture, ne le peuvent pas.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | blind, edge | Contournement en deux appels : un ADMIN ajoute la cible comme membre secondaire de son UL, puis valide ses papiers | false | Voulu par l'utilisateur (« il peut aussi ajouter des droits pour son UL sur cette personne ») : la cible devient alors membre de l'UL, et la validation est légitime. Limite documentée. → patch (doc) |
| 2 | blind, edge | `src/app/api/users/AGENTS.md` affirme à tort que l'attribution des UL et des rôles n'est pas cloisonnée | medium | `ul/route.ts:79-96,175-194` et `[email]/route.ts:54-64,206-216` limitent déjà l'admin local à son UL. Erreur introduite par ce diff. → patch |
| 2b | edge | `src/app/users/AGENTS.md` dit que seule la validation des papiers est cloisonnée | medium | Même cause que #2. → patch |
| 3 | verif, blind, edge | La liste est complète, mais valider un membre d'une autre UL affiche le toast « Utilisateur introuvable » | medium | `page.tsx:144` relaie le corps de la 404. → patch : 404 conservé (spec gelée), message explicite « Ce membre n'appartient pas à votre unité locale » |
| 4 | blind | Le motif « indiscernable d'un id inconnu » est faux, puisque la liste montre tous les comptes | low | Même cause que #3 ; retirer cette affirmation. → patch |
| 5 | blind | La formulation du CHANGELOG (« apparaît comme introuvable ») contredit l'écran | low | Correction directe. → patch |
| 6 | verif, blind | Aucun test d'ADMIN ou de PRESIDENT hors UL | medium | Tous les cas 12a à 12g utilisent CADRE ; un `isAdminOrAbove` passerait inaperçu. → patch |
| 7 | blind | Le corps de la 404 n'est pas comparé à celui d'un id inconnu | false | Sans objet après #3 (message distinct voulu). |
| 8 | blind | Le titre de 12h promet plus que le test ne vérifie ; il manque l'auto-validation par un acteur d'une autre UL | low | Ajout direct. → patch |
| 9 | blind | Implementation Notes vides | low | → patch (notes tenues par l'agent) |
| 10 | edge | Course (TOCTOU) entre le SELECT de membre et l'UPDATE | low | Fenêtre étroite ; la correction ajoute de la complexité SQL. Rejeté. |

## Verification

**Commands:**
- `npm run lint` : 0 erreur, 0 avertissement.
- `npm run test` : suite verte.

---
title: 'Sélecteurs de personnes : barre de recherche et filtre « Mon UL »'
type: 'feature'
created: '2026-11-16'
status: 'done'
baseline_commit: '76e212d582e7f3c53407fa380efcf0d1b3bdcd1a'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Plusieurs champs de l'appli où l'on choisit une personne (2ème conducteur, chauffeur d'une réservation ou d'un rapport de mission, responsable de désinfection) n'ont pas de recherche (liste déroulante native, datalist) ou listent les chauffeurs de toutes les UL sans moyen de se limiter à la sienne : trouver un nom est laborieux.

**Approach:** Tous ces champs passent par le composant commun `UserCombobox` (qui a déjà une recherche par nom/email) et ce composant gagne un sélecteur « Toutes les UL / Mon UL » qui ne garde que les personnes rattachées (`UserUL`, principal ou secondaire) à l'UL active de la personne connectée (`session.user.ulId`). Les routes qui alimentent ces listes renvoient pour chaque personne la liste de ses UL (`ulIds`).

## Boundaries & Constraints

**Always:** le filtre est purement côté client et ne retire jamais des droits ni des personnes que le serveur accepte déjà ; la valeur sélectionnée reste affichée dans le déclencheur même si le filtre la masque de la liste ; le sélecteur n'apparaît que si l'UL active est connue (≠ `default`) ; champs exposés limités à `id, name, email, ulIds` (+ `roles` de conduite pour les missions) ; tests pour tout ce qui change.

**Décisions :** filtre sur « Toutes les UL » à chaque ouverture (comportement actuel conservé, « Mon UL » est un raccourci) ; le filtre « Chauffeurs » de la page Statistiques (`MultiSelectDropdown`) est hors périmètre.

**Never:** pas de migration ni de nouvelle colonne ; pas de changement de population côté serveur (qui est proposé reste identique) ; pas de modification de la table d'administration des utilisateurs (`UsersTab`, déjà dotée d'une recherche) ; pas de nouvelle route.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recherche | saisie « dup » | seules les personnes dont nom ou email contient « dup » (insensible à la casse) | N/A |
| Filtre Mon UL | UL active `ul-a`, filtre « Mon UL » | seules les personnes dont `ulIds` contient `ul-a` ; recherche cumulée | N/A |
| Aucun résultat | filtre + recherche ne donnent rien | message « Aucune personne trouvée » | N/A |
| UL inconnue | session sans UL ou `default` | sélecteur absent, liste complète | N/A |
| Valeur masquée | valeur choisie hors UL, filtre « Mon UL » | déclencheur garde le nom ; option masquée de la liste | N/A |
| Données sans `ulIds` | ancienne réponse / champ absent | personne traitée comme hors UL quand le filtre est actif | N/A |

</frozen-after-approval>

## Code Map

- `src/components/ui/UserCombobox.tsx` (+ `.module.css`) -- composant commun ; recherche nom/email déjà là (`filteredUsers`) ; ajouter prop `users[].ulIds?`, sélecteur segmenté sous la recherche, `useSession()` pour `ulId`, état vide. Props existantes inchangées (`excludeEmail`, `hideDefault`, `defaultLabel`, `UNASSIGNED`).
- Consommateurs existants (rien à changer hormis le type des users) : `src/app/qr/[token]/CheckOutForm.tsx`, `src/app/qr/[token]/CheckInForm.tsx`, `src/components/vehicle/modals/{DesinfPreCheckinModal,CheckInModal,CheckOutModal,EditCheckOutModal,ReservationFormModal}.tsx`, `src/components/vehicle/ReservationBlock.tsx`.
- `src/app/vehicles/[id]/ActiveTripBanner.tsx:121-137` -- `<input list>` + `<datalist>` par email → remplacer par `UserCombobox` (id → email via `users`).
- `src/components/missions/steps/Step2Vehicle.tsx:129-144` -- `<select>` chauffeur → `UserCombobox` ; garder l'option « Moi (…) », l'option valeur enregistrée (`storedDriver`) et « — Non renseigné — ».
- `src/lib/eligibleDrivers.ts` -- `listEligibleDrivers`, `listMissionDrivers` : ajouter `ulIds` (sous-requête `GROUP_CONCAT(DISTINCT ulId)` sur `"UserUL"`), interfaces `EligibleDriver`/`MissionDriver`.
- `src/lib/ulMembers.ts` -- `listActiveUlMembers` : ajouter `ulIds`.
- `src/app/api/users/route.ts` -- branche admin (requêtes l.60-115) et `listMembersOfUl` (l.158) : ajouter `ulIds`. Ne pas toucher aux autres champs ni à l'autorisation.
- Session : `session.user.ulId` (`src/auth.ts:162`), `SessionProvider` dans `src/app/layout.tsx` (couvre aussi `/qr/*`).
- Tests : `src/__tests__/components/UserCombobox.test.tsx` (étendre), tests de routes/lib existants pour `eligibleDrivers`, `ulMembers`, `api/users` (étendre assertions de forme).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/eligibleDrivers.ts`, `src/lib/ulMembers.ts` -- ajouter `ulIds: string[]` aux lignes renvoyées -- donnée du filtre.
- [x] `src/app/api/users/route.ts` -- ajouter `ulIds` aux deux branches GET -- idem pour réservations/édition de prise.
- [x] `src/components/ui/UserCombobox.tsx` + CSS -- sélecteur « Toutes les UL / Mon UL » (boutons segmentés `aria-pressed`), filtre cumulé à la recherche, message vide, sélecteur masqué sans UL active -- cœur de la feature.
- [x] `src/app/vehicles/[id]/ActiveTripBanner.tsx` -- datalist → `UserCombobox` -- homogénéité.
- [x] `src/components/missions/steps/Step2Vehicle.tsx` -- `<select>` chauffeur → `UserCombobox` -- homogénéité.
- [x] Tests (composant, libs, route users) ; `CHANGELOG.md`, `package.json`/`package-lock.json` (v5.54.0).

**Acceptance Criteria:**
- Given une personne connectée dans l'UL A, when elle ouvre n'importe quel sélecteur de personne et choisit « Mon UL », then seules les personnes rattachées à l'UL A restent, et la recherche filtre parmi elles.
- Given le rapport de mission ou l'encadré du trajet en cours, when on choisit un chauffeur / 2ème conducteur, then le champ offre la même recherche et le même sélecteur que les autres.
- Given `npm run lint` et `npm run test`, then 0 erreur, 0 avertissement, tous les tests passent.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | `USER_UL_IDS_SQL` compte une UL où la personne est INACTIF/GUEST (`UserUL.roles`) | medium | Sous-requête sans filtre sur `uu.roles` ; « Mon UL » garde un membre inactif de l'UL. patch |
| 2 | « Moi » absent sous « Mon UL » si l'utilisateur n'est pas dans `drivers` (Step2Vehicle) | medium | `ulIds: me?.ulIds` indéfini pour un non-chauffeur alors que l'option est montrée hors VPSP. patch |
| 3 | Valeur enregistrée (`storedDriver`) masquée sous « Mon UL » | false | Conforme à la ligne « Valeur masquée » de la matrice : le déclencheur garde le nom. |
| 4 | Libellé « Chauffeur » plus relié au champ (htmlFor retiré) | medium | Régression d'accessibilité introduite par la conversion. patch (prop `id` optionnelle sur le déclencheur) |
| 5 | Structure ARIA : `role="listbox"` contient champ, groupe et message | low | Correction directe : déplacer `role="listbox"` sur la liste. patch |
| 6 | « Aucune personne trouvée » pendant le chargement et sous l'option par défaut | low | Condition sur `filteredUsers.length` seule. Correction directe : n'afficher que sur recherche ou filtre actif. patch |
| 7 | Formulaire 2ème conducteur d'ActiveTripBanner non testé | high (gap vérifié) | Aucun test n'ouvre le formulaire ; un mauvais câblage passerait. patch |
| 8 | Pas de test Step2Vehicle « Mon UL » avec « Moi » | low | Couvert avec le n°2. patch |
| 9 | AGENTS.md (UserCombobox, routes drivers) non mis à jour | low | Fichiers de contexte agent. defer |
| 10 | Sous-requête corrélée par ligne sans index | false | `UserUL` a `PRIMARY KEY (userId, ulId)` : la sous-requête utilise l'index. |
| 11 | Filtre réinitialisé à chaque ouverture | false | Décision figée : « Toutes les UL » à chaque ouverture. |
| 12 | CHANGELOG ne dit pas que le sélecteur exige une UL active | low | Correction de texte directe. patch |
| 13 | `ulIds` optionnel côté client, requis côté serveur | low | Aucun dommage nommé hors n°2 ; rejet (correction non triviale, rare). |
| 14 | `ulIds` de toutes les UL exposés aux appelants non admin (routes QR/drivers) | low | Ids d'UL internes à l'organisation, pas de nom ni contact ; un booléen serveur changerait le contrat de la spec. Rejet. |
| 15 | « Mon UL » relatif à l'UL de la session et non à celle du véhicule/QR | false | Conforme à l'intent : « UL de la personne qui effectue la recherche ». |

## Design Notes

`ulIds` plutôt que `homeUlId` : un bénévole rattaché à titre secondaire à l'UL fait bien partie de « l'UL de la personne qui recherche ». L'UL de référence est l'UL **active** de la session (celle choisie dans le sélecteur d'UL de la barre), pas toutes les UL de l'utilisateur.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreurs, 0 warnings
- `npm run test` -- expected: tous verts

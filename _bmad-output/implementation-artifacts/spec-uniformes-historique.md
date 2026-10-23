---
title: 'Uniformes — historique des emprunts et des rendus, rôle « Responsable uniforme »'
type: 'feature'
created: '2026-10-23'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'ac1a578657a5704810d6f2111c48b998a32df3c9'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Le module Uniformes n'a pas de vrai historique des mouvements. L'onglet « Emprunts » propose un filtre « Tout l'historique » : un tableau par pièce, limité à 500 lignes et ouvert aux cadres et aux présidents. Aucun rôle n'est dédié à la gestion des uniformes.

**Approche :** Ajouter un onglet « Historique » : un journal chronologique des emprunts, des rendus et des lavages. Il est réservé aux admins et au nouveau rôle `RESP_UNIFORME` (« Responsable uniforme »). Dans son UL, ce rôle a sur les uniformes tous les droits d'un admin, et aucun autre droit.

## Décisions (réponses humaines, 2026-10-23)

- **D1 — Onglet « Emprunts » :** le filtre « Tout l'historique » est retiré. L'onglet ne montre plus que les emprunts en cours. Il reste visible par les cadres, les présidents et les admins, et s'ouvre aussi au responsable uniforme.
- **D2 — Droits du responsable uniforme :** dans son UL, les mêmes droits qu'un admin sur les uniformes : Historique, Emprunts, Gestion (catalogue, tailles, quantités, archivage) et QR. C'est le même modèle que RESP_VEHICULE.
- **D3 — Format :** un journal d'événements, du plus récent au plus ancien. Un **emprunt** est un panier validé et ses pièces. Un **rendu** est une pièce, ou les pièces d'un même « Tout rendre » regroupées ; il porte l'état propre ou sale et le commentaire. Un **lavage** est une pièce et la personne qui l'a lavée. Le journal propose un filtre par type, une recherche par emprunteur ou par pièce, et un bouton « Charger plus » (pas de limite fixe).

## Boundaries & Constraints

**Always :**
- Ajouter le prédicat `canManageUniforms` dans `roles.ts`, enveloppé dans `denyWhenInactive`. Il vaut `isAdminOrAbove || RESP_UNIFORME`. Il garde l'historique, la Gestion (routes `items*`) et donne en plus l'accès à l'onglet Emprunts et au QR. Le cloisonnement reste `isOutsideUl` / UL de session, comme pour l'admin.
- Historique : seulement les événements des pièces de l'UL de session (`UniformItem.ulId`), quelle que soit l'UL de l'emprunteur. Les articles et tailles archivés restent inclus.
- Le journal est reconstruit à partir des colonnes existantes (`UniformLoanBatch.createdAt`, `UniformLoan.returnedAt/returnedClean/returnComment/washedAt/washedByName`). Aucun changement de schéma.
- Pagination par curseur (keyset) sur un ordre stable (date décroissante, puis identifiant d'événement) : 50 événements par page, plus un indicateur `hasMore`. La recherche (`LIKE` échappé, insensible à la casse) porte sur le nom ou l'e-mail de l'emprunteur, l'article, la taille et le nom de la personne qui a lavé.
- Menu Uniformes réglé sur « Admin uniquement » : le responsable uniforme y accède aussi (Navbar et page).
- Le nouveau rôle est déclaré partout où RESP_VEHICULE l'est (seeds, comptes dev et preview, démo, légende, docs). L'identifiant `Role` est `role-resp_uniforme`.
- Tests : prédicat (matrice et INACTIF), nouvelle route (401, 403, 400, cas nominal, cloisonnement UL, pagination, recherche), composant historique, onglets de la page.

**Never :**
- Ajouter RESP_UNIFORME à `isAdminOrAbove`, à `canAccessAdminPanel` ou à `canSeeMenu` de façon générique (autres menus).
- Donner à RESP_UNIFORME des droits hors uniformes (véhicules, frais, stock, missions, utilisateurs, réglages).
- Retirer aux cadres ou aux présidents l'onglet Emprunts (en cours) ou le QR Uniformes.
- Permettre à un tiers de rendre à la place de l'emprunteur. Pas de notifications. Pas de migration de masse : le rôle est attribué à la main.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Historique admin | ADMIN UL 18, `GET /api/uniforms/history` | 200, événements des pièces UL 18, les plus récents en premier | N/A |
| Resp. uniforme | `['RESP_UNIFORME']` UL 18 | 200 historique ; Gestion, Emprunts et QR autorisés | N/A |
| Cadre / président | `['CADRE']` ou `['PRESIDENT']` | Historique 403, onglet masqué ; Emprunts (en cours) et QR conservés | 403 |
| Inactif | `['RESP_UNIFORME','INACTIF']` | Tout est refusé | 403 |
| Hors uniformes | RESP_UNIFORME sur `/api/users`, véhicules, inventaire | Refusé comme avant | 403 |
| Autre UL | RESP_UNIFORME UL 18, `PATCH` sur un article UL 4 | Refusé | 403 (`isOutsideUl`) |
| Tout rendre | « Tout rendre » de 3 pièces (même `returnedAt`) | Un seul événement « rendu » de 3 pièces | N/A |
| Lavage | Pièce sale lavée par X | Événement « lavage » avec le nom de X | N/A |
| Pagination | 120 événements | Page 1 : 50, `hasMore: true`, curseur ; page 3 : 20, `hasMore: false` | Curseur invalide → 400 |
| Recherche / type | `q=polo&type=return` | Seuls les rendus dont une pièce ou l'emprunteur correspond à « polo » | `type` inconnu → 400 |
| Emprunts en cours | `GET /api/uniforms/loans/ul?status=all` | Le paramètre est ignoré : seuls les emprunts en cours sont renvoyés | N/A |

</frozen-after-approval>

## Code Map

**Rôle**
- `src/lib/roles.ts` : `RESP_UNIFORME` dans `ROLES`, `MANAGEABLE_ROLES` (après RESP_VEHICULE) et `ROLE_LABELS`. Ajouter `canManageUniforms`. Ne pas toucher `isAdminOrAbove` ni `canAccessAdminPanel`.
- Points d'enregistrement (reprendre les endroits de RESP_VEHICULE) :
  - `src/auth.ts:43` `DEV_USERS` (`respuniforme@dev.local`)
  - `src/app/login/page.tsx:16`
  - `src/lib/preview-accounts.ts:60`
  - `scripts/seed-preview-users.ts:58-76` et `.sql:48`
  - `scripts/setup-dev.ts:161-169` et `:960`
  - `scripts/ensure-system-roles.ts:20`
  - `src/__tests__/integration/setup.ts:762` `seedRoles`
  - `src/lib/demo/fetchInterceptor.ts:161`
  - `src/components/users/RoleLegend.tsx:43` (nouvelle entrée)
  - `CLAUDE.md:62`, `AGENTS.md:29`, `src/components/users/AGENTS.md`
- La ligne `Role` est créée par l'auto-seed `src/app/api/users/route.ts:59` et par `ensure-system-roles`. Aucun script de migration.

**Gardes API**
- `src/app/api/uniforms/items/route.ts:39`, `items/[id]/route.ts:26,53`, `items/[id]/sizes/route.ts:20`, `sizes/[sizeId]/route.ts:27,54` : `isAdminOrAbove` → `canManageUniforms`. Garder `isOutsideUl`.
- `src/app/api/uniforms/qr-token/route.ts:35,60` et `loans/ul/route.ts:21` : `canAccessAdminPanel(r) || canManageUniforms(r)`.
- `loans/ul/route.ts` + `listUlLoans` (`src/lib/uniforms/loans.ts:285`) : supprimer le paramètre `status` (toujours en cours). Garder `truncated`.

**Historique (nouveau)**
- `src/lib/uniforms/history.ts` : `listUlHistory(ulId, { type, q, cursor, limit })` → `{ events, nextCursor, hasMore }`. La requête est un `UNION ALL` de trois sources :
  - emprunt : par lot `UniformLoanBatch`, `b.ulId = ?`, avec les pièces et la `source` app/QR ;
  - rendu : `GROUP BY batchId, returnedAt, returnedClean, returnComment` ;
  - lavage : un par pièce `washedAt`.
  Le filtrage UL passe par la jointure `UniformItem.ulId`. Le modèle de mapping de lignes est `listUlLoans`.
- `src/lib/uniforms/schemas.ts` : schéma Zod de la requête (`type` ∈ all/loan/return/wash, `q` ≤ 100 caractères, `cursor` opaque).
- `src/app/api/uniforms/history/route.ts` : `GET`, garde `canManageUniforms`, UL via `activeUlId` (UL absente → liste vide), même gestion d'erreur que `loans/ul/route.ts`. Invoquer le skill `/api-route-template`.
- `src/components/uniforms/UniformHistory.tsx` : filtres de type (`filters-bar`), recherche (debounce), liste d'événements, « Charger plus ». Écoute `UNIFORMS_CHANGED_EVENT` et utilise `formatDateTime` (`events.ts`). Styles dans `uniforms.module.css`. Invoquer le skill `/component-templates`.

**UI**
- `src/components/uniforms/UniformTabs.tsx` : ajouter `history: 'Historique'`.
- `src/app/uniforms/page.tsx:38-40,86` :
  - `loans` si `canAccessAdminPanel || canManageUniforms` ;
  - `manage` et `history` si `canManageUniforms` ;
  - `canRegenerateQr` = `canAccessAdminPanel || canManageUniforms` ;
  - `canAccess` : `admin_only` accepte aussi `canManageUniforms`.
- `src/components/Navbar.tsx:143` : même exception pour `admin_only`.
- `src/components/uniforms/UniformLoansTable.tsx` : retirer le sélecteur En cours / Tout l'historique et appeler `/api/uniforms/loans/ul`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/roles.ts` + `src/__tests__/unit/roles.test.ts` -- rôle, libellé, `canManageUniforms` -- le test d'énumération impose l'enveloppe INACTIF
- [x] Points d'enregistrement du rôle (liste du Code Map) -- comptes dev et preview, seeds, démo, légende, docs
- [x] Routes `items*`, `qr-token`, `loans/ul` + `loans.ts` -- gardes et suppression de `status` -- tests d'intégration : cas RESP_UNIFORME autorisé, autre UL 403, CADRE toujours autorisé sur `loans/ul` et `qr-token`, CADRE 403 sur `items`
- [x] `src/lib/uniforms/history.ts`, `schemas.ts`, `src/app/api/uniforms/history/route.ts` -- journal paginé -- tests unitaires et d'intégration de la matrice I/O (regroupement « Tout rendre », lavage, pagination, recherche, type, UL)
- [x] `UniformHistory.tsx`, `UniformTabs.tsx`, `page.tsx`, `Navbar.tsx`, `UniformLoansTable.tsx` -- UI -- tests RTL : `UniformHistory` (rendu, filtres, Charger plus, erreur), onglets par rôle (`UniformsPage.test.tsx`), `UniformLoansTable` sans le filtre
- [x] `CHANGELOG.md` (français, orienté utilisateur), `package.json` + `package-lock.json` -- version 5.34.0

**Acceptance Criteria:**
- Given un compte RESP_UNIFORME sans autre rôle, when il ouvre /uniforms, then il voit les onglets Emprunter, À laver, Emprunts, Gestion et Historique, et aucun autre menu d'administration.
- Given un CADRE, when il ouvre /uniforms, then il voit l'onglet Emprunts (en cours seulement, sans « Tout l'historique »), mais pas les onglets Historique ni Gestion.
- Given un admin dans l'onglet Historique, when il clique « Charger plus », then les 50 événements suivants s'ajoutent sans doublon.

## Implementation Notes

- Menu « Admin uniquement » : l'exception passe par `canSeeUniformsMenu` (`src/lib/menuVisibility.ts`), utilisé par la Navbar et la page. `canSeeMenu` générique est inchangé.
- Vérification (orchestrateur) : correction des seeds preview. La ligne `User` du responsable uniforme manquait dans `seed-preview-users.ts`, et le `.sql` insérait un tuple `UserUL` dans l'INSERT `User` (nombre de colonnes erroné). Ajout du test « hors uniformes » (`/api/users`, PATCH véhicule, ajustement d'inventaire → 403) pour couvrir la ligne de matrice correspondante.
- Vérification : `npm run lint` propre, `npx tsc --noEmit` propre, `npm run test` 304 fichiers / 3 900 tests verts.

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | verif, blind | Archivage (DELETE article/taille) par RESP_UNIFORME non testé, ni le 403 pour une autre UL | medium | Grep : `deleteItem`/`deleteSize` testés seulement avec ADMIN. → patch (test) |
| 2 | verif, blind | Régénération du QR (`DELETE qr-token`, `canRegenerateQr` de la page) par RESP_UNIFORME non testée | medium | `uniforms-qr.test.ts` : CHVL/CADRE/ADMIN seulement. → patch (test) |
| 3 | verif | Navbar : `canSeeUniformsMenu` en `admin_only` non testé | medium | `Navbar.test.tsx` ne teste pas « Uniformes ». → patch (test) |
| 4 | verif, blind, edge | La clé d'un rendu (`return:<lot>:<returnedAt>`) peut collisionner si l'état ou le commentaire diffère au même instant | low | Le GROUP BY porte aussi sur `returnedClean`/`returnComment`. Improbable, mais la correction est directe (`MIN(loanId)` dans la clé, unique par groupe). → patch |
| 5 | blind, edge | Au changement de filtre, l'ancienne liste reste affichée sans chargement ; « Charger plus » peut combiner l'ancien curseur et le nouveau filtre | medium | `reload` ne remet ni `loading`, ni `events`, ni `nextCursor` ; `loadMore` n'incrémente pas `requestId`. → patch |
| 6 | blind, edge | `UNIFORMS_CHANGED_EVENT` ramène la liste à la page 1 | low | Réel, mais rare (rendu de ses propres pièces pendant la consultation de l'historique) ; la correction ajoute de la logique de pagination. Rejeté. |
| 7 | blind | Chaque page reconstruit tout le journal (CTE complète, pas d'index de date) | low | Volume d'une UL limité (milliers de pièces au plus) ; un correctif (index, filtrage anticipé) dépasse une correction directe. Rejeté. |
| 8 | blind | Commentaires `qr-token/route.ts` et `UniformQRCodeModal.tsx:17` encore « `canAccessAdminPanel` seul » | low | Commentaires faux, correction directe. → patch |
| 9 | blind | Commentaire de `setup-dev.ts` : il cite une migration qui n'existe pas pour RESP_UNIFORME | low | Correction directe. → patch |
| 10 | blind, edge | `UniformLoansTable` : colonnes « Rendu le » et « Commentaire » toujours vides, branches mortes de `StateBadge` | low | L'endpoint ne renvoie plus que des emprunts en cours ; colonnes visibles et vides. Suppression directe. → patch |
| 11 | blind | La ligne de matrice « `status=all` ignoré » n'a pas de test | false | `GET()` ne prend plus de `Request` : le paramètre ne peut pas être lu. |
| 12 | blind, edge | Pas de test unitaire de `history.ts` (`decodeCursor`) ; chemins difficiles de `UniformHistory` non testés | medium | La tâche demandait des tests unitaires. → patch (test unitaire du curseur + test du changement de filtre pendant le chargement, avec le correctif #5) |
| 13 | blind | Le curseur n'est pas lié au filtre | low | Seul le cas #5 le provoque dans l'UI (corrigé) ; signer le curseur ajoute de la complexité. Rejeté. |
| 14 | blind | Aucune note de déploiement pour la ligne `Role` | false | `GET /api/users` crée la ligne à chaque ouverture de la liste des utilisateurs, là même où le rôle s'attribue. |
| 15 | blind | Boutons de filtre en `role="tab"` sans `tabpanel` | low | Motif déjà en place dans le module (`UniformTabs`, ancien `UniformLoansTable`). Rejeté. |
| 16 | blind | Le CHANGELOG ne dit pas que « Super admin uniquement » exclut le responsable | low | Cas de réglage rare. Rejeté. |
| 17 | edge | `res.ok` avec un corps illisible → `events` indéfini, plantage | low | Le serveur répond toujours en JSON ; la correction ajoute une garde. Rejeté. |
| 18 | edge | `LIKE` ne replie pas la casse des lettres accentuées | low | Limite SQLite déjà rejetée dans la spec Uniformes (#20) ; le correctif dépasse une correction directe. Rejeté. |
| 19 | edge | Un rendu avec `returnedClean` NULL s'affiche « Rendu sale » | false | `returnSchema` exige `returnedClean: z.boolean()` ; toutes les écritures de rendu le renseignent. |
| 20 | edge | `?type=` vide → 400 | low | Le client n'envoie jamais de valeur vide. Rejeté. |

## Design Notes

**Pas de table d'événements :** chaque mouvement est déjà horodaté sur `UniformLoan` (ou sur `UniformLoanBatch` pour l'emprunt). Une table dédiée dupliquerait ces données et exigerait une migration et une reprise de l'existant. Le journal est donc une vue calculée.

**Regroupement des rendus :** « Tout rendre » écrit le même `returnedAt` sur toutes les pièces d'un lot. Grouper sur `(batchId, returnedAt, returnedClean, returnComment)` reconstitue l'action. Deux rendus individuels gardent des horodatages distincts (ms ISO).

**Curseur :** il encode en base64url `{at, key}`, où `key` vaut `loan:<batchId>`, `return:<batchId>:<returnedAt>` ou `wash:<loanId>`. La condition est `(at < ? OR (at = ? AND key < ?))`, avec l'ordre `at DESC, key DESC`.

## Verification

**Commands:**
- `npm run lint` -- attendu : 0 erreur, 0 warning
- `npx tsc --noEmit` -- attendu : propre
- `npm run test` -- attendu : suite verte, nouveaux tests inclus

**Manual checks (if no CLI):**
- `npm run dev` : avec chvl@dev.local, emprunter 3 pièces, en rendre une sale puis « Tout rendre » le reste. Avec respuniforme@dev.local, marquer la pièce sale comme lavée, puis ouvrir Historique : on doit voir 4 événements (emprunt, rendu, rendu groupé de 2 pièces, lavage). La recherche « polo » filtre la liste. Avec cadre@dev.local, l'onglet Historique est absent.

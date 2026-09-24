---
title: 'Uniformes — emprunt et rendu de pièces d''uniforme par UL'
type: 'feature'
created: '2026-09-24'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '0de652d120ef1da1010752986e546ce81fbf110d'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Les UL n'ont aucun suivi des pièces d'uniforme prêtées aux bénévoles : ni catalogue (articles, tailles, quantités), ni trace de qui détient quoi, ni retour sur l'état des pièces rendues.

**Approche :** Nouveau module « Uniformes » (menu navbar `/uniforms`) : catalogue d'articles rattachés à une UL, déclinés en tailles avec une quantité ; un bénévole remplit un panier puis valide (depuis l'appli ou via un QR code d'UL qui contourne les rôles, comme les véhicules/stocks) ; un bandeau global liste ses emprunts en cours avec un bouton « Rendre » (commentaire libre + case lavé/sale) ; un onglet admin/cadre liste qui a emprunté quoi parmi les articles de l'UL courante.

## Décisions (réponses humaines)

- **Rendu :** les deux modes — « Rendre » sur chaque pièce individuellement, ET « Tout rendre » sur un emprunt validé (un panier), avec un commentaire + une case lavé/sale appliqués à toutes les pièces restantes de cet emprunt.
- **QR code :** un QR « Uniformes » par UL (colonne dédiée `UniteLocale.uniformQrToken`), affiché/imprimable depuis l'onglet Gestion.
- **Pièce rendue sale :** elle reste indisponible et apparaît dans une liste « À laver » ; n'importe quel compte actif (appli : `!isInactive` ; page QR : `isQrBlocked`) peut la marquer « lavée », ce qui la rend à nouveau disponible (trace : qui, quand).
- **Taille de spec :** spec conservée entière (pas de découpage).

## Boundaries & Constraints

**Always :**
- Chaque article (`UniformItem`) porte un `ulId` ; les tailles (`UniformSize`) appartiennent à un article et portent une quantité totale possédée. Un emprunt validé (`UniformLoanBatch`) contient une ligne `UniformLoan` par pièce. Disponible = quantité − pièces non rendues − pièces rendues sales non encore lavées (calculé, jamais stocké).
- Gestion du catalogue (créer/renommer/archiver article, ajouter/retirer taille, modifier quantité) : `isAdminOrAbove`, cloisonnée à l'UL de session (`isOutsideUl`).
- Onglet « Emprunts » (qui a emprunté quoi) : `canAccessAdminPanel`, filtré sur `UniformItem.ulId = session.user.ulId` — quel que soit l'UL de l'emprunteur (cadre UL 18 voit le secouriste UL 4 qui a emprunté des pièces UL 18).
- Emprunt via l'appli : tout compte `!isInactive` ; catalogue = articles de l'UL active. Emprunt via QR `/qr-uniforms/[token]` : `isQrBlocked` seulement, aucun filtre de rôle ni d'UL ; catalogue = UL du token.
- Validation du panier en une transaction : refus 409 si une taille n'a plus assez de disponible au moment de la validation (aucune ligne créée).
- Rendu (pièce ou emprunt entier) : uniquement par l'emprunteur lui-même, commentaire optionnel (≤ 1000 car.) + booléen `returnedClean` obligatoire ; propre → dispo immédiatement, sale → liste « À laver ».
- Liste « À laver » : pièces sales des articles de l'UL courante (appli) ou de l'UL du token (QR) ; action « Marquer lavée » par tout compte actif, idempotente (409 si déjà lavée).
- Retrait d'un article/taille = archivage (`archivedAt`), refusé (409) s'il reste des emprunts en cours dessus ; l'historique reste intact.
- Menu désactivable via `MenuSetting` (clé `uniforms`), comme `inventory`/`missions`.
- Toute nouvelle route/lib/composant à état livre ses tests (CLAUDE.md).

**Never :**
- Ne pas réutiliser `UniteLocale.qrToken` (il ouvre le rapport de mission) ; ne pas renvoyer un token QR dans une réponse de liste.
- Ne pas permettre à un tiers (y compris admin) de rendre à la place de l'emprunteur dans cette spec.
- Pas de notifications ni d'e-mails.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Emprunt appli | CHVL, panier 2×« Polo M » (dispo 3) | 201, 2 pièces en cours, bandeau affiché | N/A |
| Stock insuffisant | panier 4×« Polo M » (dispo 3) | 409, aucune ligne créée | message inline |
| QR sans rôle | `roles=[]`, token UL 18 | 200 catalogue UL 18, emprunt 201 | N/A |
| QR INACTIF / token inconnu | — | 403 « Compte inactif » / 404 « QR Code invalide » | N/A |
| Rendu propre | emprunteur, pièce, `{returnedClean:true}` | 200, dispo +1 | N/A |
| Rendu sale | emprunteur, `{comment, returnedClean:false}` | 200, pièce dans « À laver », dispo inchangée | N/A |
| Tout rendre | emprunt de 3 pièces dont 1 déjà rendue | 200, les 2 restantes rendues avec le même état | N/A |
| Marquer lavée | CHVL (ou QR sans rôle), pièce sale | 200, dispo +1, `washedAt/washedBy` renseignés | 409 si déjà lavée |
| Rendu par autrui | autre utilisateur | 404 (indiscernable) | N/A |
| Vue emprunts | CADRE UL 18 | emprunts des articles UL 18, dont emprunteurs UL 4 ; rien des articles UL 4 | 403 pour CHVL |
| Archivage taille empruntée | admin, taille avec 1 emprunt en cours | 409 | message inline |

</frozen-after-approval>

## Code Map

- `scripts/setup-dev.ts:~411-440,809-811` -- ajouter tables `UniformItem`, `UniformSize`, `UniformLoanBatch`, `UniformLoan` (colonnes rendu : `returnedAt`, `returnedClean`, `returnComment`, `washedAt`, `washedBy`) + index, colonne `UniteLocale.uniformQrToken` + index unique partiel et seed `MenuSetting` `uniforms` ; modèle bloc `InvStockList`/`InvItem`.
- `src/__tests__/integration/setup.ts:~209-230,445-460` -- mêmes tables dans le schéma de test.
- `scripts/add-uniforms.ts` (NEW) -- migration prod dry-run/`--apply` + vérif, modèle `scripts/add-stock-qr-token.ts` ; `CLAUDE.md` Commands à compléter (« à exécuter AVANT déploiement »).
- `src/lib/uniforms/*.ts` (NEW) -- requêtes partagées : catalogue avec dispo, création d'emprunt transactionnelle (contrôle dispo dans la transaction), rendu pièce/emprunt, liste « À laver » + marquage lavé, token QR d'UL (get-or-create, régénération, résolution) ; modèle `src/lib/inventory/stocks.ts` (`getOrCreateStockQrToken`, `resolveStockByQrToken`).
- `src/app/api/uniforms/**` (NEW) -- `items` (GET catalogue UL active ; POST/PATCH/DELETE admin), `items/[id]/sizes`, `loans` (POST panier appli), `loans/mine` (GET bandeau), `loans/[id]/return` (POST, une pièce), `loan-batches/[id]/return` (POST, emprunt entier), `laundry` (GET liste « À laver » UL active), `laundry/[loanId]` (POST marquer lavée), `loans/ul` (GET vue admin/cadre), `qr-token` (GET/POST/DELETE, modèle `src/app/api/inventory/stocks/[id]/qr-token/route.ts` : `isQrBlocked` avant lecture, scope UL, régénération `canAccessAdminPanel`).
- `src/app/api/qr-uniforms/[token]/{catalog,loans,laundry,laundry/[loanId]}/route.ts` (NEW) -- modèle `src/app/api/qr-stock/[token]/stock/route.ts`.
- `src/lib/apiAuth.ts` -- réutiliser `unauthorizedResponse`, `forbiddenResponse`, `isOutsideUl` ; `src/lib/roles.ts` -- réutiliser `isAdminOrAbove`, `canAccessAdminPanel`, `isInactive`, `isQrBlocked` (ne pas ajouter de prédicat sans `denyWhenInactive`).
- `src/app/uniforms/page.tsx` (NEW) -- onglets « Emprunter » (tous), « À laver » (tous), « Emprunts » (`canAccessAdminPanel`), « Gestion » (`isAdminOrAbove`, catalogue + modale QR) ; modèle onglets `src/components/inventory/StockTabs.tsx`.
- `src/components/uniforms/*` (NEW) -- `UniformCatalog` + panier (réutilisé par la page appli et la page QR ; modèle `src/app/qr-stock/[token]/CartSummary.tsx`), `UniformLoansBanner` (pièces groupées par emprunt, « Rendre » par pièce + « Tout rendre » par emprunt), `ReturnUniformModal`, `LaundryList` (réutilisée appli + QR), `UniformQRCodeModal` (modèle `src/components/inventory/modals/StockQRCodeModal.tsx`).
- `src/app/qr-uniforms/[token]/page.tsx` (NEW) -- catalogue + panier + liste « À laver » de l'UL du token ; modèle `src/app/qr-stock/[token]/page.tsx` (401 → `/login?callbackUrl`, `encodeURIComponent(token)`).
- `src/app/layout.tsx:~84` -- monter `UniformLoansBanner` sous `LicenseBanner` quand connecté ; rafraîchi via un événement fenêtre émis après emprunt/rendu.
- `src/components/Navbar.tsx:~128` -- lien « Uniformes » (`!isInactive` + `canSeeMenu('uniforms')`).
- `src/app/api/settings/menus/[key]/route.ts:8`, `src/components/admin/MenusTab.tsx:12` -- ajouter la clé `uniforms`.
- `package.json` / `package-lock.json` / `CHANGELOG.md` -- 5.16.0 + entrée FR user-centric.

## Tasks & Acceptance

**Execution:**
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts`, `scripts/add-uniforms.ts`, `CLAUDE.md` -- schéma + migration -- tables prêtes en dev/test/prod
- [x] `src/lib/uniforms/` -- logique partagée -- une seule écriture d'emprunt pour appli et QR
- [x] `src/app/api/uniforms/**`, `src/app/api/qr-uniforms/**` -- routes -- gardes décrites dans Boundaries
- [x] `src/app/api/settings/menus/[key]/route.ts`, `MenusTab.tsx`, `Navbar.tsx` -- menu -- point d'entrée
- [x] `src/components/uniforms/*`, `src/app/uniforms/page.tsx`, `src/app/qr-uniforms/[token]/page.tsx`, `src/app/layout.tsx` -- UI + bandeau
- [x] `package.json`, `package-lock.json`, `CHANGELOG.md` -- version + changelog FR
- [x] Tests -- `src/__tests__/integration/uniforms-*.test.ts` (401/403/400/happy path par route, matrice I/O complète dont 409 dispo et scope UL croisé), `src/__tests__/components/Uniform*.test.tsx` (panier, bandeau, modale de rendu)

**Acceptance Criteria:**
- Given un admin UL 18 qui crée « Polo » tailles M(3)/L(2), when un CHVL UL 18 ouvre Uniformes, then il voit Polo M dispo 3, L dispo 2 et aucun article d'une autre UL.
- Given un emprunt validé, when l'utilisateur navigue sur n'importe quelle page, then le bandeau liste ses pièces en cours avec « Rendre » par pièce et « Tout rendre » par emprunt, et disparaît quand tout est rendu.
- Given une pièce rendue sale, when un autre bénévole la marque lavée depuis « À laver », then elle quitte la liste et redevient empruntable.
- Given une taille archivée, when un utilisateur ouvre le catalogue, then elle n'apparaît plus mais ses emprunts passés restent dans l'onglet Emprunts.

## Implementation Notes

- Routes ajoutées au-delà du Code Map : `PATCH/DELETE /api/uniforms/items/[id]/sizes/[sizeId]` (modifier la quantité, archiver une taille).
- `loans/mine` et les deux routes de rendu sont gardées par `isQrBlocked` (et non `!isInactive`) : un compte sans rôle qui a emprunté via QR doit voir et rendre ses pièces.
- `GET /api/uniforms/qr-token` : token de l'UL de session pour tout compte non INACTIF (modèle stock) ; régénération `canAccessAdminPanel` ; la modale n'est exposée que dans l'onglet Gestion.
- Liste « À laver » sans nom d'emprunteur (ouverte aux scanneurs d'autres UL). Nom/email de l'emprunteur figés sur `UniformLoanBatch` (pas de FK vers `User`).
- Bandeau replié par défaut (résumé une ligne), « Rendre… » le déplie.
- L'archivage n'est bloqué que par des pièces non rendues ; une pièce sale non lavée ne bloque pas.
- Pas de test de concurrence réelle (SQLite local se verrouille) : la sûreté repose sur `db.transaction('write')` ; cas séquentiel testé.
- Les routes API ne vérifient pas `MenuSetting` (le menu désactivé masque le lien et redirige la page seulement).
- Vérifié indépendamment : `npm run lint` (0/0), `npx tsc --noEmit` (propre), `npx vitest run` → 214 fichiers / 2279 tests verts.

- Après la passe de patch (15 correctifs, cf. Review Triage Log) : `UL_LOANS_LIMIT` déplacé dans `src/lib/uniforms/constants.ts` (évite d'embarquer `@/lib/db` côté client) ; `loans/mine` traduit désormais `UniformError` ; test de concurrence via un second client libSQL sur le même fichier. Ajout non demandé : `UniformsPage.test.tsx` (couvre les deux correctifs de page, réduit en partie l'entrée différée #13).
- Vérification finale indépendante : `npm run lint` (0/0), `npx tsc --noEmit` (propre), `npx vitest run` → 220 fichiers / 2333 tests verts.

## Spec Change Log

## Review Triage Log

**Passe 1 (blind-hunter, edge-case-hunter, verification-gap) :**

1. [blind] Aucun rendu forcé / perte par un admin. **Rejeté (hors intention)** : le bloc figé exclut explicitement le rendu par un tiers. Signalé à l'humain comme évolution possible.
2. [blind] Pas d'annulation d'un rendu propre/sale ou d'un « lavée ». **low → rejeté** : non demandé, nouveau chemin d'écriture nécessaire.
3. [blind] Régénération QR : API ouverte à `canAccessAdminPanel`, UI seulement dans Gestion (admin). **low → rejeté** : conforme au Code Map (modèle stock), aucun effet utilisateur.
4. [edge] `GET/POST /api/uniforms/qr-token` lisible et créable par un compte sans rôle. **low → patch** : même correctif que le patch #1 de la spec QR UL (garde `canAccessAdminPanel`) ; permet sinon d'obtenir l'accès QR sans voir le QR.
5. [blind, edge, verif-other] Menu désactivé : routes, page QR et bandeau restent actifs ; `MenuSettingsProvider` ne charge les réglages que pour SUPER_ADMIN. **medium → defer** : cause antérieure (`/api/settings/menus` 403 hors SUPER_ADMIN), touche aussi stats/inventaire/missions.
6. [blind, edge] `resolveActor` retombe sur l'id partagé `'inconnu'`. **low → patch** : toute session porte un email en pratique, mais correction directe (lever une erreur).
7. [blind, edge] Onglet Gestion affiche « Aucun article » pendant le chargement ou en erreur. **medium → patch** : vérifié (`page.tsx` passe `catalog.data?.items ?? []` sans tester `loading`/`error`) ; risque de doublons.
8. [blind, edge] Historique des emprunts tronqué à 500 sans avertissement. **low → patch** : drapeau `truncated` + mention dans `UniformLoansTable`.
9. [verif] Garantie anti-surréservation de `createLoanBatch` non testée. **patch** (déposition du relecteur) : test « écriture concurrente » modèle `inventory-adjust.test.ts:306-338`.
10. [verif, blind] `UniformQRCodeModal` sans test composant. **patch**.
11. [verif] Page `/qr-uniforms/[token]` sans test (redirection 401 + `callbackUrl`, `encodeURIComponent`). **patch**.
12. [blind] Composants à état sans test RTL (`UniformManagement`, `UniformItemEditor`, `UniformSizeRow`, `UniformLoansTable`) ; pas de test « l'ancien token QR répond 404 après régénération ». **medium → patch** : règle CLAUDE.md.
13. [verif] Page `/uniforms` : onglets par rôle, redirection menu et rechargement au changement d'UL non testés. **defer** (déposition du relecteur : l'API fait foi).
14. [blind] Schéma de test sans FK `UniformItem.ulId` ni index. **low → patch** : alignement direct sur `scripts/add-uniforms.ts`.
15. [blind, edge] Unicité nom/taille seulement applicative (course) ; `UniformLoanBatch.ulId` sans FK. **low → rejeté** : deux admins créant le même nom à la même seconde est improbable, et le correctif (index uniques partiels + gestion d'erreur) dépasse une correction directe.
16. [blind] Libellé de taille non renommable dans l'UI. **low → rejeté** : non demandé (ajout/retrait de tailles + quantités).
17. [blind, edge] État local périmé dans `UniformSizeRow` / `UniformItemEditor` après rechargement. **low → patch** : correction directe par `key` incluant la valeur serveur.
18. [blind] `UniformQRCodeModal` : `res.json()` sans `.catch`. **low → patch**.
19. [blind] Pas d'échéance ni d'alerte de retard. **Rejeté (hors intention)**.
20. [edge] Comparaison de casse JS/NOCASE divergente sur les non-ASCII. **low → rejeté** : négligeable (création d'un article avec deux tailles « É »/« é »).
21. [edge] `useUniformCatalog` garde le catalogue de l'UL précédente pendant le rechargement. **low → patch** : vérifié (`loading` n'est pas remis à vrai ni `data` vidé au changement d'`url`) ; correction directe.
22. [edge] Après un 409, le panier garde plus que le disponible rafraîchi : 409 à chaque nouvel essai. **medium → patch** : vérifié (`cartLines` ne borne pas au `available`).
23. [edge] Panier > 50 pièces bloqué seulement côté serveur. **low → rejeté** : cas improbable, message serveur explicite.
24. [edge] Rendu en 409/404 (déjà rendu ailleurs) : bandeau non rafraîchi. **low → patch** : `notifyUniformsChanged()` sur 404/409.
25. [edge] Changement d'identité sans rechargement (impersonation). **low → rejeté** : bandeau rafraîchi au prochain changement de visibilité ; correctif hors correction directe.
26. [edge] Réponses désordonnées au basculement En cours / Tout l'historique. **low → rejeté** : improbable, ajout d'AbortController.
27. [edge] Course dans `UniformQRCodeModal` au changement d'UL. **low → rejeté** : improbable.
28. [edge] Onglet Emprunts/Gestion toujours affiché après passage à une UL où le rôle est inférieur. **low → patch** : correction directe (onglet effectif retombe sur « Emprunter »).
29. [edge] « Tout rendre » absent pour un emprunt d'une seule pièce. **false** : « Rendre » sur l'unique pièce produit exactement le même effet.

**Routage :** patch (#4, 6, 7, 8, 9, 10, 11, 12, 14, 17, 18, 21, 22, 24, 28) → ré-engagement de l'agent d'implémentation. defer (#5, #13) → `deferred-work.md`. Reste rejeté.

## Design Notes

**Disponible calculé :** stocker `quantity` = parc possédé et dériver la dispo (`quantity − COUNT(emprunts sans returnedAt)`) évite toute dérive entre compteur et lignes d'emprunt, et laisse l'admin corriger le parc sans toucher aux emprunts.

**Contrôle de dispo dans la transaction :** deux validations simultanées sur la dernière pièce ne doivent pas toutes deux réussir — le calcul de dispo et les INSERT partagent la même transaction (`db.transaction('write')`).

**Rendu par autrui → 404 :** l'identifiant d'emprunt ne doit pas servir d'oracle ; même convention que `isOutsideUl` côté `POST /api/trips`.

## Verification

**Commands:**
- `npm run lint` -- attendu : 0 erreur, 0 warning
- `npx tsc --noEmit` -- attendu : propre
- `npm run test` -- attendu : suite verte, nouveaux tests uniformes inclus
- `npx tsx scripts/add-uniforms.ts` (dry-run) -- attendu : liste les DDL sans écrire, idempotent après `--apply`

**Manual checks (if no CLI):**
- `npm run dev` : admin@dev.local crée un article + tailles, génère le QR ; chvl@dev.local emprunte via l'appli, voit le bandeau, rend une pièce « sale » + commentaire puis « Tout rendre » le reste ; secouriste@dev.local la marque lavée via le QR ; admin voit l'emprunt et son retour dans l'onglet Emprunts.

---
title: 'Thèmes saisonniers (super admin) — premier thème « Fête des vendanges de Montmartre »'
type: 'feature'
created: '2026-10-03'
status: 'done'
baseline_commit: '523433d769f17e643e1d0827e787d1a444c57f6b'
route: 'dispatch'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Martine n'a aucun moyen d'habiller l'appli pour un événement. Le super admin veut activer des thèmes décoratifs visibles par tous les utilisateurs, chacun sur une plage de dates, en commençant par « Fête des vendanges de Montmartre ».

**Approach:** Les thèmes sont un catalogue défini dans le code (habillage = composants + CSS). Une table `SeasonalTheme` enregistre pour chaque thème son activation et sa plage de dates. Le super admin la gère dans un nouvel onglet « Thèmes » de l'administration. Un calque global, monté dans le layout, récupère le thème actif du jour et applique son habillage aux pages authentifiées.

**Décisions (checkpoint 1) :**
- Habillage sans emprise : **aucun bandeau ni élément qui occupe de la place**. Le thème décore l'existant, par superposition et sans décaler la mise en page (même esprit que de la neige déposée sur le haut des textes pour Noël). Pour les vendanges : de petites grappes et des feuilles de vigne posées sur le haut des titres de page et des en-têtes de cartes, plus un fin sarment de vigne qui pend du bord bas de la navbar. Fonds, couleurs et contenus ne changent pas.
- Les plages portent sur des dates précises avec l'année (`YYYY-MM-DD`). Pas de récurrence annuelle.
- Un bouton permet à chaque utilisateur d'afficher ou de masquer le thème. Il n'est visible que lorsqu'un thème est appliqué, et il reste visible quand le thème est masqué pour pouvoir le réafficher. C'est une icône compacte dans la navbar, à côté du bouton clair/sombre : elle n'ajoute ni barre ni bandeau.
- La spec reste entière (un seul objectif).

## Boundaries & Constraints

**Always:** seul `SUPER_ADMIN` lit la configuration et la modifie (401/403 sinon) ; le thème actif est lisible par tout utilisateur connecté. Les dates sont des jours calendaires `YYYY-MM-DD`, bornes incluses, évaluées en Europe/Paris. Un thème est actif quand il est activé et que la date du jour est dans sa plage. La mutation est enveloppée dans `withAudit`. L'habillage reste lisible en clair et en sombre, respecte `prefers-reduced-motion`, ne masque aucun contenu ni bouton et n'intercepte pas les clics (`pointer-events: none` sur la déco). La déco est purement superposée (pseudo-éléments `::before`/`::after` en `position: absolute` ou calque fixe). Elle ne change ni les dimensions, ni les marges, ni le padding, ni le flux : activer ou masquer le thème ne provoque **aucun décalage de mise en page**. Les grappes restent petites (au plus ~16 px de haut), débordent légèrement au-dessus du texte sans le recouvrir, et sont `aria-hidden`. Les assets passent en SVG/CSS inline ou en `.png` dans `public/` (seul `.png` échappe au proxy).

**Never:** pas d'éditeur de thème en base (pas de CSS ni d'image saisis par l'admin) ; on ne touche pas au toggle clair/sombre de next-themes ; on ne modifie pas la couleur rouge CRF des actions principales ; pas de thème sur `/login` ni sur les pages non authentifiées.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Thème actif | activé, 2026-10-07 → 2026-10-12, aujourd'hui 10-07 (Paris) | `GET /api/themes/active` → `{ theme: 'vendanges-montmartre' }`, déco affichée | N/A |
| Hors plage | activé, plage terminée hier | `{ theme: null }`, aucune déco | N/A |
| Désactivé | plage couvrant aujourd'hui, `enabled=false` | `{ theme: null }` | N/A |
| Plage invalide | `startDate > endDate`, ou dates absentes alors que `enabled=true`, ou format invalide | 400 | message zod en français |
| Clé inconnue | `PUT /api/settings/themes/inconnu` | 404 | N/A |
| Chevauchement | deux thèmes activés dont les plages se recouvrent | 409 | « Plage en conflit avec le thème X » |
| Échec du fetch | `/api/themes/active` en erreur | pas de déco, aucune erreur affichée | silencieux |

</frozen-after-approval>

## Code Map

- `src/app/users/page.tsx` -- onglets admin : union `TabId` (l.28), boutons gardés par `isSuperAdminUser` (l.193-238), panneaux (l.259-274). Ajouter `'themes'` sur le modèle de `'audit'`.
- `src/components/admin/MenusTab.tsx`, `AuditLogTab.tsx` -- modèles d'onglet (fetch + PATCH, CSS Modules).
- `src/lib/roles.ts` -- `isSuperAdmin` (l.98, refuse déjà INACTIF).
- `src/lib/apiAuth.ts` -- `unauthorizedResponse` (l.9), `forbiddenResponse` (l.18).
- `src/app/api/settings/menus/route.ts` et `menus/[key]/route.ts` -- modèles de GET authentifié et de mutation super admin + zod + `withAudit`.
- `src/lib/audit/log.ts` -- `withAudit(handler, { action, entityType })` (l.221). `src/__tests__/unit/audit-routes-coverage.test.ts` impose l'enveloppe.
- `src/lib/audit/schema.ts` -- modèle de constante DDL partagée (à reproduire dans `src/lib/themes/schema.ts`).
- `scripts/add-audit-log.ts` -- modèle de migration prod (dry-run, `--apply`).
- `scripts/setup-dev.ts` -- création des tables dev (audit l.716-719, bannières l.875-902).
- `src/__tests__/integration/setup.ts` -- `createTables()` (l.393-415), `truncateTables()` (l.584-630).
- `src/app/layout.tsx` -- shell : bannières sous `Navbar`, gardées par `session?.user`. Y monter le calque.
- `src/lib/contexts/MenuSettingsContext.tsx` -- modèle de fetch global en `useEffect`.
- `src/components/MarineApprovedOverlay.tsx` -- précédent de calque décoratif (+ son test).
- `src/components/Navbar.tsx` -- `<ThemeToggle/>` l.145 (utilisateur connecté) : y placer le bouton du thème. `src/components/ThemeToggle.tsx` : modèle de bouton icône.
- `src/app/globals.css` -- variables `:root` (l.2-36), `.dark` (l.39-66) ; pas de variable `--accent`.
- `src/__tests__/integration/menuSettings.test.ts` -- modèle de test de route admin (mock `@/auth`, `@/lib/db`).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/themes/catalog.ts` -- catalogue `SEASONAL_THEMES` (clé, libellé, description) avec `vendanges-montmartre` ; fonctions pures `parisToday(now)`, `isThemeActive(row, today)`, `pickActiveTheme(rows, today)`, `rangesOverlap(a, b)` -- logique testable sans DB.
- [x] `src/lib/themes/schema.ts` -- `SEASONAL_THEME_DDL` : `SeasonalTheme(theme_key TEXT PRIMARY KEY, enabled INTEGER NOT NULL DEFAULT 0, start_date TEXT, end_date TEXT, updatedAt TEXT NOT NULL, updatedBy TEXT)` -- DDL unique partagée.
- [x] `scripts/add-seasonal-themes.ts` + entrée dans `CLAUDE.md` (Commands) -- migration prod dry-run / `--apply`, à exécuter avant le déploiement de la v5.21.0.
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- création de la table (+ truncate).
- [x] `src/app/api/themes/active/route.ts` -- GET pour tout utilisateur connecté → `{ theme: key | null, startDate: string | null }`.
- [x] `src/app/api/settings/themes/route.ts` -- GET super admin : catalogue fusionné avec les lignes (thèmes sans ligne = désactivés, dates nulles).
- [x] `src/app/api/settings/themes/[key]/route.ts` -- PUT super admin, zod, 404 / 409, upsert, `withAudit({ action: "Modification d'un thème saisonnier", entityType: 'theme' })`.
- [x] `src/lib/contexts/SeasonalThemeContext.tsx` -- provider (modèle `MenuSettingsContext`) : fetch de `/api/themes/active` une fois la session prête (`{ theme, startDate }`), état `hidden` mémorisé dans `localStorage` sous la clé `seasonal-theme-hidden:<themeKey>:<startDate>` (lecture et écriture dans un try/catch ; une nouvelle plage réaffiche le thème). Pose `data-season="<key>"` sur `<html>` si le thème est actif et non masqué, et le retire sinon. Hook `useSeasonalTheme()`.
- [x] `src/styles/seasons/vendanges-montmartre.css` (importé dans `layout.tsx`) -- règles globales toutes préfixées par `html[data-season="vendanges-montmartre"]` : grappes et feuilles en SVG inline (data URI) en `::before` sur les titres de page et les en-têtes de cartes (sélecteurs à choisir après inspection des classes réelles, et `position: relative` seulement s'il ne change rien au rendu), sarment qui pend sous la navbar. Légère oscillation désactivée sous `prefers-reduced-motion`. Variante `.dark` si le contraste l'exige.
- [x] `src/components/themes/SeasonalThemeToggle.tsx` + `src/components/Navbar.tsx` -- icône bouton (🍇 ou SVG) placée à côté de `<ThemeToggle/>` (Navbar l.145), rendue seulement si un thème est actif. `aria-pressed`, libellé « Masquer le thème » / « Afficher le thème ».
- [x] `src/app/layout.tsx` -- monter `SeasonalThemeProvider` (dans `ThemeProvider`, autour de la navbar), gardé par la session côté fetch.
- [x] `src/components/admin/ThemesTab.tsx` (+ CSS) et `src/app/users/page.tsx` -- onglet « Thèmes » : une carte par thème, interrupteur, dates de début/fin, enregistrer, badge « Actif aujourd'hui / Programmé / Inactif ».
- [ ] Tests : `src/__tests__/unit/seasonal-themes.test.ts` (matrice : bornes incluses, minuit Paris, chevauchement), `src/__tests__/integration/seasonalThemes.test.ts` (401/403/400/404/409/happy path sur les 3 routes), `src/__tests__/components/ThemesTab.test.tsx`, `SeasonalThemeToggle.test.tsx` / `SeasonalThemeContext.test.tsx` (pose et retrait de `data-season`, persistance, bouton absent sans thème).
- [x] `package.json` / `package-lock.json` 5.21.0, `CHANGELOG.md` (✨ Nouveautés, orienté utilisateur).

**Acceptance Criteria:**
- Given un super admin, when il active « Fête des vendanges de Montmartre » du 7 au 12 octobre et enregistre, then tout utilisateur connecté voit l'habillage sur toutes les pages authentifiées pendant ces jours-là, et plus après le 12 à minuit (Paris).
- Given un utilisateur non super admin, when il ouvre l'administration, then l'onglet « Thèmes » est absent et les routes `/api/settings/themes*` répondent 403.
- Given un thème actif, when un utilisateur clique « Masquer le thème » puis recharge la page, then l'habillage reste masqué et le bouton propose « Afficher le thème ». Given aucun thème actif, then le bouton n'existe pas.
- Given un thème actif, when on bascule clair/sombre, then l'habillage reste lisible et aucun bouton n'est masqué ni bloqué.
- Given une page quelconque, when le thème passe d'affiché à masqué, then aucun élément ne change de position ni de taille : aucun bandeau ni aucune barre n'apparaît.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|--------|---------|---------|----------------|
| 1 | edge | Un refetch qui renvoie `theme: null` ne vide pas `active` | low | Vrai (le `return` précède `setActive`). Corrigé avec le n°2 → patch |
| 2 | edge+blind | Onglet ouvert au passage de minuit à Paris : thème non réévalué (AC « plus après le 12 à minuit ») | medium | Fetch seulement au changement de `status` → patch (refetch sur `visibilitychange`/`focus`) |
| 3 | edge | Ligne activée orpheline (clé retirée du catalogue) → 409 impossible à lever | low | Vrai, correction en une ligne (filtrer sur `THEME_KEYS`) → patch |
| 4 | edge+blind | Course entre deux PUT concurrents qui se chevauchent | low | Il faudrait deux super admins simultanés ; correctif transactionnel plus complexe → rejeté |
| 5 | edge+blind | Les comptes INACTIF reçoivent le thème (`/api/themes/active` sans `isInactive`) | medium | Vrai : la navbar s'affiche sur `/inactif` ; règle projet « INACTIF bloque tout » → patch (403 + test) |
| 6 | edge | PUT réussi puis `load()` en échec → l'alerte remplace l'onglet | low | Improbable, correctif = branche supplémentaire → rejeté |
| 7 | edge | La classe `text-muted` n'existe pas : icône masquée identique | low | Vérifié : aucune règle `.text-muted` dans `src/**/*.css` → patch |
| 8 | edge+blind | Le sarment (22 px, grappes) pend sur le contenu sous la navbar sticky ; grappes et feuilles à `top:-10px` recouvrent le haut des lettres | medium | Contredit « débordent légèrement au-dessus du texte sans le recouvrir » → patch (ancrer la déco au-dessus du texte, sarment ≤ 10 px, grappes plus rares) |
| 9 | verif | Aucun test Navbar avec le contexte saisonnier : la feature peut être déconnectée sans test rouge | medium | Pré-vérifié → patch |
| 10 | verif | Bascule du jour à Paris non testée au niveau des routes | medium | Pré-vérifié → patch |
| 11 | verif | Onglet « Thèmes » réservé au super admin non testé côté page | low | Pré-vérifié ; la page admin n'a aucun harnais de test, et les 403 API sont couverts → defer |
| 12 | blind | `pickActiveTheme` sans ordre déterministe en cas de chevauchement | low | Les chevauchements sont refusés à l'écriture → rejeté |
| 13 | blind | Pas de contraintes CHECK en base | low | Écriture uniquement via la route validée → rejeté |
| 14 | blind | Pas de lien testé entre une clé du catalogue et sa feuille CSS | low | Risque pour les futurs thèmes seulement → rejeté |
| 15 | blind | Pas de `min` sur la date de fin dans l'onglet | low | Correction directe (attribut) → patch |
| 16 | blind | Aucune indication de modifications non enregistrées | low | Confort, ajoute de l'état → rejeté |
| 17 | blind | Tests manquants : corps non-JSON, INACTIF, entrée d'audit, libellé du 409, 29 février | low | INACTIF couvert par le n°5 ; audit couvert par `audit-routes-coverage` ; le reste est mineur → rejeté |
| 18 | blind | Couleurs hexadécimales en dur dans `ThemesTab` et dans le bouton | low | Variantes sombres présentes, cosmétique → rejeté |
| 19 | blind | Le changelog dit « une plage ne peut pas en recouvrir une autre » alors que seuls les thèmes activés sont comparés | low | Correction directe du texte → patch |
| 20 | blind | Petits défauts du script de migration (⚠️, double requête, variable d'env non vérifiée) | false | Même forme que `scripts/add-audit-log.ts:39` (convention du dépôt) → rejeté |
| 21 | blind | Déco qui apparaît après le premier rendu, fetch à chaque chargement | low | Rendu côté serveur plus lourd, hors du flux actuel des contextes (M-4) → rejeté |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npm run test` -- expected: toute la suite verte, y compris `audit-routes-coverage`
- `npm run build` -- expected: succès

**Manual checks (if no CLI):**
- `npm run dev`, activer le thème dans Administration → Thèmes sur une plage couvrant aujourd'hui : vérifier l'habillage en clair et en sombre et sur mobile, vérifier qu'aucun élément ne se décale quand on masque ou affiche le thème, puis le désactiver.

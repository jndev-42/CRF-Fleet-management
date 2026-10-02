---
title: 'Journal d''audit — traçabilité des actions utilisateurs (super admin)'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '985cba74ea11ee455900e8d694b59c46496ae86b'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
  - '{project-root}/scripts/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucune trace en base de qui a fait quoi dans l'application : impossible de répondre à « qui a supprimé ce véhicule / validé cette note de frais / changé ces rôles ? ».

**Approach:** Chaque action utilisateur est enregistrée dans une table `AuditLog` (horodatage, auteur réel, action en français, ressource, résultat). Un onglet « Journal d'audit » de la page Administration, réservé au SUPER_ADMIN, liste les derniers événements et filtre sur une personne. Les entrées de plus de 30 jours sont purgées chaque jour.

**Décisions (humain) :**
- Périmètre : toutes les modifications (POST/PUT/PATCH/DELETE) et les connexions réussies ; pas les consultations (GET, pages vues).
- Détail : action libellée en français + ressource (type, id) + résultat (code HTTP) ; jamais les valeurs avant/après.
- Les actions refusées ou en erreur (4xx/5xx) sont tracées avec leur résultat, distinguable à l'écran.

## Boundaries & Constraints

**Always:** Requêtes SQL paramétrées. Lecture du journal : `isSuperAdmin` côté API (403 sinon) et côté UI (onglet masqué). L'écriture d'audit est non bloquante et non fatale : un échec d'écriture est loggé `[audit] …` et ne change jamais la réponse de la route. En impersonation, l'auteur enregistré est le vrai utilisateur (`originalEmail`), l'utilisateur incarné est noté à part. Rien n'est lisible au-delà de 30 jours (filtre en lecture en plus de la purge).

**Never:** Ne jamais stocker de corps de requête, mot de passe, jeton, fichier ou secret (ex. `brand-credentials`). Pas de modification ni suppression d'entrée via l'API (journal en ajout seul, hors purge). Ne pas élargir le matcher de `src/proxy.ts` à `/api`. Pas de nouveau cron dans `vercel.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Action réussie | `DELETE /api/vehicles/abc` par ADMIN → 200 | ligne : auteur, « Suppression d'un véhicule », `vehicles/abc`, résultat 200 | N/A |
| Impersonation | super admin incarne X, `POST /api/trips` | `actorEmail` = super admin, `impersonatedEmail` = X | N/A |
| Écriture audit en échec | DB indisponible pour l'INSERT | réponse de la route inchangée | `console.error('[audit] …')` |
| Lecture non super admin | ADMIN appelle `GET /api/audit-logs` | 403 | N/A |
| Filtre personne | `?userEmail=x@croix-rouge.fr` | uniquement ses lignes, plus récentes d'abord, paginées | N/A |
| Paramètres invalides | `limit=5000`, `before` non ISO | — | 400 Zod, message français |
| Purge | lignes de 31 jours | supprimées au passage du cron quotidien | erreur de purge non fatale pour le reste du cron |

</frozen-after-approval>

## Code Map

- `src/app/api/**/route.ts` -- 74 fichiers exportent POST/PUT/PATCH/DELETE ; chacun fait `const session = await auth()` en ligne, aucun enrobage commun.
- `src/auth.ts` -- `callbacks.signIn` L142-172 (connexion) ; session : `user.id/email` = utilisateur incarné, `user.originalEmail` = vrai acteur, `user.impersonatedEmail` (L183-184).
- `src/lib/referentiel/schema.ts` -- modèle de module DDL partagé (`{name, ddl}[]`) importé par `scripts/setup-dev.ts` (L712) et `src/__tests__/integration/setup.ts` (L389).
- `scripts/add-referentiel.ts` -- modèle de migration prod (dry-run, `--apply`, re-vérification `sqlite_master`).
- `src/__tests__/integration/setup.ts` -- `createTables()` et `truncateTables()` (liste manuelle à compléter).
- `src/app/users/page.tsx` -- page Administration ; `TabId` L27, onglets L183-230, panneaux L232-265 ; modèle : onglet Référentiel (`isSuperAdminUser`, L220-229 / L257) ; la liste `users` est déjà chargée (L58-73).
- `src/components/admin/ReferentielTab.tsx` -- modèle de composant d'onglet super admin.
- `src/lib/roles.ts` -- `isSuperAdmin` L98 ; `src/lib/apiAuth.ts` -- `forbiddenResponse`, `unauthorizedResponse`.
- `src/app/api/cron/daily-mileage-check/route.ts` -- cron quotidien (Bearer `CRON_SECRET`) où brancher la purge.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/audit/schema.ts` -- DDL `AuditLog` (id, createdAt ISO, actorUserId, actorEmail, actorName, impersonatedEmail, ulId, method, path, action, entityType, entityId, status, ip, userAgent) + index `(createdAt)` et `(actorEmail, createdAt)` -- partagé dev/tests/prod.
- [x] `src/lib/audit/log.ts` -- `recordAudit(entry)` non fatal ; `withAudit(handler, { action, entityType })` qui exécute le handler, lit la session, extrait l'id de ressource des `params`, écrit via `after()` de `next/server` ; `purgeAuditLogs(days=30)`.
- [ ] Les 74 `route.ts` de mutation -- envelopper chaque export mutant avec `withAudit` et un libellé français ; exclure `auth/[...nextauth]` et `cron/*`.
- [x] `src/auth.ts` -- tracer la connexion réussie (`events.signIn`).
- [x] `src/app/api/audit-logs/route.ts` -- GET super admin, Zod (`userEmail?`, `before?` ISO, `limit` ≤ 200), tri décroissant, fenêtre 30 jours.
- [x] `src/app/api/cron/daily-mileage-check/route.ts` -- appeler `purgeAuditLogs()` dans un try/catch isolé.
- [x] `src/components/admin/AuditLogTab.tsx` (+ CSS Module) -- tableau (date, auteur, action, ressource, résultat), sélecteur de personne, « Charger plus ».
- [x] `src/app/users/page.tsx` -- onglet `audit` réservé super admin.
- [x] `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts`, `scripts/add-audit-log.ts`, `CLAUDE.md` -- table en dev/tests, migration prod, documentation de la commande.
- [ ] Tests -- unitaires `log.ts` (écriture, non-fatalité, impersonation, purge) ; intégration `audit-logs` (401, 403, 400, filtre) ; composant `AuditLogTab` ; un test vérifiant que chaque route mutante exporte un handler enveloppé.
- [x] `CHANGELOG.md`, `package.json`, `package-lock.json` -- 5.20.0, entrée utilisateur en français.

**Acceptance Criteria:**
- Given un SUPER_ADMIN, when il ouvre Administration, then l'onglet « Journal d'audit » affiche les 50 derniers événements, le plus récent en haut.
- Given un ADMIN, when il ouvre Administration, then l'onglet n'apparaît pas.
- Given une nouvelle route mutante sans `withAudit`, when la suite de tests tourne, then le test d'énumération échoue.

## Implementation Notes

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve / route |
|---|---|---|---|---|
| 1 | BH, EC, VG | Début/fin d'impersonation non tracés (passent par `/api/auth/*`, exempté) | high | `src/auth.ts` L244-250 : `token.impersonatedEmail` modifié sans `recordAudit` — patch |
| 2 | BH | `entityId` null pour les routes à id en query (inventory, stocks) | medium | `inventory/route.ts:205`, `stocks/route.ts:150` lisent `searchParams.get('id')` — patch (repli query `id`) |
| 3 | BH | `entityId` null pour les créations | low | l'id n'existe pas avant le handler ; action + chemin suffisent — rejeté |
| 4 | BH | Validation/refus/paiement de note de frais et validation de réservation sous un même libellé | medium | `expenses/[id]` PATCH branche sur `body.action` (validate/reject/pay) — patch (libellé selon `action`) |
| 5 | BH | Routes QR tracées « Anonyme » | false | `qr/[token]/checkout` L37-39 exige une session (401 sinon) |
| 6 | BH, EC | `ulId` de l'utilisateur incarné / sentinelle `'default'` stockée | low | `actorFromSession` conserve `user.ulId` — patch (correction directe) |
| 7 | BH, EC | Filtre personne ignore les actions faites « en tant que » elle | medium | `audit-logs/route.ts` filtre `actorEmail` seul — patch |
| 8 | BH | Pas de filtre action/date, actions *sur* une personne | low | hors intention (dernières entrées + par personne) — rejeté |
| 9 | BH, EC | Réponse obsolète écrase la liste au changement de personne | low | `load` sans garde ; cas plausible en usage courant, correction courte — patch |
| 10 | BH | IP/user-agent collectés mais jamais exposés | low | API ne renvoie pas `ip` — patch (exposer `ip` en infobulle) |
| 11 | BH | IP falsifiable via `x-forwarded-for` | false | sur Vercel, `x-forwarded-for` est réécrit par la plateforme |
| 12 | BH | Consultation du journal non tracée | false | décision humaine : pas de GET |
| 13 | BH | Purge sautée si le DELETE des réservations lève | low | ordre dans le cron — patch (purge déplacée avant) |
| 14 | BH | `dev:prod` copie `AuditLog` sans ses index | low | données prod déjà clonées en entier ; index = perf locale seulement — rejeté |
| 15 | BH | Double `auth()` dans `after()` | low | coût après réponse, sans latence utilisateur — rejeté |
| 16 | BH, EC | Test d'exhaustivité : exemption `auth/` trop large, exports typés non détectés | low | regex/EXEMPT du test — patch (correction directe) |
| 17 | BH | Migration ne vérifie pas les colonnes d'une table existante | low | table neuve, aucun état antérieur — rejeté |
| 18 | BH, EC, VG | Pagination par `createdAt` seul : égalité à la milliseconde en bord de page | low | collision rare en usage réel, correctif = curseur composite — rejeté |
| 19 | BH | « Charger plus » mène à une page vide si total multiple de 50 | low | cosmétique — rejeté |
| 20 | EC | `?limit=` vide → 400 | low | `searchParams.get('limit') ?? undefined` — patch (`||`) |
| 21 | EC | Jeton QR encodé différemment non masqué | false | jetons `crypto.randomUUID()` : encodage identique |
| 22 | VG | Aucun test de bout en bout route réelle → ligne AuditLog | medium (gap) | VG pré-vérifié — patch (test d'intégration) |
| 23 | VG | Onglet admin réservé super admin non testé | low (gap) | 403 serveur testé ; pas de fichier de test de page — defer |
| 24 | VG | `events: authEvents` non vérifié dans l'appel NextAuth | low (gap) | VG pré-vérifié — patch |

Routage : aucun intent_gap ni bad_spec ; #2 et #4 traités en patch car `withAudit` est introduit par ce changement (l'option ajoutée n'étend aucune surface existante).

## Design Notes

Pas d'intercepteur unique possible : `/api` est hors du matcher du proxy et l'élargir changerait le comportement d'auth de toutes les routes API (redirections au lieu de 401). L'enrobage explicite `export const DELETE = withAudit(handler, { action: 'Suppression d\'un véhicule', entityType: 'vehicle' })` donne un libellé lisible et le code de réponse ; `after()` évite d'ajouter la latence Turso à la réponse.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- tout passe
- `npm run build` -- succès

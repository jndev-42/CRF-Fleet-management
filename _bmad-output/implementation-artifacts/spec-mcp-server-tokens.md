---
title: 'Serveur MCP et jetons d'accès IA (lecture seule / lecture-écriture)'
type: 'feature'
created: '2026-10-24'
status: 'done'
baseline_commit: '3904699c176edf21fa0ee5647edf81f6b4b851e9'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/app/api/CLAUDE.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Aucune IA (Claude, ChatGPT…) ne peut se connecter à l'application : l'API n'accepte que la session NextAuth du navigateur.

**Approach:** Exposer un serveur MCP (`/api/mcp`, Streamable HTTP sans état) authentifié par un jeton personnel généré dans « Administration » par un ADMIN ou SUPER_ADMIN. Le jeton fait agir l'IA en tant que son propriétaire (mêmes rôles, même UL, mêmes contrôles que les routes existantes), en portée « lecture seule » (GET uniquement) ou « lecture-écriture », et donne accès à toute l'API REST via un outil générique.

## Boundaries & Constraints

**Always:**
- Le jeton n'est affiché qu'une fois à la création ; seul son SHA-256 est stocké (format `crf_mcp_` + 32 octets aléatoires base64url ; préfixe de 12 caractères conservé pour l'affichage).
- Les droits sont ceux du propriétaire **au moment de l'appel** (rôles relus en base) : un compte INACTIF, ou qui n'est plus ADMIN/SUPER_ADMIN, voit ses jetons refusés (401).
- Les routes REST existantes ne sont pas modifiées : elles continuent d'appeler `auth()` ; c'est `auth()` qui reconnaît l'appel MCP.
- Le jeton brut n'est accepté que par `/api/mcp`. Les appels internes vers l'API portent une assertion signée de courte durée (60 s, HMAC `AUTH_SECRET`) contenant `userId`, `tokenId`, `scope` ; un jeton `read` ne peut produire d'assertion que pour `GET`.
- Chaque action d'écriture passe par `withAudit` et est tracée au nom du propriétaire, avec un User-Agent `CRF-MCP/<nom du jeton>`.
- **Décision :** dans le journal d'audit, une action faite via le MCP reste au nom de l'utilisateur mais porte une marque explicite : nouvelle colonne `AuditLog.via` (`MCP · <nom du jeton>`, `NULL` sinon), affichée comme badge « MCP » (avec le nom du jeton) dans l'onglet « Journal d'audit ».
- Un ADMIN gère ses propres jetons ; un SUPER_ADMIN voit et révoque tous les jetons. Maximum 10 jetons actifs par utilisateur.
- **Décision :** un jeton est toujours généré pour soi-même (l'IA agit en tant que l'admin qui le crée) ; jamais au nom d'un autre utilisateur.
- **Décision :** validité choisie à la création parmi 30 / 90 / 365 jours (défaut 90) ; expiration automatique, pas de jeton illimité.

**Never:**
- Pas d'OAuth, pas de session MCP persistante, pas de Redis.
- L'outil générique refuse : `/api/auth/*`, `/api/cron/*`, `/api/mcp*`, `/api/mcp-tokens*` (une IA ne crée pas de jetons), tout chemin absent du catalogue, tout chemin hors `/api/`.
- Pas d'envoi multipart (dépôt de fichiers) : corps JSON uniquement ; les réponses binaires sont résumées (type, taille), pas transmises.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lecture | jeton `read`, `api_request GET /api/vehicles` | statut + JSON de la route, filtré par UL comme pour l'utilisateur | N/A |
| Écriture refusée | jeton `read`, `api_request PATCH …` | erreur outil « jeton en lecture seule » | aucun appel HTTP |
| Écriture | jeton `write`, `PATCH /api/vehicles/[id]` | résultat de la route ; ligne d'audit au nom du propriétaire, `via = 'MCP · <nom>'`, badge « MCP » | statut 4xx de la route renvoyé tel quel |
| Jeton invalide / révoqué / expiré | Bearer inconnu | HTTP 401 sur `/api/mcp` | — |
| Propriétaire rétrogradé | plus ADMIN, ou INACTIF | HTTP 401 | — |
| Chemin interdit | `api_request GET /api/cron/daily-alerts` | erreur outil « chemin non autorisé » | — |
| Grosse réponse | > 100 000 caractères | tronquée avec mention | — |

</frozen-after-approval>

## Code Map

- `src/auth.ts:401` -- `NextAuth({...})` exporte `auth`. Le renommer en interne et exporter un `auth()` enveloppe : sans argument, lit `headers()` ; si l'en-tête `x-crf-mcp-assertion` est valide → construit la session du propriétaire, sinon délègue à NextAuth. Avec arguments → délégation pure.
- `src/auth.ts:57,87` -- `fetchUserULs` / `resolveActiveUL` (privées) : à réutiliser pour `ulId` / `availableULs` (UL d'attache).
- `src/lib/session-roles.ts:55` -- `resolveSessionRoles(exec, userId, ulId)` : rôles relus en base, ajoute INACTIF.
- `src/lib/roles.ts:107-113` -- `isSuperAdmin`, `isAdminOrAbove` (refusent INACTIF).
- `src/lib/apiAuth.ts` -- `unauthorizedResponse`, `forbiddenResponse`.
- `src/lib/audit/log.ts:67,221` -- `recordAudit`, `withAudit` (appelle `auth()` → fonctionne avec l'enveloppe). `src/__tests__/integration/audit-wrapped-routes.test.ts` vérifie que les mutations sont enveloppées.
- `src/lib/audit/schema.ts` + `scripts/add-audit-log.ts` -- modèle de constante DDL + migration dry-run/`--apply`. `AUDIT_LOG_DDL` : y ajouter `via`.
- `src/lib/audit/log.ts:27-36,67-89,118-130` -- `AuditEntry`, INSERT de `recordAudit`, `actorFromSession` (y dériver `via` depuis `session.user.mcpTokenName`).
- `src/app/api/audit-logs/route.ts:75-91` + `src/components/admin/AuditLogTab.tsx:13,110` -- sélection et affichage (badge à côté de « en tant que … »).
- `scripts/setup-dev.ts:12,734` et `src/__tests__/integration/setup.ts:397` -- y ajouter la DDL de la nouvelle table.
- `src/app/users/page.tsx:29-40,218-315` -- onglets d'Administration (`TabId`, `canSeeTab`, rendu) ; `src/components/admin/AuditLogTab.tsx` -- modèle d'onglet.
- `src/app/api/audit-logs/route.ts` -- modèle de route admin (auth → rôle → Zod).
- Dépendances à ajouter : `mcp-handler@^2.3.0`, `@modelcontextprotocol/server@^2.4.0` (`createMcpHandler`, `withMcpAuth`, `ctx.http.authInfo`).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/mcp/schema.ts` -- DDL `McpToken` (id, userId, name, tokenHash UNIQUE, tokenPrefix, scope `read|write`, createdAt, expiresAt, lastUsedAt, revokedAt) + index userId.
- [x] `scripts/add-mcp-tokens.ts`, `scripts/setup-dev.ts`, `src/__tests__/integration/setup.ts` -- migration dry-run/`--apply` (table `McpToken` + `ALTER TABLE AuditLog ADD COLUMN via` si absente) et DDL dev/test.
- [x] `src/lib/audit/schema.ts`, `src/lib/audit/log.ts`, `src/app/api/audit-logs/route.ts`, `src/components/admin/AuditLogTab.tsx` (+ css) -- colonne `via`, renseignée depuis la session MCP, renvoyée et affichée en badge « MCP ».
- [x] `src/lib/mcp/tokens.ts` -- générer, hacher, vérifier (révocation, expiration, propriétaire ADMIN+ non INACTIF, maj `lastUsedAt`), lister, révoquer.
- [x] `src/lib/mcp/assertion.ts` -- signer/vérifier l'assertion HMAC (60 s, `timingSafeEqual`).
- [x] `src/auth.ts` -- enveloppe `auth()` décrite au Code Map.
- [x] `scripts/generate-mcp-catalog.ts` → `src/lib/mcp/catalog.generated.ts` -- chemins `/api/...` et méthodes exportées de chaque `route.ts`, exclusions appliquées ; script npm `mcp:catalog`.
- [x] `src/app/api/mcp/route.ts` -- `createMcpHandler` + `withMcpAuth` ; outils `whoami`, `list_api_routes` (filtre texte optionnel), `api_request` (method, path avec paramètres résolus, query, body JSON) qui appelle `fetch(origin + path)` avec l'assertion.
- [x] `src/app/api/mcp-tokens/route.ts` (GET, POST) et `src/app/api/mcp-tokens/[id]/route.ts` (DELETE = révocation) -- Zod, ADMIN+, `withAudit`.
- [x] `src/components/admin/McpTokensTab.tsx` (+ `.module.css`) et `src/app/users/page.tsx` -- onglet « Accès IA (MCP) » visible ADMIN+ : liste, création (nom, portée, validité), jeton affiché une fois avec copie, révocation, URL du serveur et exemple de configuration client.
- [x] Tests : unitaires `tokens`, `assertion`, enveloppe `auth` ; intégration `mcp-tokens` (401/403/400/succès) et `/api/mcp` (401, `read` refuse l'écriture, chemin interdit, appel réussi) ; test de synchronisation du catalogue avec le système de fichiers ; composant `McpTokensTab`.
- [x] `CLAUDE.md` (commande de migration), `CHANGELOG.md`, `package.json`/`package-lock.json` (version mineure).

**Acceptance Criteria:**
- Given un ADMIN dans Administration, when il crée un jeton, then le jeton complet s'affiche une seule fois et seule l'empreinte est stockée.
- Given un client MCP configuré avec l'URL et le jeton, when il liste les outils, then `whoami`, `list_api_routes` et `api_request` sont proposés.
- Given un appel REST direct avec le jeton brut en Bearer, when il cible une route autre que `/api/mcp`, then il reçoit 401.
- Given un jeton révoqué, when le client l'utilise, then 401.
- Given une écriture faite via le MCP, when un SUPER_ADMIN ouvre le Journal d'audit, then la ligne est au nom de l'utilisateur avec un badge « MCP » et le nom du jeton ; les actions faites dans le navigateur n'ont pas ce badge.

## Design Notes

L'assertion évite de modifier 119 routes : `auth()` est le seul point d'entrée commun. Le jeton brut ne quitte jamais `/api/mcp`, ce qui empêche un jeton `read` d'être rejoué en écriture directement sur l'API. Le catalogue généré (et testé) remplace la lecture du système de fichiers, indisponible sur Vercel.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- tout passe
- `npm run build` -- succès

**Manual checks:**
- `npm run dev`, créer un jeton, connecter `npx @modelcontextprotocol/inspector` sur `http://localhost:3000/api/mcp` avec le Bearer : `whoami` puis `api_request GET /api/vehicles`.

## Implementation Notes

- `fetchUserULs` / `resolveActiveUL` déplacées de `src/auth.ts` vers `src/lib/user-uls.ts` (partagées avec `src/lib/mcp/tokens.ts`, sans cycle d'import).
- La garde « `read` ⇒ GET uniquement » est appliquée deux fois : `api_request` refuse avant tout appel, et `signMcpAssertion` lève. `auth()` ne voit pas la méthode HTTP (`headers()` seul), d'où la garde à la signature.
- `/api/mcp` est exempté du test de couverture `withAudit` (transport JSON-RPC ; les routes appelées tracent les écritures).
- Session MCP : `originalEmail = email` (jamais d'impersonation) ; `/api/mcp-tokens*` refuse une session MCP et la création pendant une impersonation.
- Origine des appels internes : `MCP_INTERNAL_ORIGIN` si défini, sinon l'origine de la requête.
- Smoke test réel (`next start` + base locale) : `whoami`, refus d'écriture en `read`, `POST /api/banners` en `write` → ligne d'audit `via = 'MCP · <nom>'`, User-Agent `CRF-MCP/<nom>`, Bearer brut sur `/api/vehicles` → 401.

## Spec Change Log

## Review Triage Log

| # | Constat | Verdict | Preuve / route |
|---|---------|---------|----------------|
| 1 | Assertion non liée à la méthode : rejouable en écriture pendant 60 s (blind, edge ×2) | medium | Vrai : `auth()` ne voit pas la méthode. L'assertion ne sort jamais du serveur, sauf si l'origine interne est mal choisie (cf. 2). Correctif : même racine que 2 → patch (origine fixe). |
| 2 | Origine interne déduite de l'en-tête Host (blind, edge) | medium | `internalOrigin` retombe sur `new URL(req.url).origin` ; hors Vercel, un Host forgé détourne l'assertion. Patch : origine dérivée de l'environnement Vercel. |
| 3 | Deployment Protection Vercel bloque les appels internes en preview (blind, edge) | medium | Aucun en-tête `x-vercel-protection-bypass` n'est envoyé. Patch. |
| 4 | Lectures IA non tracées (blind) | false | La spec ne trace que les écritures (`withAudit`), comme pour le navigateur ; le CHANGELOG ne promet rien de plus. |
| 5 | IP d'audit = celle du serveur (blind, edge) | low | Réel, mais le badge MCP identifie l'origine ; le correctif touche `withAudit` et les claims. Rejeté. |
| 6 | Recherche du principal répétée à chaque `auth()` ; `lastUsedAt` écrit à chaque message (blind) | low | Quelques requêtes SQL indexées par appel. Rejeté (optimisation). |
| 7 | `whoami` expose `availableULs` alors que seule l'UL d'attache est utilisable (blind, edge) | low | La spec fixe l'UL d'attache ; la sortie induit l'IA en erreur. Patch : retirer `availableULs` et le dire dans la description. Le choix d'UL est consigné en travail différé. |
| 8 | Jeton dans la ligne de commande et dans `.mcp.json` (blind) | medium | `McpClientConfig.tsx` insère le jeton brut dans les exemples. Patch : variable d'environnement et mise en garde. |
| 9 | Clients OAuth (claude.ai web, ChatGPT) non pris en charge alors que le CHANGELOG cite ChatGPT (blind) | low | Le CHANGELOG annonce « Claude, ChatGPT… ». Patch : corriger le texte. |
| 10 | Course sur la limite de 10 jetons (blind, edge) | low | Deux POST simultanés du même admin : peu probable. Rejeté. |
| 11 | La liste montre comme actifs les jetons d'un propriétaire rétrogradé (blind) | low | Seul le SUPER_ADMIN les voit ; ils sont refusés à l'usage. Rejeté. |
| 12 | Impersonation traitée différemment entre GET/DELETE et POST (blind) | low | Le comportement est cohérent avec l'impersonation. Rejeté. |
| 13 | Pas de filtre `via` dans le journal (blind) | false | C'est une fonctionnalité nouvelle, pas un défaut du changement. |
| 14 | Routes sensibles (identifiants, rôles) accessibles (blind) | false | L'intention dit « toute l'API » avec les droits de l'utilisateur. |
| 15 | Assertion expirée avant `after()` de `withAudit` (edge) | low | Il faudrait une route de plus de 60 s. Le correctif toucherait `withAudit`. Rejeté. |
| 16 | Pas de délai maximal sur le fetch interne (edge) | low | Un appel lent bloque l'outil. Correction directe. Patch : `AbortSignal.timeout`. |
| 17 | `AUTH_SECRET` absent → exception non rattrapée (edge) | low | NextAuth exige déjà `AUTH_SECRET` : l'app ne fonctionne pas sans. Rejeté. |
| 18 | Corps volumineux entièrement chargés en mémoire (edge) | low | Quelques Mo au plus sur cette API. Rejeté. |
| 19 | Binaire sans `Content-Type` traité comme texte (edge) | low | Aucune route du dépôt n'en renvoie. Rejeté. |
| 20 | Copie du jeton : échec silencieux (edge) | low | `catch` muet dans `McpTokenReveal.tsx` ; le jeton reste visible. Patch : afficher un message. |
| 21 | Catalogue : `route.tsx` / `export *` ignorés (edge) | false | Le dépôt ne contient que des `route.ts` à exports nommés. |
| 22 | `GET /api/me/license-check` écrit en base (edge) | low | Effet identique à une consultation dans le navigateur. Portée « GET uniquement » respectée. Rejeté. |
| 23 | Migration `add-mcp-tokens.ts` non testée sur une base existante (verification-gap) | medium | Le constat a été vérifié par le relecteur. Patch : test d'intégration. |
| 24 | Visibilité de l'onglet « Accès IA » non testée (verification-gap) | medium | Le constat a été vérifié par le relecteur. Patch : cas dans `AdminPage.test.tsx`. |

---
title: 'Correction des alertes de sécurité GitHub et recopie manuelle de la base démo'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_commit: '2bf543271aaf2fd508e190b4a3fafd4a200bad5c'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/src/lib/demo/AGENTS.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** GitHub signale 23 alertes Dependabot ouvertes (`zod`, `node-forge`, `nodemailer`, `undici`, `qs`, `glob`, `minimatch`) et 4 alertes CodeQL. La base démo ne se recopie que par le cron de 23h59 : impossible de la remettre à zéro en journée, ou de la réparer après un échec, sans attendre la nuit.

**Approach:** Monter les dépendances aux versions corrigées, traiter les alertes CodeQL encore réelles, et ajouter sous le bouton d'entrée en démo (page Aide) un bouton réservé au SUPER_ADMIN qui lance la même recopie que le cron. Les deux livrables restent groupés à la demande explicite de l'utilisateur.

## Boundaries & Constraints

**Always:** Autorisation vérifiée côté serveur via `isSuperAdmin` (l'interface ne fait que masquer). La recopie manuelle et le cron partagent le même code et ne peuvent pas tourner en même temps. Garde-fou conservé : jamais de recopie si l'URL démo désigne la prod. Prod lue en `SELECT` seuls. Travail dans le worktree `../CRF-Fleet-management-securite-demo`, branche `fix/securite-recopie-demo`. Version, `package-lock.json` et `CHANGELOG.md` (français, orienté utilisateur, sans nom de paquet) mis à jour.

**Décision (alertes CodeQL) :** une fois l'analyse de la PR connue, fermer via l'API `gh`, avec justification, celles qui restent ouvertes : #1 et #2 comme déjà corrigées, #6 et #10 comme faux positifs seulement si l'analyse les signale encore après correction.

**Décision (personnes en démo pendant une copie) :** une personne déjà en démo n'est jamais rebasculée vers les vraies données pendant une copie : elle reste en démo (erreurs visibles, sortie manuelle possible). La confirmation du bouton précise que la démo est partagée. Pas de blocage serveur des requêtes démo : les écritures parasites restent possibles, mais uniquement dans la démo.

**Never:** Pas de montée majeure de `googleapis`, `next-auth` ou `undici`. Pas de changement du comportement du cron ni de sa réponse. Pas de tentative d'échapper à un faux positif CodeQL par du code artificiel. Aucune alerte fermée sur GitHub sans justification écrite.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Recopie OK | SUPER_ADMIN, base démo configurée | `POST /api/demo/refresh` → 200 `{ success, tables, rows, durationMs, purged }`, démo de nouveau `ready` | N/A |
| Sans session / autre rôle | ADMIN inclus, ou SUPER_ADMIN + INACTIF | 401 / 403, aucune recopie | N/A |
| Base non configurée ou égale à la prod | URL absente ou identique | 503 `{ error }`, aucune écriture | Message français |
| Recopie déjà en cours | Verrou actif (cron ou autre clic) | 409 `{ error }`, la recopie en cours continue | Le cron journalise et passe |
| Verrou orphelin | Fonction tuée, verrou de plus de 6 min | Repris par la recopie suivante | N/A |
| Échec de la recopie | `cloneDatabase` lève | 500 `{ error }` générique, verrou libéré, démo reste indisponible | Détail dans les logs seulement |
| Échec de la purge R2 | Recopie OK, purge lève | 200 avec `purged: null` | Journalisé |
| Démo jamais recopiée | `DemoMeta` absente | Carte et bouton visibles pour le SUPER_ADMIN seulement, sans bouton d'entrée | N/A |
| Requête en mode démo | Cookie de démo | Proxy 403 : route dans `DEMO_EXTERNAL_WRITE_ROUTES` | Bouton masqué en démo |

</frozen-after-approval>

## Code Map

- `src/app/api/cron/daily-mileage-check/route.ts:34` -- `refreshDemoDatabase()` privée, à déplacer ; `prodDb`/`demoDb` viennent de `@/lib/db`.
- `src/lib/demo/cloneDatabase.ts:97` -- `readSchema` filtre `DemoMeta` : y filtrer aussi la table de verrou, sinon la recopie la supprime. Reste utilisée telle quelle par `scripts/dev-db-init.ts`.
- `src/lib/demo/readOnly.ts:39` -- `DEMO_EXTERNAL_WRITE_ROUTES` : la purge R2 impose d'y ajouter la route (règle du dépôt).
- `src/app/api/demo/status/route.ts` -- ouverte à tout compte ; le test exige `toEqual({ available })` pour un non-SUPER_ADMIN.
- `src/lib/contexts/DemoContext.tsx:75` -- lit le statut, expose `isDemoAvailable`.
- `src/app/aide/page.tsx:79` -- carte démo masquée si `!isDemoAvailable && !isDemoMode`.
- `src/lib/audit/log.ts:228` -- `withAudit` trace dans la base aiguillée : hors démo, donc en prod.
- `src/lib/roles.ts:113` -- `isSuperAdmin` (refuse INACTIF).
- `src/components/ui/PhotoPicker.tsx:263,308` -- `URL.createObjectURL` dans le rendu : alertes #6 et #10, et fuite mémoire réelle (jamais révoquée). Le mode multiple ne vérifie pas `type` image.
- Alertes #1 et #2 (`scripts/import-ebrigade.ts`, `scripts/dev-db.ts`) -- déjà corrigées dans le code (boucle de nettoyage, `execFileSync` sans shell) ; dernière détection au commit `ec961e0`.
- Arbre npm : `.npmrc` a `legacy-peer-deps=true`. `gaxios` 7.1.3 tire `rimraf@5` → `glob@10` → `minimatch@9` ; `gaxios` ≥ 7.1.4 (dans la plage) ne dépend plus de `rimraf`. `undici` via `jsdom`, `qs` via `googleapis-common`. `minimatch` 10.2.4 imbriqué sous `typescript-estree` (dev), dont même la dernière version demande `^10.2.2`.

## Tasks & Acceptance

**Execution:**
- [x] `package.json`, `package-lock.json` -- `zod` ≥ 4.6.6, `node-forge` ≥ 1.4.1, `nodemailer` ≥ 10.1.4 ; mise à jour dans la plage de `gaxios`, `undici`, `qs` ; surcharge imbriquée `@typescript-eslint/typescript-estree > minimatch ^11.0.1` ; version 5.45.0 -- corrige les 23 alertes.
- [x] `src/components/ui/useObjectUrl.ts`, `src/components/ui/PhotoPicker.tsx` -- crochet créant l'URL dans un effet et la révoquant, aperçu seulement si `type` commence par `image/` -- traite #6/#10 et la fuite mémoire.
- [x] `src/lib/demo/refresh.ts` -- `refreshDemoDatabase()` (déplacée du cron, verrou `DemoRefreshLock` à bail de 6 min, acquisition atomique, libération en `finally`) renvoyant un résultat typé : `not-configured | locked | failed | ok`.
- [x] `src/lib/demo/cloneDatabase.ts` -- exclure la table de verrou de `readSchema`.
- [x] `src/app/api/cron/daily-mileage-check/route.ts` -- appeler le module partagé, réponse inchangée.
- [x] `src/app/api/demo/refresh/route.ts` -- POST sous `withAudit`, `maxDuration = 300`, matrice ci-dessus.
- [x] `src/lib/demo/readOnly.ts` -- ajouter la route à `DEMO_EXTERNAL_WRITE_ROUTES`.
- [x] `src/app/api/demo/status/route.ts`, `src/lib/contexts/DemoContext.tsx` -- `canRefresh: true` pour un SUPER_ADMIN avec base configurée seulement, jamais renvoyé aux autres ; contexte expose `canRefreshDemo` et le rafraîchissement du statut.
- [x] `src/components/demo/DemoRefreshButton.tsx`, `src/app/aide/page.tsx` -- bouton sous celui d'entrée, confirmation (les changements faits en démo seront perdus, démo indisponible pendant la copie), état « Recopie en cours… » désactivé, résultat affiché ; masqué en démo.
- [x] `src/lib/mcp/catalog.generated.ts` -- `npm run mcp:catalog`.
- [x] `src/__tests__/` -- intégration de la route (401, 403 ADMIN et INACTIF, 503, 409, 500, succès), module `refresh` (verrou, bail expiré), statut `canRefresh`, proxy 403 en démo, composant, `useObjectUrl`, non-suppression du verrou par la recopie.
- [x] `CHANGELOG.md`, `src/lib/demo/AGENTS.md`, `src/app/api/cron/daily-mileage-check/AGENTS.md`, `CLAUDE.md` -- entrée utilisateur et documentation de la recopie manuelle.

**Acceptance Criteria:**
- Given l'arbre npm final, when `npm audit` tourne, then aucune des versions vulnérables des 23 alertes ne subsiste dans `package-lock.json`.
- Given un SUPER_ADMIN hors démo sur la page Aide, when il confirme, then la recopie tourne, le résultat s'affiche et le bouton d'entrée devient disponible sans recharger la page.
- Given un compte non SUPER_ADMIN, when il ouvre la page Aide ou appelle la route, then il ne voit aucun bouton de recopie et reçoit 403.
- Given le cron et un clic simultanés, when les deux démarrent, then une seule recopie s'exécute.

## Implementation Notes

- `gaxios` : `google-auth-library` 10.6.1 l'épinglait exactement à 7.1.3, donc `npm update gaxios` restait sans effet. Mise à jour dans la plage de `google-auth-library` (10.9.1), qui accepte `^7.1.4`. `googleapis` inchangé, aucune surcharge ajoutée.
- `useObjectUrl` renvoie la référence à poser sur l'`<img>` et y écrit l'URL depuis l'effet, plutôt que de renvoyer l'URL par un état : `react-hooks/set-state-in-effect` refuse le `setState` dans l'effet, et `.claude/rules/lint.md` n'autorise sa désactivation que pour l'hydratation.
- Un échec de recopie déclenche quand même la purge R2 : comportement existant du cron, conservé (test existant).
- Reste à faire après ouverture de la PR : décision sur les alertes CodeQL #1, #2, #6, #10 ; contrôles manuels sur preview.

## Spec Change Log

## Review Triage Log

| Trouvaille | Verdict | Preuve | Suite |
|---|---|---|---|
| Personnes en démo pendant une copie ; bascule silencieuse vers la prod au rechargement | high | `applyDemoStatus` quitte la démo dès `available: false` | intent_gap tranché par l'utilisateur, patch |
| Bouton d'entrée cliquable pendant la copie de l'onglet | medium | `running` local, `isDemoAvailable` inchangé | patch |
| Texte « aucune recopie terminée » faux pendant ou après un échec | medium | texte unique pour tous les états | patch |
| Échec de lecture du schéma source : démo `ready` mais fichiers purgés | medium | `readSchema(source)` précède `refreshing` ; contredit la matrice | patch |
| 504 puis 409 « déjà en cours » sans recopie active | medium | fonction tuée, bail encore valide | patch (messages) |
| Route exposée au MCP sans confirmation, abandon à 50 s | medium | `/api/cron` exclu, pas cette route | patch |
| `Step7SignedReport` garde la fuite d'URL | medium | ligne 51, le changelog annonce la correction | patch |
| Rien ne garantit bail > `maxDuration` | low | tests relatifs à la constante | patch (test) |
| Textes « chaque nuit » et confirmation non partagée | low | page Aide, `DemoBanner` | patch |
| Test panne réseau sans relecture du statut | low | assertion absente | patch |
| Purge R2 sautée si base démo injoignable au verrou | low | `acquireLock` lève avant la purge ; rare, réponse inchangée | rejeté |
| Réponse simulée si démo activée dans un autre onglet | low | fenêtre très étroite | rejeté |
| Fichier envoyé entre `ready` et purge | low | préexistant, très rare | rejeté |
| Audit absent si fonction tuée | low | seulement au-delà de 5 min | rejeté |
| `useObjectUrl` et `src` périmé | false | les appelants démontent l'`<img>` | rejeté |
| Statut non relu si `GET` échoue après succès | low | rare, rechargement suffit | rejeté |
| Pas de délai minimal entre recopies | low | SUPER_ADMIN seul, confirmation | rejeté |
| Icône X pour un non-image, type vide | low | cas rare, comportement du mode unique | rejeté |
| Styles en ligne, `aria-busy` | low | même style que la page Aide | rejeté |
| Aucune alerte si la recopie échoue ou est sautée | medium | préexistant : logs seuls | defer |
| Ligne d'audit de la route non exécutée en test | low | convention du dépôt, contrôle statique | defer |
| Drive et e-mail non testés avec les vraies bibliothèques | medium non vérifié | mocks seulement | defer + contrôle manuel |

## Design Notes

Verrou dans une table dédiée plutôt que `DemoMeta` : `state = 'refreshing'` persiste après un échec et ne dit pas depuis quand. Le bail de 6 min dépasse `maxDuration` (5 min), donc un verrou expiré vient forcément d'une fonction morte. Acquisition en une requête :

```sql
INSERT INTO "DemoRefreshLock" (id, startedAt) VALUES (1, ?)
ON CONFLICT(id) DO UPDATE SET startedAt = excluded.startedAt WHERE startedAt < ?
```

`rowsAffected = 0` signifie verrou tenu.

## Verification

**Commands:**
- `npm audit` -- expected: aucune des alertes visées.
- `npm run lint` -- expected: 0 erreur, 0 warning.
- `npm run test` -- expected: suite verte.
- `npm run build` -- expected: build réussi.

**Manual checks (if no CLI):**
- Analyse CodeQL de la PR : état des alertes #6 et #10.
- Sur une preview avec base démo : clic réel, en SUPER_ADMIN puis avec un autre rôle.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start dev server — auto-starts container DB, seeds with fixture data
npm run dev:prod     # Start dev server — auto-starts container DB, clones prod data
npm run build        # Production build
npm run lint         # ESLint + TypeScript check — must produce 0 errors AND 0 warnings
npm run dev:setup    # Legacy: init local SQLite file (file:./dev.db) with seed data
npm run test         # Run full test suite (Vitest)
npm run db:reset     # Destroy container + data dir — fresh init on next npm run dev
npm run db:stop      # Stop the dev DB container (data persists)

# Useful scripts (run via npx tsx scripts/<name>.ts)
npx tsx scripts/show-schema.ts          # Inspect DB schema
npx tsx scripts/setup-admin.ts <email>  # Promote user to ADMIN
npx tsx scripts/renault-login-test.ts   # Test Renault Connect auth
npx tsx scripts/generate-signing-cert.ts --env preview   # Certificat .p12 de scellement (local | preview | prod ; préfixe le CN)
npx tsx scripts/add-expense-sealed-pdf.ts       # Migration prod : colonnes de scellement des notes de frais
npx tsx scripts/add-expense-pending-receipts.ts # Migration prod : dépôt transitoire des justificatifs (pré-scellement)
npx tsx scripts/add-expense-budgets.ts          # Migration prod : budgets analytiques (dry-run ; --apply pour écrire)
npx tsx scripts/add-vehicle-transmission.ts     # Migration prod : colonne Vehicle.transmission (boîte de vitesses)
npx tsx scripts/add-stock-qr-token.ts           # Migration prod : colonne InvStockList.qrToken + index unique (dry-run ; --apply pour écrire)
npx tsx scripts/add-ul-qr-token.ts              # Migration prod : colonne UniteLocale.qrToken + index unique partiel (dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.14.0 : sans la colonne, /api/ul/[id]/qr-token et /api/qr-ul/[token] répondent 500
npx tsx scripts/add-mission-report-dt-code.ts   # Migration prod : colonne mission_reports.dt_code (rattachement DT ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.12.0 : sans la colonne, chaque POST /api/missions répond 500
npx tsx scripts/add-mission-report-interventions.ts # Migration prod : table mission_report_interventions (répartition par type et par nature ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.13.0 : sans la table, chaque POST /api/missions avec au moins une intervention répond 500
npx tsx scripts/add-uniforms.ts                 # Migration prod : module Uniformes (tables UniformItem/UniformSize/UniformLoanBatch/UniformLoan, colonne UniteLocale.uniformQrToken + index unique partiel, MenuSetting `uniforms` ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.16.0 : sans les tables, /api/uniforms/* et /api/qr-uniforms/* répondent 500
npx tsx scripts/update-menu-settings.ts         # Migration prod : MenuSetting accepte la visibilité « super_admin_only » (reconstruction de la table) + ligne `expenses` (menu Frais) ; dry-run ; --apply pour écrire — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.16.0 : sans elle, choisir « Super admin uniquement » répond 500
npx tsx scripts/add-vehicle-guide.ts           # Migration prod : colonnes Vehicle.guideR2Key / guideFileName / guideSize / guideUpdatedAt (guide de vérification PDF ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.17.0 : sans les colonnes, /api/vehicles/[id]/guide et /api/qr/[token]/guide répondent 500 (dépôt, lecture et retrait du guide impossibles)
npx tsx scripts/add-vehicle-photo.ts           # Migration prod : colonnes Vehicle.photoR2Key / photoUpdatedAt (photo du véhicule ; idempotente ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.43.0 : sans les colonnes, /api/vehicles/[id]/photo et /api/qr/[token]/photo répondent 500, ainsi que la suppression d'un véhicule
npx tsx scripts/add-vehicle-documents.ts       # Migration prod : table VehicleDocument + index vehicleId (documents PDF liés au véhicule, plusieurs par véhicule) et reprise de chaque guide existant (Vehicle.guide*) comme premier document, sans toucher à l'objet R2 ni aux colonnes guide* ; idempotente, écriture atomique ; dry-run ; --apply pour écrire puis vérifier — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.44.0 : sans la table, /api/vehicles/[id]/documents*, /api/qr/[token]/documents/* et les fiches véhicule (GET /api/vehicles/[id], GET /api/qr/[token]/vehicle) répondent 500 ; relançable après le déploiement pour rattraper un guide déposé entre migration et bascule
npx tsx scripts/add-referentiel.ts             # Migration prod : tables Referentiel / ReferentielPage + index FTS5 ReferentielFts (chatbot du référentiel secourisme ; teste FTS5 ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.18.0 : sans les tables, /api/referentiel/* répondent 500 (chatbot et import inutilisables)
npx tsx scripts/add-audit-log.ts               # Migration prod : table AuditLog + index (journal d'audit, rétention 30 jours purgée par le cron quotidien ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.20.0 : sans la table, l'onglet « Journal d'audit » (/api/audit-logs) répond 500 et aucune action n'est tracée (les routes, elles, répondent normalement)
npx tsx scripts/add-seasonal-themes.ts       # Migration prod : tables SeasonalTheme et SeasonalThemeUL (thèmes saisonniers : activation, plage de dates et UL ciblées ; idempotente, ne crée que les tables manquantes ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.21.0 : sans les tables, /api/themes/active et /api/settings/themes* répondent 500 (onglet « Thèmes » inutilisable, aucun habillage)
npx tsx scripts/add-vehicle-desinf-interval.ts # Migration prod : colonne Vehicle.desinfIntervalMonths (périodicité de désinfection VPSP, 1/2/3 mois, défaut 3) + recalcul de nextDesinfMaxDate en lastDesinfDate + 3 mois (dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.26.0 : sans la colonne, les check-in de désinfection et la modale d'édition véhicule répondent 500
npx tsx scripts/add-push-subscriptions.ts      # Migration prod : table PushSubscription + index userId (abonnements Web Push ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.27.0 : sans la table, POST /api/push/subscriptions répond 500 et aucun push n'est envoyé (l'in-app continue de fonctionner)
npx web-push generate-vapid-keys                # Génère la paire de clés VAPID → VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY (+ VAPID_SUBJECT=mailto:…) dans les variables d'environnement Vercel
npx tsx scripts/add-scheduled-alerts.ts        # Migration prod : table ScheduledAlert (mémoire des alertes d'échéance quotidiennes : désinfection VPSP, péremption et stock minimum ; idempotente ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.29.0 : sans la table, /api/cron/daily-alerts répond 500 et n'envoie aucune notification
npx tsx scripts/add-expense-respo-step.ts      # Migration prod : étape « responsable d'activité » des notes de frais (colonnes ExpenseReport.workflowVersion DEFAULT 1 / respoValidatedAt / respoValidatedBy / respoSignature + ligne Role RESPO ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.30.0 : sans les colonnes, la liste, le détail, la soumission et la validation des notes de frais répondent 500 ; le script liste aussi les comptes portant encore l'ancien rôle RESPO (ils deviendraient valideurs)
npx tsx scripts/add-resp-vehicule-role.ts      # Migration prod : rôle RESP_VEHICULE (responsable véhicule) — ligne Role `role-resp_vehicule`, ajout de RESP_VEHICULE aux UserRole et aux CSV UserUL.roles de chaque porteur de CADRE, sans jamais retirer CADRE ; liste les comptes et UL concernés ; dry-run ; --apply pour écrire puis vérifier — À EXÉCUTER AVANT OU AU MOMENT DU DÉPLOIEMENT de la v5.33.0 : sans elle, les notifications véhicule qui visaient les cadres ne partent plus qu'aux présidents et aux admins, et les cadres perdent la mise à jour du kilométrage et la régénération du QR des véhicules
npx tsx scripts/add-resp-inventaire-role.ts    # Migration prod : ligne Role `role-resp_inventaire` (rôle RESP_INVENTAIRE, responsable inventaire) ; n'attribue le rôle à personne, signale les autres rôles gérables absents ; dry-run ; --apply pour écrire puis vérifier — À EXÉCUTER AVANT OU AU MOMENT DU DÉPLOIEMENT de la v5.37.0 : sans elle, le rôle n'est pas proposé dans Gestion des utilisateurs (aucune route ne crée de ligne Role)
npx tsx scripts/add-mission-report-edits.ts      # Migration prod : colonnes mission_reports.volunteer_accident / volunteer_accident_details (accident bénévole), table mission_report_edits + index report_id (historique des modifications des comptes rendus, persistant et non purgé) et ligne Role `role-resp_mission` (RESP_MISSION, attribué à personne) ; idempotente ; dry-run ; --apply pour écrire ; --env <fichier> — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.38.0 : sans les colonnes et la table, la création, la lecture et la modification des comptes rendus répondent 500
npx tsx scripts/add-mcp-tokens.ts              # Migration prod : table McpToken + index userId (jetons d'accès IA du serveur MCP, empreinte SHA-256 seule) et colonne AuditLog.via (marque « MCP · <nom du jeton> » ; dry-run ; --apply pour écrire) — À EXÉCUTER AVANT LE DÉPLOIEMENT de la v5.35.0 : sans la table, /api/mcp et /api/mcp-tokens répondent 500 ; sans la colonne, le journal d'audit répond 500 et plus rien n'est tracé
npm run mcp:catalog                            # Régénère src/lib/mcp/catalog.generated.ts (routes appelables par l'outil api_request du serveur MCP) — après tout ajout/retrait/renommage de route API, sinon le test mcp-catalog échoue
turso db create crf-demo && turso db tokens create crf-demo  # Base démo partagée (une fois) → TURSO_DEMO_DATABASE_URL / TURSO_DEMO_AUTH_TOKEN dans Vercel ; recopiée depuis la prod chaque nuit à 23h59 en fin de /api/cron/daily-mileage-check. Un SUPER_ADMIN peut aussi la recopier depuis la page Aide (POST /api/demo/refresh, même code et même verrou que le cron ; table DemoRefreshLock créée à la volée dans la base démo, sans migration). Sans ces variables, le mode démo est masqué. Toute nouvelle route qui écrit hors base (Drive, R2, API externe) doit rejoindre DEMO_EXTERNAL_WRITE_ROUTES (src/lib/demo/readOnly.ts), sauf si elle n'écrit que sur R2 via src/lib/r2.ts (écritures démo rangées sous demo/, comme /api/expenses/upload et /api/media/upload)
npx tsx scripts/verify-signed-pdf.ts <fichier>  # Vérifie les signatures d'un PDF scellé
npx tsx scripts/backfill-signed-pdfs.ts         # Scelle rétroactivement les notes existantes (dry-run par défaut, --apply pour écrire)
npx tsx scripts/move-expense-pdfs-to-ul-folders.ts # Migration prod : range les PDF scellés par UL sur R2 (révisions sous ndf-revisions/<slug UL>/, base repointée, copie publiée ndf/<slug UL>/<demandeur>-<horodatage>-<4 premiers car. alphanumériques de l'id>/note-de-frais.pdf, horodatage = createdAt de la note ; idempotente ; dry-run ; --apply pour écrire ; --delete-old (avec --apply) supprime les anciennes clés, dont l'ancienne copie publiée ndf/<slug UL>/<id>.pdf et toute copie de la note sous un ancien nom de demandeur (repérée par <horodatage>-<id4>) ; --env <fichier>) — À EXÉCUTER APRÈS LE DÉPLOIEMENT de la v5.47.0, puis DE NOUVEAU APRÈS CELUI DE LA v5.48.0 (nouvelle clé des copies publiées) ; la synchro Drive (Apps Script) doit suivre R2_PREFIX = ndf/
npx tsx scripts/move-r2-objects-to-ul-folders.ts  # Migration prod : range par UL les objets R2 qui ne l'étaient pas (Vehicle.photoR2Key → vehicle-photos/<slug UL>/<nom véhicule>/, VehicleDocument.r2Key → vehicle-documents/<slug UL>/<nom véhicule>/ avec Vehicle.guideR2Key égal repointé dans la même transaction, pendingReceiptKeys des brouillons → expenses-staging/<slug UL>/<stagingId>/) ; copie → UPDATE gardé → suppression ; idempotente (slug ou nom de véhicule renommé regroupé au passage suivant) ; dry-run ; --apply pour écrire (journal JSONL scripts/out/r2-relocation-*.jsonl) ; --delete-old (avec --apply) supprime les anciennes clés ; --env <fichier> ; sortie 1 échec / 2 ligne sautée — À EXÉCUTER APRÈS LE DÉPLOIEMENT de la v5.49.0 (une ancienne clé expenses-staging/<x>/… reste acceptée tant qu'elle figure dans les pendingReceiptKeys de sa note) ; À RELANCER après le renommage d'un véhicule ou d'un slug d'UL et après le passage d'un véhicule dans une autre UL (aucun déplacement automatique : les fichiers restent sous l'ancien dossier jusqu'au passage suivant) ; le journal JSONL est une trace pour un retour arrière manuel ; après --delete-old, recopier la base démo (page Aide, « Recopier la base démo ») : elle pointe encore vers les anciennes clés
npx tsx scripts/migrate-drive-images-to-r2.ts  # Migration prod : copie sur R2 les photos et rapports signés encore sur Google Drive (Trip.driveFolderId → trip-photos/<slug UL>/<véhicule>-<horodatage>-<xxxx>/emprunt|rendu/, IncidentReport.driveFolderId → incident-photos/…, mission_reports.drive_folder_id → mission-com-photos/…, mission_reports.signed_report_drive_id → mission-report-photo/…/<fichier> ; horodatage = createdTime du dossier Drive) et repointe les colonnes (UPDATE gardé ; un même id Drive, tous types confondus, → un seul groupe ; suffixe et noms dérivés de l'id Drive, le dry-run annonce les clés exactes ; lignes sans UL et dossiers partagés entre UL signalés et sautés ; ids mock-… ignorés) ; justificatifs des notes de frais hors périmètre (restent sur Drive) ; idempotente ; dry-run ; --apply pour écrire ; --delete-old (avec --apply) met les originaux Drive à la corbeille après les UPDATE réussis et seulement si tous leurs fichiers ont été copiés ; journal JSONL scripts/out/drive-migration-<horodatage>.jsonl (une ligne par enregistrement repointé, écrite au fil de l'exécution : table, rowId, ancien id, nouvelle référence, corbeille ; ignoré par git) à chaque --apply ; --env <fichier> ; code de sortie 1 si un échec, 2 si aucun échec mais des lignes sautées (ids Drive restants), 0 sinon — À EXÉCUTER APRÈS LE DÉPLOIEMENT de la v5.48.0 (avant comme après, une référence Drive reste lisible via l'ancien proxy /api/drive/photos)
npx tsx scripts/add-vehicle-connections.ts      # Migration prod : tables BrandCredential / VehicleConnection + reprise du compte MyRenault global (dry-run ; --apply --ul=<id> pour écrire)
npx tsx scripts/verify-vehicle-connections.ts   # Porte de vérification LECTURE SEULE de la migration des connexions véhicule
npx tsx scripts/rewrap-credentials.ts           # Rotation de CREDENTIALS_ENCRYPTION_KEY : re-chiffre les secrets restés sur la clé _PREVIOUS (dry-run ; --apply pour écrire)
```

## Stack & Key Paths

**Stack:** Next.js 16 (App Router) · React 19 · TypeScript · Turso (libSQL/SQLite cloud) · NextAuth v5 · Vercel serverless

- `src/app/` — pages and API routes; `src/app/api/` — REST endpoints
- `src/components/` — shared UI; `src/components/vehicle/` — vehicle-specific
- `src/lib/` — singletons (db, renault, push, drive, email)
- `src/auth.ts` — full auth config; `src/proxy.ts` — route protection

**Database:** Direct SQL via `@libsql/client` — no ORM. Always parameterized: `{ sql: "... WHERE id = ?", args: [id] }`.

**Auth:** Production = Google OAuth2 (`@croix-rouge.fr`). Dev = credentials (`@dev.local`). Roles in JWT.

**Roles & access:** `SUPER_ADMIN, ADMIN, PRESIDENT, TRESORIER, RESPO, CADRE, RESP_VEHICULE, RESP_UNIFORME, RESP_INVENTAIRE, RESP_MISSION, DT, CHVPSP, CHVL, CI/RPAPS, INACTIF` — defined in `src/lib/roles.ts` (`ROLES`, `ROLE_LABELS`). `INACTIF` unconditionally blocks all authorization regardless of other roles held. `RESP_VEHICULE` (responsable véhicule) a sur les véhicules de son UL les droits d'un ADMIN (`canManageVehicles`) et rien d'autre ; `RESP_UNIFORME` (responsable uniforme) a sur les uniformes de son UL les droits d'un ADMIN (`canManageUniforms` : Historique, Emprunts, Gestion, QR) et rien d'autre ; `RESP_INVENTAIRE` (responsable inventaire) a sur l'inventaire de son UL les droits d'un ADMIN (`canManageInventory` : articles, lots, stocks, import CSV, QR) et rien d'autre ; `RESP_MISSION` (responsable mission) a sur les comptes rendus de mission de son UL les droits d'un ADMIN (`canManageMissionReports` : lecture de tous, modification après envoi ; un rapport rattaché à une DT compte pour l'UL de rattachement de son auteur) et reçoit les alertes d'incident (accident bénévole, ACR, hémorragie, PEC complexe, suivi nécessaire), rien d'autre ; CADRE gère les réservations (`canManageReservations`) mais plus les véhicules. Enforced in API routes and UI via `session.user.roles`.

**Styling:** CSS Modules per component + global CSS variables in `app/globals.css`. `next-themes` for dark/light.

**Deployment:** Vercel (auto-deploy on `main`). DB: Turso cloud. Uses `--webpack` (not Turbopack).

## Notifications push (Web Push natif)

Standard W3C (Push API + Notifications API), authentification VAPID (RFC 8292), chiffrement RFC 8291 via la bibliothèque `web-push` — aucun service ni SDK tiers. Service worker : `public/sw.js` (push uniquement, pas de cache). Abonnements : table `PushSubscription` (un par appareil, `endpoint` unique). Envoi : `sendPushNotification({ roles, headings, contents, url, ulId })` dans `src/lib/push.ts` (crée aussi la notification in-app). Variables d'environnement : `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:…`) ; sans elles, l'in-app fonctionne mais aucun push n'est envoyé. iOS : push uniquement en PWA installée (iOS ≥ 16.4). Les abonnés de l'ancien fournisseur ne sont pas migrés : leur navigateur se réabonne automatiquement au prochain chargement si l'autorisation est déjà accordée.

## Serveur MCP (accès IA)

`/api/mcp` (Streamable HTTP sans état, `mcp-handler`) authentifie un jeton personnel `Bearer crf_mcp_…` généré dans Administration → « Accès IA (MCP) » (ADMIN+, pour soi-même, 30/90/365 jours, portée `read` ou `write`). Outils : `whoami`, `list_api_routes`, `api_request`. Le jeton brut n'est accepté **que** par `/api/mcp` : `api_request` rappelle l'API avec une assertion HMAC de 60 s (`AUTH_SECRET`, en-tête `x-crf-mcp-assertion`) que `auth()` (`src/auth.ts`) transforme en session du propriétaire (rôles relus en base, `session.user.mcpTokenName`). Les routes existantes n'ont rien à faire ; `withAudit` marque l'action (`AuditLog.via = 'MCP · <nom>'`). Catalogue des routes : `src/lib/mcp/catalog.generated.ts` (`npm run mcp:catalog`). Origine des appels internes, jamais tirée de la requête quand l'environnement en fournit une (en-tête Host forgé) : `MCP_INTERNAL_ORIGIN`, sinon sur Vercel `https://${VERCEL_PROJECT_PRODUCTION_URL}` en production ou `https://${VERCEL_URL}` ailleurs, et seulement en dernier recours (dev local) l'origine de la requête. Sur les previews protégées, définir `VERCEL_AUTOMATION_BYPASS_SECRET` (Protection Bypass for Automation) : il est envoyé en `x-vercel-protection-bypass` aux appels internes, sans quoi la protection de déploiement les bloque. Appel interne abandonné après 50 s (« Délai dépassé »). Clients pris en charge : ceux qui acceptent un en-tête Authorization (Claude Code, Cursor…) ; Claude Desktop n'accepte que des serveurs locaux dans `claude_desktop_config.json` (sinon « not valid MCP server configurations ») : passer par le pont `npx mcp-remote <url> --header Authorization:${CRF_AUTH_HEADER}` avec l'en-tête dans `env` ; pas les connecteurs web OAuth (claude.ai, ChatGPT).

## Référentiel secourisme (chatbot)

Le PDF (plusieurs centaines de Mo) ne transite jamais par Vercel : le navigateur l'envoie et le lit directement sur R2 via des URL signées (`presignUrl` dans `src/lib/r2.ts`). **Règle CORS à configurer à la main sur le bucket R2 (Cloudflare)**, sans quoi l'import et la liseuse échouent côté navigateur :

- origines : celle de l'appli (prod, preview, `http://localhost:3000`) ;
- méthodes : `GET`, `PUT`, `HEAD` ;
- en-têtes autorisés : `Range`, `Content-Type` ;
- en-têtes exposés : `Accept-Ranges`, `Content-Range`, `Content-Length`, `ETag`.

L'index plein texte est une table FTS5 à contenu externe (`src/lib/referentiel/schema.ts`) : il se reconstruit (`rebuild`) à la bascule d'un import, et après un clonage prod (`dev:prod`).

## Testing

**Rule: every new feature must ship with tests.**
- New API route → integration test: 401, 403, 400 (Zod), happy path
- New lib module → unit tests for all exported functions
- New React component with state/logic → React Testing Library component test

See `src/__tests__/CLAUDE.md` for mocking patterns and request factory.

## Local dev setup

See `/dev-setup` skill or run `npm run dev:setup` then `npm run dev`.

## M-4 (deferred)

Pages are Client Components with `useEffect` data fetching — Server Component migration planned but not started. Don't convert yet.

## Tools

Prefer `mcp__grepai__grepai_search` instead of standard `grep`.

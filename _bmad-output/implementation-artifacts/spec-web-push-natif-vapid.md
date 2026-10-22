---
title: 'Notifications push — Web Push natif (W3C, VAPID) à la place de OneSignal'
type: 'refactor'
created: '2026-10-22'
status: 'done'
baseline_commit: '7644803842f31b14911322cc67d2f169b7de4673'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/__tests__/CLAUDE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Les notifications push passent par OneSignal (SDK client `react-onesignal`, worker chargé depuis le CDN OneSignal, API REST onesignal.com, ciblage par tags) : dépendance à un service tiers, données de ciblage (rôles × UL) confiées à un tiers.

**Approach:** Remplacer par le standard Web Push (Push API + Notifications API, chiffrement RFC 8291, authentification VAPID RFC 8292) : un service worker propre `public/sw.js`, les abonnements stockés dans notre base (table `PushSubscription` rattachée à l'utilisateur), et l'envoi direct depuis le serveur aux utilisateurs déjà calculés par la requête SQL actuelle — plus de tags.

## Boundaries & Constraints

**Always:** Conserver la signature d'appel métier (`sendPushNotification`) et le ciblage actuel (expansion `ADMIN`→ADMIN+SUPER_ADMIN, `RESPO`→PRESIDENT+CADRE, filtrage par UL) ; la notification in-app (table `Notification`) reste créée exactement comme aujourd'hui ; un échec d'envoi push ne fait jamais échouer la route appelante ; un abonnement répondant 404/410 est supprimé ; clés VAPID uniquement en variables d'environnement (`VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`) — sans elles, aucun push n'est envoyé (warn) mais l'in-app fonctionne ; le clic sur la notification ouvre/focalise l'URL avec `fromPush=true` (nettoyage déjà géré par `NotificationBell`).

**Never:** Aucun SDK, CDN ou API d'un fournisseur de notifications (OneSignal, Firebase SDK, etc.) — seuls les services push des navigateurs, inhérents au standard, reçoivent les messages chiffrés ; pas de cache hors ligne ni de logique PWA dans le service worker ; pas de migration des abonnés OneSignal (impossible : les abonnements sont liés au worker OneSignal).

**Décisions :**
- *Invite d'autorisation* : réabonnement silencieux si l'autorisation est déjà accordée (utilisateurs actuels) ; sinon bandeau discret « Activer les notifications » [Activer] [Plus tard] — « Plus tard » le masque 30 jours (préférence locale au navigateur) — en plus de l'interrupteur de la cloche. Jamais d'appel à `requestPermission()` hors geste utilisateur. Bandeau non affiché si le navigateur ne supporte pas le push ou si l'autorisation est refusée.
- *Déconnexion* : l'abonnement de l'appareil est supprimé (navigateur + base) avant la déconnexion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Envoi ciblé | rôle `ADMIN`, 2 admins dont 1 avec 2 appareils abonnés | 2 lignes `Notification`, 3 envois Web Push (payload `{title, body, url}`) | N/A |
| Abonnement expiré | push service répond 410/404 | ligne `PushSubscription` supprimée | autres envois poursuivis |
| Erreur push autre | 500 / réseau | log `console.error`, retour `true` si l'in-app a réussi | jamais d'exception remontée |
| VAPID absent | env vars manquantes | in-app créée, aucun envoi, `console.warn` | N/A |
| Ré-abonnement même navigateur | POST même `endpoint`, autre utilisateur connecté | ligne réattribuée au nouvel utilisateur (upsert sur endpoint) | N/A |
| POST invalide | body sans `keys.p256dh` | 400 | Zod |

</frozen-after-approval>

## Code Map

- `src/lib/onesignal.ts` -- `sendPushNotification({tags, headings, contents, url, ulId})` : requête SQL des utilisateurs ciblés + insert `Notification` (à garder) puis POST onesignal.com (à remplacer).
- Appelants (import `@/lib/onesignal`, souvent lazy) : `api/expenses/route.ts`, `api/expenses/[id]/route.ts`, `api/vehicles/[id]/metrics/route.ts`, `api/vehicles/[id]/reservations/route.ts`, `api/trips/route.ts`, `api/trips/[id]/checkin/route.ts`, `api/cron/daily-mileage-check/route.ts`.
- `src/components/OneSignalProvider.tsx` -- init SDK + tags ; monté dans `src/app/layout.tsx:87-108` (avec `ONESIGNAL_ID`).
- `src/components/NotificationBell.tsx:17-28,125-148` -- interrupteur push via `window.OneSignal` ; logique `fromPush` à garder.
- `public/OneSignalSDKWorker.js` -- worker CDN, à supprimer.
- `src/auth.config.ts:20-24` -- liste des assets publics (ajouter `/sw.js`).
- `next.config.ts:9,48` -- `react-onesignal` dans `transpilePackages`, commentaire OneSignal.
- `src/lib/themes/schema.ts` + `scripts/add-seasonal-themes.ts` -- modèle DDL partagé + migration dry-run/`--apply` ; DDL repris par `scripts/setup-dev.ts` et `src/__tests__/integration/setup.ts`.
- Tests : `integration/onesignal.test.ts`, `components/OneSignalProvider.test.tsx`, ~8 tests qui `vi.mock('@/lib/onesignal')`.
- `src/components/Navbar.tsx` -- `signOut` (désabonner avant).

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- ajouter `web-push` (+ `@types/web-push`), retirer `react-onesignal` -- lib standard VAPID/aes128gcm, pas un service.
- [x] `src/lib/push/schema.ts` + `scripts/add-push-subscriptions.ts` + `setup-dev.ts` + `integration/setup.ts` -- table `PushSubscription(id, userId FK, endpoint UNIQUE, p256dh, auth, userAgent, createdAt, lastSeenAt)` + index userId ; migration dry-run/`--apply`.
- [x] `src/lib/push.ts` (remplace `onesignal.ts`) -- même logique de ciblage/in-app ; signature simplifiée `roles: string[]` au lieu de `tags` ; envoi `webpush.sendNotification` en parallèle (`Promise.allSettled`, TTL 24 h), purge 404/410.
- [x] 7 routes appelantes -- import `@/lib/push`, `roles: [...]`.
- [x] `src/app/api/push/subscriptions/route.ts` -- POST (upsert sur endpoint, Zod) / DELETE (par endpoint, propriétaire uniquement) ; auth requise, INACTIF refusé.
- [x] `public/sw.js` -- `push` → `showNotification(title, {body, icon, data:{url}})` ; `notificationclick` → focus onglet existant ou `openWindow(url + fromPush=true)`.
- [x] `src/components/PushProvider.tsx` (remplace `OneSignalProvider`) + `src/lib/push/client.ts` -- enregistre `/sw.js`, désenregistre l'ancien worker OneSignal, (ré)abonne via `pushManager.subscribe({userVisibleOnly, applicationServerKey})`, expose `subscribe/unsubscribe/status` ; bandeau d'invitation (cf. Décisions).
- [x] `NotificationBell.tsx`, `layout.tsx`, `auth.config.ts`, `next.config.ts`, `Navbar.tsx` (désabonnement avant `signOut`) -- rebrancher.
- [x] Tests -- `integration/push.test.ts` (matrice ci-dessus, `web-push` mocké), `integration/push-subscriptions.test.ts` (401/403/400/200/DELETE d'un autre utilisateur), `components/PushProvider.test.tsx` ; mettre à jour les mocks existants ; supprimer les tests OneSignal.
- [x] Docs -- `CLAUDE.md` (migration + génération des clés `npx web-push generate-vapid-keys`), AGENTS.md/CLAUDE.md mentionnant `onesignal`, `CHANGELOG.md`, version.

**Acceptance Criteria:**
- Given un utilisateur ayant déjà autorisé les notifications, when il charge l'appli après déploiement, then son navigateur est abonné via `/sw.js` sans nouvelle invite et l'ancien worker OneSignal est désenregistré.
- Given l'interrupteur de la cloche, when l'utilisateur le désactive, then l'abonnement est supprimé côté navigateur et en base.
- Given le code livré, when on cherche `onesignal` (insensible à la casse) dans `src/`, `public/`, `package.json`, then aucune occurrence.

## Design Notes

`web-push` n'est qu'une bibliothèque (signature JWT VAPID + chiffrement du payload) ; les messages transitent par le service push du navigateur (FCM pour Chrome, Mozilla autopush, APNs web pour Safari) — c'est le fonctionnement normal du standard, sans compte ni SDK. iOS : push uniquement en PWA installée (iOS ≥ 16.4), comme aujourd'hui.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert
- `npm run build` -- succès

**Manual checks (if no CLI):**
- En dev (localhost est un contexte sécurisé) : activer via la cloche, déclencher une réservation, recevoir la notification, cliquer → page ouverte et notification in-app retirée.

---
title: 'Notifications — sans doublons, liens relatifs, et nouvelles notifications au demandeur et aux responsables'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_commit: 'e2ab33bd7817f46e7d3c74c421cf8f13d6f77c6b'
route: 'dispatch'
review_loop_iteration: 0
context: ['{project-root}/src/__tests__/CLAUDE.md']
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Un même événement envoie deux fois la même notification à qui cumule les rôles ciblés (réservations : ADMIN puis RESPO) ; les liens pointent en dur vers la prod (`https://cr-chauffeur.vercel.app`), donc vers la mauvaise appli depuis preview/local ; et le demandeur n'est prévenu par push d'aucune décision le concernant (réservation, note de frais), ni les responsables d'un incident déclaré.

**Approach:** Un envoi par événement, chaque utilisateur au plus une fois ; liens relatifs ; une fonction d'envoi à des utilisateurs nommés (in-app + push), utilisée pour notifier le demandeur des décisions et les responsables des incidents.

## Boundaries & Constraints

**Décisions :**
- *Doublons* : un seul appel par événement (`roles: ['ADMIN', 'RESPO']`) ; si un même événement vise à la fois des utilisateurs nommés et des rôles, chaque utilisateur ne reçoit qu'une notification.
- *Auteur de l'action* : on ne notifie jamais l'utilisateur de sa propre action (ex. un responsable qui valide ou supprime sa propre réservation).
- *Réservation refusée* : il n'existe pas de statut « refusé » ; la suppression d'une réservation (ou d'une récurrence) par un autre que son demandeur vaut refus/annulation et le notifie (« ❌ Réservation annulée », véhicule + dates). Rien si la réservation est terminée, ni pour une réservation « Chauffeur non décidé ».
- *Réservation validée* : la notification existante (in-app seule) part aussi en push ; idem pour la récurrence.
- *Notes de frais* : le demandeur est notifié à chaque décision — validée (« validée » ou « validée, en attente de paiement »), payée, refusée (avec le motif `rejectionComment`).
- *Incident* : au passage à `SUBMITTED` (création directe ou PATCH depuis `DRAFT`, une seule fois), les Responsables (PRESIDENT + CADRE) de l'UL du véhicule sont notifiés ; type « accident » ou « amende flash » et véhicule, **sans le nom de l'auteur** (anonymat des déclarations).

**Always:** in-app + push pour chaque notification ; un échec de notification ne fait jamais échouer la route ; liens relatifs (`/vehicles/<nom encodé>`, `/expenses`), jamais d'hôte absolu.

**Never:** alertes d'échéance du cron (désinfection, stock — PR suivante) ; rappel de réservation ; nouveau statut de réservation ; page d'incident dédiée.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Cumul de rôles | demande de réservation ; un utilisateur SUPER_ADMIN + PRESIDENT | 1 notification in-app, 1 push par appareil | N/A |
| Validation de sa propre réservation | validateur = demandeur | aucune notification au demandeur | N/A |
| Suppression par un responsable | réservation future d'un autre | demandeur notifié « annulée » | N/A |
| Suppression par le demandeur | il supprime la sienne | aucune notification | N/A |
| Suppression d'une réservation terminée ou « Chauffeur non décidé » | — | aucune notification | N/A |
| Note refusée | `reject` + motif | demandeur notifié avec le motif | N/A |
| Incident soumis deux fois | PATCH `SUBMITTED` sur un incident déjà `SUBMITTED` | aucune nouvelle notification | N/A |
| Demandeur introuvable | email sans compte `User` | rien envoyé, route en succès | log |

</frozen-after-approval>

## Code Map

- `src/lib/push.ts` -- `sendPushNotification({roles,…})` (ciblage SQL + INSERT `Notification` l.97-105 + `deliverWebPush` interne l.120, déjà par userIds). Ajouter un export `notifyUsers`, et un paramètre optionnel d'utilisateurs nommés / d'exclusion de l'auteur pour dédoublonner.
- `src/app/api/vehicles/[id]/reservations/route.ts:253-272,379-401` -- double envoi ADMIN puis RESPO ; URL en dur.
- `src/app/api/reservations/[id]/route.ts` -- DELETE l.7-52 (SELECT ne lit que `userEmail` l.20 : ajouter vehicleId, startTime, endTime, userName) ; validation l.201-268 (INSERT direct l.252-262, URL en dur l.259 ; demandeur = `User` par `userEmail`, UL via Vehicle).
- `src/app/api/reservations/recurrence/[groupId]/route.ts` -- DELETE l.14-73 (aucune donnée véhicule lue) ; PATCH validation l.81-206 (INSERT direct l.176-193, URL l.186).
- `src/lib/reservationDriver.ts:13` -- `UNASSIGNED_DRIVER_NAME`.
- `src/app/api/expenses/[id]/route.ts` -- `patchHandler` : validate l.236-295 (statut `en_attente_paiement` ou `traité` l.247 ; push TRESORIER existant), reject l.296-341 (`rejectionComment`), pay l.342-377 ; `report.userId`, `report.ulId` disponibles (SELECT l.209-217).
- `src/app/api/incidents/route.ts:28-81` (POST, statut possible `SUBMITTED`) et `src/app/api/incidents/[id]/route.ts:101-168` (PATCH ; lire `status` avant mise à jour, `type`/`vehicleId` après) ; UL via `Vehicle.ulId` ; types `ACCIDENT` | `FLASH`.
- URL en dur aussi : `vehicles/[id]/metrics/route.ts:104`, `trips/route.ts:262,284`, `trips/[id]/checkin/route.ts:244`, `cron/daily-mileage-check/route.ts:116`. Ne pas toucher `src/app/mentions-legales/page.tsx:34`.
- Tests : `integration/reservations.test.ts` (mock `@/lib/push` l.30, à étendre), `integration/expenses.test.ts` et `integration/incidents.test.ts` (push réel sur DB de test, VAPID absent), `integration/push.test.ts`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/push.ts` -- export `notifyUsers({userIds, title, message, url, ulId, excludeUserId?})` (INSERT in-app + push, ids dédoublonnés) ; `sendPushNotification` accepte `excludeUserId?` ; mutualiser l'INSERT -- base commune.
- [x] `src/app/api/vehicles/[id]/reservations/route.ts` -- fusion en un appel `['ADMIN','RESPO']` (simple et récurrent), URL relative.
- [x] `src/app/api/reservations/[id]/route.ts` + `recurrence/[groupId]/route.ts` -- validation via `notifyUsers` (in-app + push, auteur exclu) ; notification d'annulation sur DELETE par un tiers (cf. Décisions).
- [x] `src/app/api/expenses/[id]/route.ts` -- notifier le demandeur sur validate / pay / reject (auteur exclu).
- [x] `src/app/api/incidents/route.ts` + `[id]/route.ts` -- notifier les Responsables au passage à `SUBMITTED`.
- [x] metrics, trips, checkin, cron daily-mileage-check -- URL relatives encodées.
- [x] Tests -- `push.test.ts` (`notifyUsers`, dédoublonnage, exclusion) ; matrice ci-dessus dans `reservations.test.ts`, `expenses.test.ts`, `incidents.test.ts` (assertions sur lignes `Notification`) ; un test vérifiant l'absence de `cr-chauffeur.vercel.app` dans les `url` créées.
- [x] `CHANGELOG.md` (5.28.0, orienté utilisateur), `package.json` + lock, AGENTS.md concernés.

**Acceptance Criteria:**
- Given le code livré, when on cherche `cr-chauffeur.vercel.app` dans `src/app/api`, then aucune occurrence.
- Given un responsable valide la note de frais d'un bénévole sans remboursement, when la validation réussit, then le bénévole a une notification « validée » et aucune « à payer » n'est créée pour le trésorier.

## Verification

**Commands:**
- `npm run lint` -- 0 erreur, 0 avertissement
- `npm run test` -- vert
- `npm run build` -- succès

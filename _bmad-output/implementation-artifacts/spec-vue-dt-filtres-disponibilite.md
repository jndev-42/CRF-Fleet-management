---
title: 'Vue DT — filtres de disponibilité et de type, à l''instant T ou sur une période'
type: 'feature'
created: '2026-10-02'
status: 'done'
baseline_commit: '47651dba68366104c430e20e2331ba4f4460d718'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-Martine-2026-10-02/EXPERIENCE.md'
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** En Vue DT (dashboard logistique de la Direction Territoriale), le cadre ne peut filtrer que par statut à l'instant présent : impossible de répondre à « quels VPSP sont libres samedi 8h-20h, et dans quelles UL ? ».

**Approach:** En Vue DT, un panneau de filtres remplace la barre statut : temporalité `Maintenant` | `Période` (début/fin + raccourcis), puces Disponibilité et Type (multi-sélection, compteurs à facettes). Le serveur calcule une disponibilité par véhicule sur la fenêtre demandée ; l'état des filtres vit dans l'URL. UX de référence : EXPERIENCE.md (context) — **les décisions ci-dessous l'emportent sur lui en cas de conflit**.

**Décisions (humain) :**
- Cinq statuts seulement, pas de « Partiellement disponible » : `Disponible`, `Potentiellement disponible`, `Réservé`, `En mission`, `Maintenance`. Priorité : Maintenance > En mission > Réservé > Potentiellement disponible > Disponible.
- Une réservation `PENDING` **ou** `VALIDATED` chevauchant la fenêtre → `Réservé` (ni dispo ni indispo : la DT peut réquisitionner). La carte affiche pour chaque réservation : créneau, réservant (`userName`), statut « en attente » / « validée », et motif.
- Trajet en cours (`checkInAt IS NULL`) : si la fenêtre inclut maintenant (mode Maintenant ou période entamée) → `En mission` ; si la période est entièrement future → `Potentiellement disponible` avec la mention « en mission depuis le JJ/MM/AAAA » (date de `checkOutAt`).
- Maintenance chevauchant la fenêtre (même partiellement ; `endDate` NULL = sans fin ; date sans heure = journée entière) → `Maintenance`.
- Période passée (fin ≤ maintenant) refusée : message + lien « Revenir à Maintenant ». Période entamée : calcul à partir de maintenant, signalé dans la phrase de synthèse.
- Périmètre : **hors** cette livraison — « Regrouper par UL » et synchronisation du calendrier avec les filtres. Pas de localStorage (URL seule).

## Boundaries & Constraints

**Always:** Vue DT reste en lecture seule. Requêtes SQL paramétrées. Rôle DT (`hasDTRole`) + `dtCode` exigés comme aujourd'hui. Statut jamais porté par la seule couleur (libellé + icône). Fuseau du navigateur ; l'URL et l'API portent des dates absolues ISO.

**Never:** Ne pas modifier la Vue UL (barre Tous/🟢/🟡/🔴, `FleetStatsRow`, cartes inchangées hors Vue DT). Pas de nouvelle table ni migration. Pas de nouveau token CSS (variantes de badge composées de variables existantes). Ne pas toucher `computeEffectiveStatus` ni `fleetStats.ts` (utilisés par la Vue UL).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Maintenant | `view=dt`, sans `from`/`to` | chaque véhicule porte `availability` calculée sur l'instant présent | N/A |
| Période future | `from`/`to` futurs, résa PENDING chevauchante | `RESERVED` + liste des résas (créneau, réservant, statut, motif) | N/A |
| Trajet ouvert, période future | trip sans checkIn, `from` > now | `POTENTIAL`, `missionSince` = checkOutAt | N/A |
| Période entamée | `from` < now < `to`, trip ouvert | fenêtre effective [now, to] → `IN_USE` | N/A |
| Maintenance + résa | les deux chevauchent | `MAINTENANCE` (priorité) | N/A |
| Paramètres invalides | `from` seul, `to` ≤ `from`, `to` ≤ now, > 31 jours, date non ISO | — | 400 `{ error }` en français |
| Hors DT | `from`/`to` sans `view=dt` | paramètres ignorés, réponse actuelle inchangée | N/A |

</frozen-after-approval>

## Code Map

- `src/app/api/vehicles/route.ts` -- GET liste ; branche `isDtView` (l.48-74) à étendre : parse Zod `from`/`to`, 3 requêtes groupées (réservations, maintenances, trajets ouverts) sur les véhicules de la DT, ajout du champ `availability`. Reprendre la comparaison de dates « jour vs ISO » des maintenances (l.91-100).
- `src/app/api/vehicles/calendar/route.ts` -- modèle de requêtes par fenêtre sur `Reservation`/`Trip`/`VehicleMaintenance` (ne pas modifier).
- Chevauchement de réservation de référence : `startTime < fin AND endTime > début` (`src/app/api/vehicles/[id]/reservations/route.ts:202`).
- `src/app/vehicles/page.tsx` -- 409 lignes ; `isDtView` en state local, barre de filtres l.205-221, carte l.254-393. Brancher le panneau en Vue DT uniquement ; extraire la logique dans un hook (règle `src/app/CLAUDE.md` : page < ~150 lignes).
- `src/app/vehicles/types.ts` -- `DashboardVehicle` : ajouter `availability?` optionnel.
- `src/app/vehicles/FleetStatsRow.tsx` -- réutiliser en Vue DT avec des compteurs issus de `availability` (filtrés par Type, pas par Disponibilité).
- `src/app/globals.css` -- `.filters-bar`, `.filter-btn`, `.status-badge`, variables `--status-*` à réutiliser.
- `src/__tests__/integration/dt-view.test.ts` -- patterns de mock auth/db et seed DT à étendre.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/dtAvailability.ts` -- fonctions pures : `computeVehicleAvailability({ reservations, maintenances, openTrip, windowStart, windowEnd, now })` → `{ status, missionSince, reservations }` selon les décisions ; `parseDtWindow(from, to, now)` (Zod, règles 400 de la matrice, fenêtre effective tronquée à now) ; `normalizeVehicleType`. -- règle métier testable isolément.
- [x] `src/__tests__/unit/dtAvailability.test.ts` -- chaque ligne de la matrice + priorités + maintenance date seule / sans fin + bornes exactes (fin d'une résa = début de fenêtre → pas de chevauchement).
- [x] `src/app/api/vehicles/route.ts` -- en Vue DT, ajouter `availability` à chaque véhicule (fenêtre = now si pas de `from`/`to`) ; 400 sur paramètres invalides. -- source unique de vérité.
- [x] `src/__tests__/integration/dt-view.test.ts` -- 401, 403 (non-DT), 400 (chaque cas invalide), happy paths Maintenant / Période (RESERVED avec motif, POTENTIAL avec missionSince, MAINTENANCE).
- [x] `src/app/vehicles/useDtFilters.ts` -- état des filtres ↔ URL (`vue=dt`, `quand`, `debut`, `fin`, `dispo`, `type`) via `useSearchParams` + `router.replace`, valeurs invalides ignorées, défauts omis ; refetch anti-rebond 400 ms sur changement de période ; filtrage et compteurs à facettes côté client. Envelopper la page dans `<Suspense>` si le build l'exige.
- [x] `src/app/vehicles/DtFilterPanel.tsx` (+ `DtFilterPanel.module.css`) -- Quand (radiogroup), champs `datetime-local` pas de 15 min, raccourcis Aujourd'hui / Demain / Ce week-end / 7 prochains jours, préremplissage demain 08:00→20:00, puces avec compteurs (`aria-pressed`, `fieldset`/`legend`), « Réinitialiser », phrase de synthèse `aria-live`, erreurs de période, repli « Filtres · N actifs » < 640 px.
- [x] `src/__tests__/components/DtFilterPanel.test.tsx` -- bascule de mode, raccourcis, puces OU/ET, erreur fin ≤ début, période passée.
- [x] `src/app/vehicles/page.tsx` + composant carte extrait si utile -- Vue DT : panneau à la place de la barre statut, badge selon `availability`, bloc réservations pour `Réservé`, mention « en mission depuis le JJ/MM/AAAA », états vide / erreur + Réessayer / chargement atténué (`aria-busy`). Vue UL inchangée.
- [x] `package.json`, `package-lock.json`, `CHANGELOG.md` -- version mineure + entrée française orientée utilisateur.

**Acceptance Criteria:**
- Given un cadre DT en Vue DT, when il choisit « Période » samedi 08:00-20:00 et la puce Type « VPSP » + Disponibilité « Disponible », then seuls les VPSP sans réservation, maintenance ni trajet en cours bloquant sur la fenêtre s'affichent, avec leur UL.
- Given des filtres actifs, when l'URL est copiée et ouverte par un autre cadre DT, then le même état de filtres est restauré.
- Given un utilisateur en Vue UL, when il charge la page, then l'affichage et la barre Tous/🟢/🟡/🔴 sont identiques à avant.
- Given aucune correspondance, when les filtres sont appliqués, then « Aucun véhicule ne correspond. » s'affiche avec les filtres actifs retirables un à un.

## Implementation Notes

- Trajet ouvert repris de la jointure `Trip` existante de la liste : 2 requêtes groupées (réservations, maintenances) au lieu de 3.
- Maintenances en date seule : bornes « jour UTC », même convention que la jointure historique de la liste (écart possible de 1-2 h autour de minuit Paris).
- Types hors liste connue affichés en majuscules pour regrouper les variantes de casse.
- La bascule Vue UL / Vue DT passe de l'état local à `vue=dt` dans l'URL ; fetch extrait dans `useFleetVehicles` (réponses périmées ignorées), carte dans `VehicleCard`.
- Non faits (hors tâches) : tuiles FleetStatsRow cliquables, libellés de tuiles spécifiques au mode Période, tri par statut.
- Libellé aligné sur la demande humaine : « En mission depuis le JJ/MM/AAAA » (suffixe « — retour non saisi » retiré).
- Vérifié : lint 0/0, `tsc` OK, 3 fichiers de tests ciblés 79/79, suite complète et build OK (rapport d'implémentation).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Preuve | Route |
|---|---|---|---|---|---|
| 1 | edge | `Vehicle.status` IN_USE sans Trip ouvert → DT « Disponible » | maybe-false | Le check-out crée toujours un Trip ; il faudrait des données incohérentes en base pour l'atteindre. Ce serait au plus low. | rejeté |
| 2 | edge | Trip ouvert à `checkOutAt` NULL → AVAILABLE | false | `Trip.checkOutAt` est `NOT NULL DEFAULT CURRENT_TIMESTAMP` (setup-dev.ts:205). | rejeté |
| 3 | edge | `checkOutAt` illisible → « Invalid Date » | false | Colonne non nulle, écrite en ISO par toutes les routes de check-out. | rejeté |
| 4 | edge | Date de résa/maintenance illisible → ignorée | low | Seule l'appli écrit ces dates, et en ISO ; le cas est improbable et un garde ajouterait une branche. | rejeté |
| 5 | edge+blind | Période qui devient passée page ouverte → 400 générique + Réessayer | false | `periodCheck` est recalculé à chaque rendu (new Date()) : le clic sur Réessayer re-rend et bascule sur le message PAST. | rejeté |
| 6 | edge | URL initiale à période invalide → `loading` bloqué à true | low | `useFleetVehicles` sort tôt sans `setLoading(false)` ; les sections Quick reçoivent loading=true. | patch |
| 7 | edge | UL→DT : 1er rendu affiche les véhicules UL comme cartes DT « Disponible » + compte UL dans le titre | low | `dtInitialLoading` exige `loading`, qui est encore false au 1er rendu ; le titre utilise `vehicles.length`. | patch |
| 8 | blind | Changement d'UL en Vue DT : l'ancienne DT reste affichée atténuée, compteurs compris | low | `loadedView` reste 'dt' : pas de squelettes. | patch |
| 9 | edge | Raccourcis finissant à 23:59 incompatibles avec `step=900` | low | La valeur 23:59 n'est pas un multiple de 15 min : l'input passe :invalid et les flèches du navigateur la décalent. | patch |
| 10 | edge | « 7 prochains jours » décalé d'1 h au changement d'heure ; « Aujourd'hui » après 23:59 | low | `start + 7*24h` ignore l'heure d'été/hiver (réel, correction directe) ; le cas 23:59 est négligeable. | patch (DST seul) |
| 11 | edge | Réponse non JSON → message SyntaxError | low | Motif `res.json()` déjà présent avant le changement. | rejeté |
| 12 | blind | Télémétrie Renault re-demandée pour toute la DT à chaque changement de période | medium | `fetchVehicles` dépend de `windowFrom/windowTo` et relance `/api/renault/{vin}` pour chaque véhicule connecté. | patch |
| 13 | blind | Maintenances « date seule » en jour UTC (00:00–02:00 Paris) | low | Convention de stockage préexistante (maintenance-events écrit `T00:00:00.000Z` / `T23:59:59.999Z`) ; non causée par ce changement. | rejeté |
| 14 | blind | Réservations masquées sur les cartes Maintenance / En mission | low | La carte n'affiche le bloc que si RESERVED, alors que l'API renvoie les résas chevauchantes pour tous les statuts ; l'intention dit « pour chaque réservation ». | patch |
| 15 | blind | Mode Maintenant jamais rafraîchi, pas d'alerte de résa imminente | low | Comportement identique en Vue UL (préexistant) ; une alerte serait une nouvelle fonctionnalité. | rejeté |
| 16 | blind | TOO_LONG mesuré avant la troncature d'une période entamée | low | `parseDtWindow` teste `end - start` avant de ramener `start` à maintenant ; un lien partagé ancien mais encore valide est refusé. | patch |
| 17 | blind | « lien partageable pour un autre cadre DT » : la DT n'est pas dans l'URL | low | La vue dépend de l'UL active du destinataire ; le CHANGELOG promet plus que ce qui est livré. | patch (libellé CHANGELOG) |
| 18 | blind | Filtres perdus via « ← Retour au dashboard » de la fiche véhicule | low | Lien de retour préexistant vers `/` ; le bouton Précédent du navigateur conserve les filtres. Corriger demanderait de faire transiter les paramètres. | rejeté |
| 19 | blind | Tuiles DT dont la somme ≠ Total (Réservé / Potentiel sans tuile) | low | Les tuiles propres au mode Période ont été écartées à l'implémentation ; c'est une évolution UX. | defer |
| 20 | blind | `package-lock.json` non synchronisé | false | `package-lock.json` est bien en 5.19.0 (l.3 et l.9) ; il était seulement exclu du diff de revue. | rejeté |
| 21 | verif | Branche ISO du préfiltre SQL des maintenances jamais testée (format de prod) | medium | Les maintenances seedées en intégration sont en date seule ou NULL ; la prod écrit de l'ISO. | patch |
| 22 | verif+blind | `useDtFilters` sans test (garde d'accès, période par défaut, restauration, 'invalid', POTENTIAL) | medium | Aucune référence dans les tests ; le harnais du panneau code la période en dur. | patch |
| 23 | verif+blind | `useFleetVehicles` sans test (contrat from/to, requête périmée, fenêtre invalide) | medium | Aucune référence dans les tests. | patch |
| 24 | verif+blind | Rendu DT de `VehicleCard` / états de `DtVehicleResults` non testés | medium | Aucune référence dans les tests ; la règle projet impose un test RTL pour un composant avec logique. | patch |
| 25 | verif | `applyDtFilters().stats` jamais vérifié | low | Aucun accès à `.stats` dans les tests. | patch |
| 26 | blind | `dtShortcutRange` (branches week-end) et conversions datetime-local non testées ; 400 non vérifiés par message | low | Seuls des cas en semaine sont testés ; les 400 vérifient juste une chaîne non vide. | patch |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 warning
- `npm run test` -- expected: suite verte, nouveaux tests inclus
- `npm run build` -- expected: build OK (vérifie la contrainte Suspense de `useSearchParams`)

**Manual checks (if no CLI):**
- `npm run dev`, compte DT : Maintenant puis Période future/entamée/passée, partage d'URL, largeur < 640 px, mode sombre.

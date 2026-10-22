---
id: SPEC-calendar-multiday-display
companions: []
sources: []
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Calendrier véhicules : horaires des événements sur plusieurs jours

## Why

**Douleur utilisateur** (issue GitHub #141, signalée depuis `/vehicles` par une utilisatrice CHVL/CHVPSP/CI-RPAPS/CADRE/ADMIN). Dans le planning des véhicules, une réservation à cheval sur deux jours affiche son heure de début dans chaque case : une résa du 30 à 07:00 au 31 à 07:00 indique « 07:00 » le 30 *et* le 31. On croit donc le véhicule pris le 31 à 07:00, alors qu'il redevient libre à cette heure-là. Cela fausse les décisions de réservation. Cause : `src/components/vehicle/VehicleCalendar.tsx` affiche `formatTime(res.startTime)` (l.461) et `formatTime(trip.checkOutAt)` (l.488) quel que soit le jour de la case.

## Capabilities

- **CAP-1**
  - **intent:** Pour une réservation sur plusieurs jours, chaque case affiche la portion horaire de ce jour-là : le premier jour « HH:MM → » (heure de début), les jours intermédiaires « Journée », le dernier jour « → HH:MM » (heure de fin).
  - **success:** Une réservation du 30/10 à 07:00 au 31/10 à 07:00 affiche « 07:00 → » dans la case du 30 et « → 07:00 » dans celle du 31. Aucune case du 31 n'affiche « 07:00 » seul. Une réservation du 29/10 à 07:00 au 31/10 à 07:00 affiche « Journée » dans la case du 30.
- **CAP-2**
  - **intent:** Même règle pour les emprunts terminés sur plusieurs jours (début = sortie `checkOutAt`, fin = retour `checkInAt`).
  - **success:** Un emprunt sorti le 30 à 18:00 et rendu le 31 à 09:30 affiche « 18:00 → » le 30 et « → 09:30 » le 31. Sur un emprunt de 3 jours, la case du milieu affiche « Journée ».
- **CAP-3**
  - **intent:** Un événement (réservation ou emprunt) qui finit pile à 00:00 n'apparaît pas dans la case du jour qui commence à cette minute.
  - **success:** Une réservation du 30 à 07:00 au 31 à 00:00 n'apparaît que dans la case du 30, avec « 07:00 → ».

## Constraints

- Le découpage par jour se calcule dans le fuseau local du navigateur (Europe/Paris) et reste juste les jours de changement d'heure (le 25/10/2026 tombe dans le mois de l'issue).
- Correctif uniquement côté affichage : `/api/vehicles/calendar` renvoie déjà les horodatages complets ; aucun changement d'API ni de schéma.
- La fenêtre de détail (modale) reste inchangée : elle affiche déjà le début et la fin complets.
- Livré avec des tests de composant dans `src/__tests__/components/VehicleCalendar.test.tsx` (règle projet : chaque changement avec logique a ses tests) ; `npm run lint` donne 0 erreur et 0 warning.

## Non-goals

- Maintenances : elles se comptent au jour et n'affichent pas d'heure ; aucune modification.
- Emprunts en cours : le badge « ⏳ En cours » reste sur tous les jours, sans heure de fin.
- Pas de nouvelle vue (semaine, timeline) ni de barres continues sur plusieurs cases.
- Pas de changement de la logique de disponibilité ou de conflit de réservation (`ReservationSlotPicker`, API de réservation).

## Success signal

- On rejoue le cas de l'issue (résa VL 186 du 30/10 à 07:00 au 31/10 à 07:00) sur `/vehicles` : la case du 31 indique « → 07:00 ». Un utilisateur y lit sans ambiguïté que le véhicule se libère à 07:00.

## Assumptions

- Un événement sur un seul jour garde son affichage actuel (heure de début seule).
- Les maintenances et les emprunts en cours sont hors périmètre (voir Non-goals).

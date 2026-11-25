---
title: 'Notifications : interrogation économe en CPU'
type: 'refactor'
created: '2026-11-25'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** La cloche interroge `/api/notifications` toutes les 60 s, même onglet caché ; chaque appel réveille une fonction Vercel (proxy, `auth()`, SQL). L'équipe approche des 4 h d'Active CPU du plan Hobby, dont le dépassement met tous ses projets en pause.

**Approach:** Vérifier la cause par la mesure, puis : aucune interrogation onglet caché, intervalle de 5 min, un seul rechargement au retour sur l'onglet (pas si le dernier date de moins de 60 s), une seule requête en vol, nettoyage complet au démontage ; rechargement au changement d'UL et nettoyage `fromPush` conservés. Route GET : une seule requête SQL à résultat et droits identiques si possible. `prefetch={false}` sur les listes longues seulement si la mesure (build de production) montre un gain. Push, authentification et mode démo inchangés ; ni dépendance, ni cache partagé, ni WebSocket/SSE. Mesurer les appels par heure avant/après, onglet visible puis caché.

</frozen-after-approval>

## Implementation Notes

- Cause vérifiée : `NotificationBell` n'est rendue qu'une fois (`Navbar.tsx`, même cloche en bureau et en mobile) : pas de boucle à partager. Aucun autre `setInterval` réseau dans l'appli.
- `auth()` refait lui-même plusieurs requêtes SQL par appel (compte, UL, rôles, rôles de session) : hors périmètre, mais c'est une part du coût de chaque interrogation.
- Boucle extraite dans `src/components/useNotifications.ts` ; `visibilitychange` seul (pas `focus`). La portée est « e-mail|UL » : avec un intervalle de 5 min, une impersonation à UL égale aurait laissé jusqu'à 5 min la liste d'une autre personne (60 s avant). Une liste n'est jamais affichée sous une autre portée que la sienne.
- `fromPush` partage la requête du montage (2 chargements → 1). Requête abandonnée après 30 s : sinon une requête figée bloquerait la boucle.
- Le seuil de 60 s compte les réponses du serveur (même en erreur) ; un échec réseau peut être retenté au retour suivant.
- Route GET : `LEFT JOIN` depuis `User`, 404 conservé pour un compte inconnu.
- Mesures (builds de production locaux, base SQLite locale, horloge du navigateur simulée, visibilité simulée), `GET /api/notifications` par heure : visible 60 → 12 ; caché 60 → 0 ; retour après 1 h : +1 ; après 10 s : 0.
- Préchargements (30 véhicules / 33 missions, page parcourue en entier) : `/vehicles` 49 → 16, `/missions` 55 → 18 ; CPU serveur par visite 240 → 121-151 ms et 213 → 113 ms ; une requête RSC au clic dans tous les cas, délai inchangé (31 → 31 ms, 28 → 26 ms). `prefetch={false}` gardé sur `VehicleCard` et `MissionsTable`. Barre de navigation : 7 liens + mentions légales, 2 requêtes chacun (16 par chargement), inchangée.
- Vu hors périmètre, non modifié : à chaque retour sur l'onglet `/vehicles`, 2 `/api/auth/session`, 2 `/api/themes/active` (`focus` + `visibilitychange`), 2 `/api/me/license-check`, 1 `/api/vehicles/calendar`.
- Compromis connu : un push reçu appli ouverte ne rafraîchit pas la cloche ; la pastille peut suivre avec 5 min de retard (1 min avant).
- Après la revue, mesure horaire refaite sur la version finale : 12 (visible) / 0 (caché). Types, lint (0 avertissement) et 5 509 tests verts.

## Review Triage Log

Passe 1 — Blind Hunter.

- Session momentanément nulle vide la cloche : `medium`, vérifié (`next-auth/react.js` : `getSession()` en échec → `null`). Corrigé (dernière portée connue gardée), testé.
- Suppression concurrente d'une requête, élément réapparu jusqu'à 5 min : `medium` (aggravé par l'intervalle). Corrigé (réponse périmée redemandée), testé.
- `removeLocally` non lié à la portée : `medium`. Corrigé, testé.
- Horloge reculée : `low`. Corrigé (`Math.abs`).
- Tests peu stricts (`<= 3`, abandon à 30 s) : `low`. Corrigés. Constantes exportées inutilement : corrigé.
- Changelog trop affirmatif : `low`. Reformulé.
- Ordre des effets `reload` : `low`. Documenté sur `reload`.
- Boucle sans session / 401, liste gardée après 401 : `low`, préexistant (60 s avant) ; la cloche n'est rendue qu'avec une session serveur.
- `fromPush` perdu si échec : `low`, préexistant (l'ancien code retirait aussi le paramètre).
- `reload` partage une requête déjà en vol / page ouverte cachée : `low`, la ligne est insérée avant l'envoi du push ; action ponctuelle, pas une interrogation.
- `DELETE` non vérifiés, erreur affichée comme liste vide, pas de journal sur 5xx : `low`, préexistant.
- Ouverture de la cloche sans rechargement, push sans mise à jour de la cloche : hors demande ; second point noté en compromis.
- Liste étiquetée côté client pendant un changement d'UL dans un autre onglet : `low`, fenêtre limitée à la propagation BroadcastChannel ; préexistant.
- Mode démo absent de la portée : `low`, seulement si la démo s'éteint d'elle-même.
- `lastAnswerAt` avant lecture du corps : `false`, voulu (le CPU serveur est déjà dépensé).
- Version 5.59.2 : `false`, la 5.59.1 est prise par un travail en cours non commité sur `main`.
- Requête sans `LIMIT` ni index (userId, ulId, createdAt) : `low`, préexistant ; EXPLAIN : même index qu'avant.
- `prefetch={false}` mesuré en local seulement : vrai, signalé ; la requête au clic est la même avant et après. Barre de navigation : hors demande (« listes longues »).
- Autres appels au retour sur l'onglet : `medium`, préexistant → deferred-work.
- Mesures non rejouables, extraction partielle, ligne AGENTS.md : `low`, rejetés.

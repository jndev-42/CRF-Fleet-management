---
title: 'Mode démo : vraies données en lecture seule, écritures simulées et bloquées côté serveur'
type: 'feature'
created: '2026-11-05'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
baseline_commit: '1f0fe7ee36721276c1baef189b9b2fd9613874b4'
context:
  - '{project-root}/src/__tests__/CLAUDE.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Le mode démo (activé depuis `/aide`) repose sur une base fictive locale (`DemoDB`) qui ne couvre que véhicules, trajets et missions. Tout GET non intercepté part vers la vraie API : la démo mélange du fictif et du réel, et chaque nouveau module la casse un peu plus (regex trop larges, routes absentes). Elle n'existe que dans le navigateur : aucune garantie qu'une écriture n'atteigne pas la base. Enfin, l'intercepteur s'installe dans un `useEffect` du `DemoProvider`, après les effets des enfants, donc les appels du premier rendu lui échappent.

**Approach:** La démo devient une **vue réelle en lecture seule**. Toutes les lectures montrent les vraies données de l'utilisateur, et toute écriture est simulée dans le navigateur : le parcours va au bout, avec le message « Action simulée : rien n'a été enregistré ». Le serveur refuse en plus toute écriture `/api/` dès qu'un cookie de démo est présent. Les données fictives (`DemoDB`) sont supprimées.

**Décisions (utilisateur, 2026-11-05) :**
- Vraies données partout, y compris véhicules, trajets et missions ; `DemoDB` supprimé.
- Écriture en démo : **simulée** (succès factice et message), jamais enregistrée.
- Garantie **côté serveur aussi** : cookie de démo et refus des écritures dans `src/proxy.ts`.
- Pages QR publiques (`/qr`, `/qr-ul`, `/qr-stock`, `/qr-uniforms`) : **la démo y est désactivée** (vraies lectures, vraies écritures, pas de bandeau).

## Boundaries & Constraints

**Always:** Les lectures (`GET`, `HEAD`) ne sont jamais interceptées. Le statut de la démo est conservé à la fois dans `localStorage` (`crf_is_demo_mode`, existant) et dans un cookie `crf_demo_mode=1` (`path=/`, `SameSite=Lax`), synchronisés à l'activation, à la désactivation et au chargement (un `localStorage` actif sans cookie repose le cookie). Ces routes restent exemptées côté client et côté serveur :
- `/api/auth/` ;
- les API QR `/api/qr/`, `/api/qr-ul/`, `/api/qr-stock/`, `/api/qr-uniforms/` ;
- les exports en POST qui ne font que lire : `/api/stats/csv`, `/api/stats/pdf`, `/api/stats/expenses/csv`, `/api/stats/expenses/pdf` ;
- `/api/bugs/report`.

Le refus serveur répond 403 `{ error: 'Mode démo : lecture seule', demo: true }`, sans toucher à l'authentification des pages.

**Never:** Pas de modification des handlers de route ni du schéma. Pas de jeu de données fictif. Les écritures implicites de certains GET (matérialisation de l'invalidation du permis dans `/api/me/license-check`) restent hors périmètre.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lecture | Démo active, GET `/api/expenses` | Vraies données renvoyées par le serveur | N/A |
| Écriture simulée | Démo active, POST `/api/vehicles/[id]/reservations` | Pas d'appel réseau ; 200 `{ success: true, simulated: true }` ; message « Action simulée : rien n'a été enregistré » | N/A |
| Écriture qui échappe au client | Cookie démo, PATCH `/api/users/x` envoyé directement | 403 `{ error: 'Mode démo : lecture seule', demo: true }`, base inchangée | N/A |
| Export | Démo active, POST `/api/stats/csv` | Vrai fichier téléchargé | N/A |
| Page QR | Démo active, `/qr/[token]`, prise du véhicule | Vrai enregistrement, pas de bandeau démo | N/A |
| Premier rendu | Démo active, rechargement de page | Les mutations émises au montage sont déjà interceptées | N/A |
| Sortie | Clic sur « Quitter le mode démo » | `localStorage` et cookie retirés, rechargement, écritures de nouveau possibles | N/A |

</frozen-after-approval>

## Code Map

- `src/proxy.ts` -- aujourd'hui `NextAuth(authConfig).auth` avec un matcher qui exclut `/api`. À changer en fonction : pour une requête `/api/` non exemptée, avec une méthode autre que GET/HEAD/OPTIONS et le cookie `crf_demo_mode=1`, renvoyer 403 JSON. Pour une autre requête `/api/`, appeler `NextResponse.next()` (ne **pas** passer par `authorized`, qui redirigerait les appels API vers `/login`). Pour une page, déléguer à l'`auth` NextAuth comme avant. Matcher : ajouter `'/api/:path*'` au motif existant. Mettre la liste des exemptions dans un petit module pur `src/lib/demo/readOnly.ts` (`isDemoExemptApi(pathname)`, `isDemoWriteMethod(method)`, `isQrPage(pathname)`, constante du nom du cookie), partagé par le client et le proxy et compatible edge (pas d'import Node).
- `src/lib/demo/fetchInterceptor.ts` -- réécriture complète : uniquement les mutations `/api/` non exemptées, et seulement hors page QR. La réponse simulée émet un `CustomEvent('crf-demo-simulated')` sur `window`. Rendre l'installation idempotente (garde sur `window`). Lire `localStorage` à chaque appel (comportement actuel).
- `src/lib/demo/DemoDB.ts` -- **supprimer**, avec `src/__tests__/unit/DemoDB.test.ts`. Retirer l'import et l'appel `DemoDB.reset()` de `src/components/DemoBanner.tsx` (le bouton « Réinitialiser » n'a plus d'objet) et purger la clé `crf_demo_db` restante à l'activation et à la sortie.
- `src/lib/contexts/DemoContext.tsx` -- installer l'intercepteur à l'évaluation du module (`typeof window !== 'undefined'`) au lieu du `useEffect`. Gérer le cookie dans `toggleDemoMode` et la synchronisation au chargement. Exposer un `isDemoMode` effectif à `false` sur les pages QR (`usePathname`).
- `src/components/DemoBanner.tsx` (+ `.module.css`) -- texte : « Mode démo : vraies données, lecture seule. Vos actions sont simulées et ne sont pas enregistrées. » Écouter `crf-demo-simulated` pour afficher un message bref (toast ou ligne dans le bandeau, environ 4 s). Masqué sur les pages QR.
- `src/app/aide/page.tsx:79-95` -- texte de la carte : explorer l'application avec ses vraies données, sans rien pouvoir modifier.
- Parcours qui lisent un champ de la réponse d'une mutation : création de mission (`MissionWizard.tsx` ~l. 423, `id`), `CheckOutModal.tsx:177` (trajet), `ExpenseForm.tsx:231,299`, `ReservationFormModal.tsx:125`, `McpTokens` POST (secret). Vérifier que la réponse simulée ne mène pas vers une URL `undefined` ni ne plante. Si c'est le cas, sur `simulated: true`, fermer le formulaire ou rester sur la page plutôt que de naviguer : correctif minimal et local, détecté via `useDemoMode()` ou le champ `simulated`.
- `src/lib/demo/AGENTS.md` -- réécrire pour le nouveau fonctionnement (lecture seule, cookie, exemptions).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/demo/readOnly.ts` -- prédicats purs et constantes -- source unique client et serveur.
- [x] `src/proxy.ts` -- refus serveur des écritures en démo, matcher étendu, pages inchangées.
- [x] `src/lib/demo/fetchInterceptor.ts` -- simulation des seules mutations, événement, idempotence.
- [x] `src/lib/contexts/DemoContext.tsx` -- installation précoce, cookie, exclusion des pages QR.
- [x] `src/lib/demo/DemoDB.ts`, `src/__tests__/unit/DemoDB.test.ts` -- suppression.
- [x] `src/components/DemoBanner.tsx`, `src/app/aide/page.tsx` -- textes et message « Action simulée ».
- [x] Parcours listés dans la Code Map -- pas de navigation vers `undefined` ni de plantage après une simulation.
- [x] `src/lib/demo/AGENTS.md` -- documentation.
- [x] Tests : `src/__tests__/unit/demo-readOnly.test.ts` (prédicats), `fetchInterceptor.test.ts` réécrit (GET passant, mutation simulée avec événement, exemptions, page QR, idempotence), `src/__tests__/unit/proxy-demo.test.ts` (403 avec cookie, passage sans cookie, GET passant, exemptions).
- [x] `package.json` et `package-lock.json` (version mineure 5.40.0), `CHANGELOG.md` (en français, orienté utilisateur).

**Acceptance Criteria:**
- Given la démo active, when on parcourt chaque entrée du menu, then les écrans affichent les vraies données sans erreur.
- Given la démo active, when on valide un formulaire, then aucun appel d'écriture n'apparaît dans l'onglet Réseau, le message de simulation s'affiche et la donnée est inchangée après rechargement.
- Given la démo jamais activée, when on utilise l'application, then aucun comportement ne change (pas de cookie, pas de 403).

## Implementation Notes

- `readOnly.ts` concentre les prédicats ; `proxy.ts` délègue les pages à NextAuth et laisse passer les API (pas de redirection `/login`).
- Parcours relus après simulation : `CheckOutModal`, `ReservationFormModal`, `ExpenseForm` (upload tolérant `keys` absent), `EditVehicleModal`, `IncidentReportModal` (PDF : `pdfRes.ok` faux, ignoré) : pas de plantage.
- Échecs de la suite complète **antérieurs** au changement : `ReservationFormModal.test.tsx` (2 cas, reproduits au commit de base dans un worktree). `mcp-server.test.ts` et le build échouaient faute de `mcp-handler` installé ; corrigé par `npm ci`.
- Test ajouté : installation de l'intercepteur dès l'import (ligne « Premier rendu » de la matrice).

## Spec Change Log

## Review Triage Log

| # | Source | Constat | Verdict | Route |
|---|--------|---------|---------|-------|
| 1 | verif, edge, blind | Le cookie démo reste posé sur les pages QR, donc 403 sur `/api/incidents` depuis `/qr/[token]` | high : l'effet de synchro du cookie lit `isDemoMode` et non `effectiveDemo` | patch |
| 2 | edge, blind | Bascule de la démo dans un autre onglet : interface et écritures désynchronisées | medium : l'intercepteur relit `localStorage` à chaque appel, l'interface une seule fois | patch |
| 3 | edge, blind | `ReferentielTab` : PUT XHR vers `undefined` après un upload simulé | medium : `putWithProgress(uploadUrl)` sans garde | patch |
| 4 | edge, blind | Mission simulée : le brouillon local est effacé | medium : `clearDraft` appelé sans condition | patch |
| 5 | blind | Message « Action simulée » à chaque chargement (réabonnement push silencieux) | medium : `PushProvider.tsx:116` envoie un POST dès que la permission est accordée | patch |
| 6 | verif | Aucun test de la réponse simulée pour MissionWizard et McpTokens | medium : constat pré-vérifié | patch |
| 7 | blind | `authMock` jamais réinitialisé dans `proxy-demo.test.ts` | low : correction directe | patch |
| 8 | blind | `crf_demo_db` purgé seulement à la bascule | low : correction directe | patch |
| 9 | edge | Effets de bord des GET (license-check, télémétrie) | false pour la télémétrie (`/api/renault/[vin]` ne fait que lire) ; license-check exclu par l'intention (« Never ») | rejet |
| 10 | edge | POST en lecture seule non exemptés | false : audit des POST, seuls les exports de statistiques lisent, et ils sont exemptés | rejet |
| 11 | edge, blind | Écritures cross-origin simulées | low : aucun appel cross-origin vers `/api/` côté client | rejet |
| 12 | blind | XHR, sendBeacon et formulaires natifs non simulés | false : un seul XHR (n° 3), ni sendBeacon ni formulaire natif | rejet |
| 13 | blind | Cookie non effacé à la déconnexion | false : `localStorage` persiste aussi, donc bandeau et cookie restent cohérents | rejet |
| 14 | blind | Cookie sans `Secure` | low : cookie non sensible | rejet |
| 15 | blind | Liste d'exemptions maintenue à la main | low : aucun défaut démontré | rejet |
| 16 | blind | `package-lock.json` absent du diff | false : exclu par la commande de diff, version synchronisée | rejet |
| 17 | blind | Changelog muet sur le retour à la liste et sur l'erreur de jeton | low : formulation | rejet |
| 18 | blind | `''` utilisé comme marqueur de simulation dans MissionWizard | low : état initial `null` vérifié | rejet |
| 19 | verif (other) | Incident : `data.id` indéfini | false : le PDF est ignoré quand `pdfRes.ok` est faux, pas de plantage | rejet |
| 20 | blind | `DemoBanner.test` : faux timers sans nettoyage | low : hygiène de test | rejet |
| 21 | blind | Matcher du proxy non testé | low : le build valide le proxy | rejet |
| 22 | blind | `ExpenseForm` : `uploadData.keys` absent | false : `|| []` | rejet |

## Verification

**Commands:**
- `npm run lint` -- expected: 0 erreur, 0 avertissement
- `npx vitest run src/__tests__/unit/fetchInterceptor.test.ts src/__tests__/unit/demo-readOnly.test.ts src/__tests__/unit/proxy-demo.test.ts` -- expected: tout passe
- `npm run test` -- expected: aucune régression
- `npm run build` -- expected: build OK (proxy compatible)

**Manual checks (if no CLI):**
- `npm run dev`, activer la démo depuis `/aide` : les vraies données s'affichent. Réserver un véhicule : message de simulation, rien en base. Lancer `curl -X PATCH` avec le cookie : 403. Ouvrir une page `/qr/[token]` : pas de bandeau, la prise fonctionne.

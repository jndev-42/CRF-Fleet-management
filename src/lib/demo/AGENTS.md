<!-- Parent: ../AGENTS.md -->
<!-- Updated: 2026-11-05 -->

# Demo Mode

## Purpose
Vue **réelle en lecture seule** : toutes les lectures (GET/HEAD) montrent les vraies données ; toute écriture `/api/` est simulée dans le navigateur (réponse `200 { success: true, simulated: true }`, aucun appel réseau) et refusée côté serveur (403) si elle y parvient. Il n'y a plus de données fictives.

## Key Files
| File | Description |
|------|-------------|
| `readOnly.ts` | Source unique, pure et compatible edge : nom du cookie, clé localStorage, événement, `isDemoExemptApi`, `isDemoWriteMethod`, `isQrPage`, `isDemoBlockedRequest` |
| `fetchInterceptor.ts` | Enveloppe `window.fetch` : simule les seules mutations `/api/` non exemptées (hors pages QR), émet `crf-demo-simulated`. Idempotent |

## For AI Agents
- Statut conservé dans `localStorage` (`crf_is_demo_mode`) **et** dans le cookie `crf_demo_mode=1` (`path=/`, `SameSite=Lax`), synchronisés par `DemoContext` (activation, sortie, chargement).
- `src/proxy.ts` répond 403 `{ error: 'Mode démo : lecture seule', demo: true }` à toute écriture `/api/` non exemptée portant le cookie. Les pages ne changent pas (auth NextAuth).
- L'intercepteur s'installe à l'évaluation du module `DemoContext` (avant les effets enfants).
- Exemptions (client et serveur) : `/api/auth/`, `/api/qr/`, `/api/qr-ul/`, `/api/qr-stock/`, `/api/qr-uniforms/`, exports POST `/api/stats/{csv,pdf}` et `/api/stats/expenses/{csv,pdf}`, `/api/bugs/report`. Ajouter ici toute nouvelle route POST qui ne fait que lire.
- Pages QR (`/qr`, `/qr-ul`, `/qr-stock`, `/qr-uniforms`) : démo désactivée (vraies écritures, pas de bandeau).
- Un formulaire qui lit un champ de la réponse d'une mutation doit tolérer `simulated: true` (pas d'`id`, pas de `token`).
- Hors périmètre : les écritures implicites de certains GET (ex. `/api/me/license-check`).

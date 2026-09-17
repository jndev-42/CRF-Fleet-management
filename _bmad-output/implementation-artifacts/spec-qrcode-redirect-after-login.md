---
title: 'Redirection vers la page QR code après connexion'
type: 'bugfix'
created: '2026-09-17'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problème :** Un utilisateur non connecté qui scanne un QR code (véhicule `/qr/[token]` ou stock `/qr-stock/[token]`) est intercepté par le middleware d'authentification et redirigé vers `/login` avec un `callbackUrl` absolu. La page de login (`src/app/login/page.tsx`) valide ce `callbackUrl` avec `rawCallback.startsWith('/')`, qui échoue toujours car NextAuth fournit une URL absolue (`https://.../qr/...`) et non un chemin relatif. Le fallback vers `/` s'applique donc systématiquement : après connexion, l'utilisateur atterrit sur la page d'accueil au lieu de la page du QR code scanné, et doit re-scanner.

**Approche :** Corriger la validation du `callbackUrl` dans `src/app/login/page.tsx` pour qu'elle accepte une URL absolue de même origine que l'application, en extrayant le chemin (`pathname + search`) via `new URL(rawCallback, base)` et en vérifiant que l'origine correspond (protection open-redirect), au lieu du simple test `startsWith('/')`.

</frozen-after-approval>

## Implementation Notes

- Fichier modifié : `src/app/login/page.tsx`.
- Ajout de `resolveCallbackUrl()` : accepte un chemin relatif tel quel, ou parse une URL absolue et vérifie que son `host` correspond au `host` (ou `x-forwarded-host`) de la requête courante via `headers()` de `next/headers`, avant d'en extraire `pathname + search`. Sinon fallback `/`. Empêche l'open-redirect tout en couvrant le cas réel (URL absolue fournie par NextAuth).
- Suite à la revue Blind Hunter : fonction extraite vers `src/lib/auth-callback-url.ts` (pure, testable sans mocker `next/headers`) et couverte par `src/__tests__/unit/auth-callback-url.test.ts` (6 cas). `src/app/login/AGENTS.md` mis à jour (le garde-fou documenté était obsolète).
- Aucune surprise : `npm run lint` → 0 erreur / 0 warning. `npx vitest run src/__tests__/unit/auth-callback-url.test.ts` → 6/6 passés.

## Review Triage Log

- **high → patch** : `src/app/login/AGENTS.md` documentait encore l'ancien garde-fou (`startsWith('/')`) comme règle à préserver — contredisait le nouveau code et aurait pu faire réintroduire le bug par un futur agent. Corrigé.
- **medium → patch** : aucune couverture de test pour la logique de résolution de `callbackUrl` (pertinente pour la sécurité, règle projet « toute nouvelle feature doit avoir des tests »). Fonction extraite en module pur + 6 tests unitaires ajoutés.
- **low → patch (triviale)** : frontière de confiance sur le header `host` non documentée. Commentaire ajouté dans `src/lib/auth-callback-url.ts` précisant que c'est la même source de confiance que celle déjà utilisée par le middleware NextAuth pour construire `callbackUrl`.
- **low → rejeté** : absence de log sur le fallback silencieux. Rejeté : ce n'est pas une erreur mais un comportement de sécurité attendu (URL invalide ou hors origine) ; logguer chaque cas ajouterait du bruit sans bénéfice clair.
- **low → rejeté** : edge case de casse/port sur la comparaison `host`. Rejeté : `host` provient du même cycle de requête que celui utilisé par NextAuth pour construire l'URL initiale — pas de scénario réaliste de non-correspondance sur ce déploiement.



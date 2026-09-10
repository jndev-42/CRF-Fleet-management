<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-09-10 | Updated: 2026-09-10 -->

# brand-credentials

## Purpose
Expose, en lecture seule, le compte constructeur enregistré pour une unité locale. Alimente la modale de connexion — « Compte MyRenault de l'UL : x@y.fr » — pour réduire la saisie au seul VIN dès le 2ᵉ véhicule.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | `GET` — `{ credential: { brand, login } \| null }` |

## For AI Agents

### Working In This Directory

**`passwordEncrypted` ne doit JAMAIS figurer dans le `SELECT`.** L'absence dans la requête est la garantie — pas un `delete` après coup, qu'un refactor pourrait retirer sans que rien ne casse. La requête est `SELECT brand, login FROM BrandCredential WHERE ulId = ? AND brand = ?`, et rien d'autre.

**Accès** — `401` sans session ; `403` pour tout rôle autre que ADMIN ou SUPER_ADMIN : le `login` est l'adresse du compte constructeur de l'UL, il se protège comme l'écriture qu'il prépare.

**Portée** — `session.user.ulId` par défaut. Le paramètre `?ulId=` traverse les unités locales et est **réservé au SUPER_ADMIN** (`403` sinon). Sans UL résolue, la réponse est `{ credential: null }` — pas une erreur.

**Marque** — `?brand=` validée par `isBrand` (`@/lib/brands`), défaut `BRANDS[0]`. Marque inconnue ⇒ `400 'Marque inconnue'`. Ajouter une marque = une entrée dans `src/lib/brands.ts`, rien à changer ici.

L'écriture du compte se fait exclusivement par `POST`/`PATCH /api/vehicles/[id]/connection` — cette route n'a volontairement aucun verbe d'écriture.

## Dependencies

### Internal
- `@/lib/db` — `BrandCredential`
- `@/lib/brands` — `BRANDS`, `isBrand`
- `@/lib/roles` — `isAdmin`, `isSuperAdmin`
- `@/lib/apiAuth` — `unauthorizedResponse`, `forbiddenResponse`
- `@/auth` — session NextAuth v5

### Tests
- `src/__tests__/integration/vehicle-connection.test.ts`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

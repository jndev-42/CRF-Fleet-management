<!-- Parent: ../../../AGENTS.md -->
<!-- Generated: 2026-09-10 | Updated: 2026-09-10 -->

# vehicles/[id]/connection

## Purpose
Connecte, met à jour et déconnecte un véhicule d'un compte constructeur (`BrandCredential` porté par l'UL + `VehicleConnection` porté par le véhicule). Valide les identifiants et le VIN **en direct** avant toute écriture. Touche `BrandCredential`, `VehicleConnection`, `RenaultSession` et `Vehicle.vin`.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | `POST` (connecter), `PATCH` (modifier), `DELETE` (déconnecter) |

## For AI Agents

### Working In This Directory

**`[id]` est l'UUID du véhicule, pas son nom** — contrairement à la route parente `src/app/api/vehicles/[id]/route.ts:44` qui résout par `name`. La résolution est `SELECT id, ulId, vin FROM Vehicle WHERE id = ?` sur les trois verbes. Le patron `WHERE name = ? OR id = ?` de `maintenance-events/route.ts:37,115` est **explicitement rejeté** : `Vehicle.name` n'a aucune contrainte UNIQUE (son unicité n'est qu'applicative et globale, `src/app/api/vehicles/route.ts:173`), un `OR` peut donc matcher plusieurs lignes et rattacher un credential — donc un secret — au véhicule d'une autre UL. Les sous-routes voisines `metrics`, `trips` et `qr-token` résolvent déjà par UUID.

**Contrôle d'accès** — `!isSuperAdmin(roles) && !(isAdmin(roles) && session.user.ulId === vehicle.ulId)` ⇒ `403`. Plus strict que `src/app/api/renault/[vin]/route.ts:27`, qui autorise tout membre de l'UL sans contrôle de rôle : lire un kilométrage et écrire un credential n'appellent pas le même seuil. `isAdminOrAbove` (`src/lib/roles.ts:65`) **ne convient pas** — il ignore la portée UL et donnerait à un ADMIN accès aux credentials de toutes les ULs.

**`POST` — ordre impératif, à ne pas réordonner :**
1. Résolution du credential — couple `login`/`password` fourni ⇒ utilisé, et il **écrase** celui de l'UL ; sinon `SELECT ... FROM BrandCredential WHERE ulId = ? AND brand = ?`, absent ⇒ `400 'Aucun compte MyRenault enregistré pour cette UL'`.
2. **Validation live avant toute écriture** (`fetchRenaultVehicleData`) : `BrandAuthError` ⇒ `400 'Identifiants MyRenault refusés'` ; `VinNotOnAccountError` ⇒ `400 'VIN introuvable sur ce compte MyRenault'` ; `BrandTransientError` ⇒ `502` (ni les identifiants ni le VIN ne sont en cause). Aucune transaction n'est ouverte à ce stade : la base est inchangée.
3. Écriture transactionnelle : upsert `BrandCredential` + upsert `VehicleConnection` `ON CONFLICT(vehicleId)` + `UPDATE Vehicle SET vin = ?`.
4. `201 { success: true, connection: { brand, vin, status, connectedAt }, data }`.

**INVARIANT F11 — à ne jamais casser :** l'écriture du credential et celle de la connexion restent dans **une seule** transaction. C'est cette propriété, et elle seule, qui rend sûre la suppression d'orphelin du `DELETE`. Un refactor qui les séparerait réintroduirait une vraie course — une connexion pointant un credential déjà purgé — sans que personne le voie.

**`PATCH`** — même schéma, `vin` optionnel (celui de la connexion existante est conservé), exige une connexion existante sinon `404`. Répond `200`.

**`DELETE`** — transaction : suppression de la connexion, `COUNT` restant par `credentialId` ; à zéro, purge de la ligne `RenaultSession` **puis** du `BrandCredential`. **`Vehicle.vin` est conservé** : c'est une donnée d'identification du véhicule, et un VIN sans connexion est un état supporté (métriques éditables manuellement). Réponse `{ success: true, credentialDeleted: boolean }`.

**Ne jamais renvoyer** `password`, `passwordEncrypted` ni `credentialId`, sur aucun verbe, ni en succès ni en erreur.

**Points de vigilance :**
- Un véhicule sans `ulId` est refusé en `400` : le credential est porté par l'UL, il n'aurait nulle part où vivre.
- La validation live peut écrire une ligne de cache `RenaultSession` avant la transaction (non fatale, purgée par le `DELETE`). Les tables `BrandCredential` et `VehicleConnection`, elles, restent strictement inchangées sur échec.
- Un échec du module de chiffrement (clé absente/invalide, payload illisible) ⇒ `500 { error: 'Configuration de chiffrement invalide' }`, sans jamais détailler l'environnement.
- Les FK ne sont pas activées : toute assertion d'unicité porte sur les index (`BrandCredential_ulId_brand_idx`, `VehicleConnection_vehicleId_idx`).

## Dependencies

### Internal
- `@/lib/db` — `Vehicle`, `BrandCredential`, `VehicleConnection`, `RenaultSession`
- `@/lib/crypto` — `encryptSecret` / `decryptSecret` (AES-256-GCM, `iv:authTag:ciphertext`)
- `@/lib/renault` — `fetchRenaultVehicleData`, `BrandAuthError`, `BrandTransientError`, `VinNotOnAccountError`, `ConnectionContext`
- `@/lib/brands` — `BRAND_ACCOUNT_LABELS` (« MyRenault »), type `Brand`
- `@/lib/roles` — `isAdmin`, `isSuperAdmin`
- `@/lib/apiAuth` — `unauthorizedResponse`, `forbiddenResponse`
- `@/auth` — session NextAuth v5

### Tests
- `src/__tests__/integration/vehicle-connection.test.ts`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

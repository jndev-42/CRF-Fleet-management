<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicles/[id]/qr-token

## Purpose
Manages QR code bypass tokens for vehicles. Lazy-creates tokens on first GET (stored in `qrToken` column). GET and POST both retrieve (or create); DELETE regenerates new token (admin only). Used for QR code bypass in checkout flow. Touches `Vehicle` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (any auth) get or lazy-create token; POST (any auth) alias for GET; DELETE (ADMIN) regenerate |

## For AI Agents

### Working In This Directory
**GET /api/vehicles/[id]/qr-token** — Any authenticated user. Returns existing `qrToken` from vehicle or lazily creates UUID and stores it. Returns `{ token }`.

**POST /api/vehicles/[id]/qr-token** — Any authenticated user. Semantic alias: delegates to GET. Returns `{ token }`.

**DELETE /api/vehicles/[id]/qr-token** — ADMIN only. Regenerates token (new UUID), invalidating old QR codes. Returns `{ token: newToken }` or 404 if vehicle not found.

**Key business rules:**
- `[id]` is vehicle ID (UUID) in this route (unlike vehicles/[id] which uses name)
- Token lazy-creation: first GET auto-stores UUID in database
- Token is single per vehicle; regeneration via DELETE replaces it
- No validation of token format (just UUID)
- QRCodeModal uses this for bypass URL generation

## Dependencies

### Internal
- `@/lib/db` — `Vehicle` table (qrToken column)
- `@/lib/roles` — `canAccessAdminPanel`
- `@/auth` — NextAuth v5 session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# license-check

## Purpose
GET endpoint to verify driver license/papers validity of the logged-in account, **whatever its roles** (no exemption for non-drivers nor managers: anyone who takes the wheel is checked). Checks `User.papiers_valides` and `last_validation` date. If validation expired (> 182 days old), marks driver as invalid and starts a 14-day grace period. After 14 days, driver is blocked. Touches `User` table.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (check license validity) — requires auth; same logic for every role |

## For AI Agents

### Working In This Directory
**GET** returns `{ validated: boolean, daysLeft: number | null, blocked: boolean }`.

Flow:
1. Auth check; 401 if not authenticated.
2. No role check: every account goes through the same decision (`getLicenseStatus`).
3. Check if validation is expired (null or > 182 days old):
   - If valid and not expired: return `{ validated: true, daysLeft: null, blocked: false }`.
   - If expired: set `papiers_valides = 0`, `start_date_invalidation_process = today` (if not already set).
4. If invalid, calculate `daysLeft` until blocking (14 days from invalidation start).
   - If `daysLeft <= 0`, driver is `blocked: true`.

Constants: `VALIDATION_VALIDITY_DAYS = 182` (6 months), `INVALIDATION_GRACE_DAYS = 14`.

## Dependencies

### Internal
- `User` table (select, update)
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Single incident report retrieval and state management. GET fetches incident with vehicle and user metadata, parsing JSON detail fields. PATCH allows owner or admin to update any field (status, details, dates). DELETE removes reports (owner or admin only).

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (retrieve) — PATCH (update fields) — DELETE (remove) |

## For AI Agents

### Working In This Directory

**GET:**
- Path param: `id` — incident report ID
- Returns incident with joined vehicle name and user name
- Auto-parses JSON fields: `flashDetails`, `accidentDetails`, `damages`, `victims`, `actions`, `context`
- No role restrictions; returns 404 if not found
- Returns 401 if not logged in

**PATCH:** Flexible field update (not action-driven like expenses).
- Auth: Owner or admin (checked via `isAdminOrAbove` helper)
- Zod schema allows optional fields: type, status, all dates, all JSON objects, descriptions
- Dynamically builds UPDATE clause from provided fields
- Auto-JSON-serializes object fields before insert
- Sets `updatedAt` to current ISO timestamp
- Returns 403 if neither owner nor admin, 404 if report not found

**DELETE:**
- Auth: Owner or admin only
- Any status allowed (unlike expenses which restrict to draft)
- Returns 403 if neither owner nor admin, 404 if not found

**DB tables:** IncidentReport, Vehicle, User

**JSON fields:** Stored as strings in DB, auto-parsed on retrieval.

## Dependencies

### Internal
- `@/lib/db` — Turso SQL queries
- `@/lib/roles` — `isAdminOrAbove()` role check
- `@/auth` — Session & user ID

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

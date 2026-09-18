<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-09-18 -->

# Missions

## Purpose
Manages mission reports (comptes rendus de mission) submitted by CRF volunteers. Stores mission details (type, date, location, victim count), supplies used (by category), and optional Renault Connect vehicle data. Each report is attached **explicitly** either to an UL (`ulId`) or to a Direction Territoriale (`dt_code`) — never both, never neither. Touches `mission_reports` and `mission_report_supplies` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (paginated list, `scope`-driven), POST (create report with supplies, transaction-managed) |

## Subdirectories
- `[id]/` — fetch/delete individual mission report

## For AI Agents

### Working In This Directory

**Roles & Access:**
- GET: Allowed roles = `[ADMIN, CI/RPAPS]` OR `isAdminOrAbove()` OR `isReadOnlyManager()`.
- POST: same gate minus `isReadOnlyManager` (`ALLOWED_ROLES` + `isAdminOrAbove`). Input is Zod-validated.

**`scope` — the visibility split (GET):**
- `scope=mine` (**default**): every report of the submitter, **no UL filter at all** — a submitter keeps sight of their reports after switching active UL, including reports attached to a DT. Works even when no UL is active.
- `scope=all`: reports of the **currently active UL** (`session.user.ulId`). Requires `isAdminOrAbove() || isReadOnlyManager()` → **403** otherwise. With no active UL (`undefined` / `'default'`) it returns an empty list.
- A DT report (`ulId IS NULL`) is **never** reconciled with an UL by `dtCode` — it is deliberately invisible in `scope=all`. This is a product decision, not an oversight: do not "fix" it with a join on `UniteLocale.dtCode`.
- The submitter id is resolved from `session.user.email` before filtering, because `session.user.id` can be an email fallback in dev while the row stores the real `User.id` (same resolution as POST).

**Business Rules:**
- On POST the attachment comes from the payload (`selected_ul_id` / `selected_dt_code`), **never** from `session.user.ulId`. A Zod `superRefine` rejects "both" and "neither" with 400.
- `selected_ul_id` wins if both somehow reach the insert: `dt_code` is forced to `NULL`.
- On POST: supplies with `quantity_used === 0` are filtered out and not inserted.
- Mission date format must be `YYYY-MM-DD` (validated by Zod).
- Driver ID normalization: session.user.id in dev may be an email fallback; mapped to real UUID before insert.

**DB Details:**
- Inserts into `mission_reports` (26 fields including `ulId` and `dt_code`).
- Inserts `mission_report_supplies` rows for each supply with `quantity_used > 0`.
- Uses transaction (write) to atomically insert report + supplies or rollback on error.
- The list query LEFT JOINs `UniteLocale` to return `ul_name` for the UL/DT tag.

**Response Shape:**
- GET: `{ reports: [...], total, page, limit }` — each report carries `ul_name` and `dt_code` (exactly one is non-null).
- POST: `{ success: true, id }` (201) or `{ error, details }` (400/401/403/500).

## Dependencies

### Internal
- `db` (libSQL) — direct parameterized SQL, no ORM
- `auth` from `@/auth` — NextAuth v5 session
- `@/lib/roles` — `isAdminOrAbove()`, `isReadOnlyManager()`
- `@/lib/mission-supplies` — `EXTERNAL_VEHICLES` lookup table

### Tables Touched
- `mission_reports` — main report store (id, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count, presence_ul, team_dynamics, all_found_place, member_difficulties, free_comment, mission_comment, had_acr, had_hemorrhage, had_complex_care, needs_followup, drive_folder_id, signed_report_drive_id, ulId, dt_code, submitted_by, submitted_at)
- `mission_report_supplies` — supplies per report (id, report_id, category, item_name, quantity_used)
- `User` — submitter/driver lookups (LEFT JOIN) + email→id resolution
- `Vehicle` — vehicle name fallback via EXTERNAL_VEHICLES (LEFT JOIN)
- `UniteLocale` — UL label for the attachment tag (LEFT JOIN on `mr.ulId`)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Missions

## Purpose
Manages mission reports (comptes rendus de mission) submitted by CRF volunteers. Stores mission details (type, date, location, victim count), supplies used (by category), and optional Renault Connect vehicle data. Access varies by role: ADMIN/RESPO/CHVL/CHVPSP can view all reports for their UL; other roles see only their own submissions. Touches `mission_reports` and `mission_report_supplies` tables.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (paginated list, role-filtered), POST (create report with supplies, transaction-managed) |

## Subdirectories
- `[id]/` — fetch/delete individual mission report

## For AI Agents

### Working In This Directory

**Roles & Access:**
- GET: Allowed roles = `[ADMIN, CI/RPAPS]` OR `isAdminOrAbove()` OR `isReadOnlyManager()`. Users without a UL see empty list. Non-managers see only their own reports.
- POST: Allowed roles = same as GET (creation restricted). Input is Zod-validated. UL is auto-set from `session.user.ulId`.

**Business Rules:**
- On POST: supplies with `quantity_used === 0` are filtered out and not inserted.
- UL membership is enforced: `ulId` must match session or user sees empty results.
- Mission date format must be `YYYY-MM-DD` (validated by Zod).
- Driver ID normalization: session.user.id in dev may be an email fallback; mapped to real UUID before insert.

**DB Details:**
- Inserts into `mission_reports` (24 fields including supplies array, ulId, submitted_by timestamp).
- Inserts `mission_report_supplies` rows for each supply with `quantity_used > 0`.
- Uses transaction (write) to atomically insert report + supplies or rollback on error.

**Response Shape:**
- GET: `{ reports: [...], total, page, limit }` or empty list if no UL.
- POST: `{ success: true, id }` (201) or `{ error, details }` (400/401/403/500).

## Dependencies

### Internal
- `db` (libSQL) — direct parameterized SQL, no ORM
- `auth` from `@/auth` — NextAuth v5 session
- `@/lib/roles` — `isAdminOrAbove()`, `isReadOnlyManager()`
- `@/lib/mission-supplies` — `EXTERNAL_VEHICLES` lookup table

### Tables Touched
- `mission_reports` — main report store (id, mission_type, mission_name, mission_date, location, volunteers, pegass_ok, vehicle_id, driver_id, victim_count, ul18_present, team_dynamics, all_found_place, member_difficulties, free_comment, had_acr, had_hemorrhage, had_complex_care, needs_followup, supplies, drive_folder_id, signed_report_drive_id, ulId, submitted_by, submitted_at)
- `mission_report_supplies` — supplies per report (id, report_id, category, item_name, quantity_used)
- `User` — submitter/driver lookups (LEFT JOIN)
- `Vehicle` — vehicle name fallback via EXTERNAL_VEHICLES (LEFT JOIN)

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

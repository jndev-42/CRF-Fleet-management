<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Incidents

## Purpose
Incident report creation. POST endpoint only — creates new incident records (accidents or flash fines) with flexible JSON fields for structured details. Reports start in DRAFT status and can be updated/submitted separately.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | POST — create new incident report |

## Subdirectories
- [`[id]`]([id]/AGENTS.md) — Retrieve, update, delete specific incident
- [`[id]/pdf`]([id]/pdf/AGENTS.md) — Generate PDF export of incident report

## For AI Agents

### Working In This Directory

**POST:** Create new incident report.
- Auth: Login check only (no role restrictions)
- Zod schema validates:
  - `vehicleId` (required): Vehicle involved
  - `tripId`, `reservationId` (optional): Trip or reservation context
  - `type` (optional): 'ACCIDENT' or 'FLASH' (flash fine)
  - `status` (optional, default 'DRAFT'): 'DRAFT' or 'SUBMITTED'
  - `occurredAt`, `location` (optional): ISO timestamp, location string
  - Multiple JSON object fields: `flashDetails`, `accidentDetails`, `damages`, `victims`, `actions`, `context` (flex schema for structured data)
  - `description`, `retrospection`, `driveFolderId` (optional)
- DB: Inserts into IncidentReport with userId from session, ISO timestamp for createdAt/updatedAt
- Returns: `{ success: true, id }` with newly created report UUID
- Error: 400 on Zod validation, 401 if not logged in, 500 on DB error

**DB tables:** IncidentReport

**Side effects:** None (no notifications or Drive calls).

## Dependencies

### Internal
- `@/lib/db` — Turso SQL insert
- `@/auth` — Session & user ID extraction

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

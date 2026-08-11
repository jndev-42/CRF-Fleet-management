<!-- Parent: ../../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# trips/[id]/desinf-pre

## Purpose
Pre-checkin desinfection data endpoint. Allows admin to record desinfection pre-data (responsible person, lot number) before vehicle check-in for Désinfection missions.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | PATCH: update desinfection pre-checkin data; roles: ADMIN only |

## For AI Agents

### Working In This Directory
- **PATCH /api/trips/[id]/desinf-pre:** Store desinfection pre-checkin data
  - Accepts desinfPreSchema: desinfResponsableId (required), desinfResponsable (required), desinfLotNumber (required)
  - Auth required; authorization: ADMIN only
  - Fetches trip and validates: must exist, must be active (checkInAt IS NULL), missionType must be 'Désinfection'
  - Updates Trip: desinfResponsableId, desinfResponsable, desinfLotNumber fields
  - Returns `{ success: true }`

### Non-obvious Details
- Data is recorded before checkin; can be updated during checkin via checkin endpoint
- Used for VPSP vehicle Désinfection missions only
- No validation of desinfResponsableId against User table (allows pre-recorded values)

## Dependencies

### Internal
- `@/lib/db` — Trip queries
- `@/lib/roles` — `isAdminOrAbove()` check

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

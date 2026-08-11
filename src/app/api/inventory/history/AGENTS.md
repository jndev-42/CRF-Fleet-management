<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Inventory History

## Purpose
Retrieve stock change audit logs for an item. Returns up to 100 most recent log entries showing quantities added/removed, user who made the change, timestamp, and optional notes. Read-only, any authenticated user.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (retrieve stock logs for item) |

## For AI Agents

### Working In This Directory
**Role:** Any authenticated user (401 if not). No role restrictions.

**Business rules:**
- Requires `itemId` (query param)
- Verifies item ownership: must belong to user's `ulId` (404 if not found or access denied)
- Returns last 100 log entries ordered by `timestamp DESC` (newest first)
- Each log includes: ID, itemId, change (quantity delta), userName, note, timestamp

**Non-obvious validation:**
- `itemId` required; missing → 400
- Item ownership check prevents cross-user log access

**Side effects:**
- None (read-only)

## Dependencies

### Internal
- Database: `InvItem`, `InvStockLog`
- Lib modules: `@/lib/db`, `@/auth`, `@/lib/utils/error`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

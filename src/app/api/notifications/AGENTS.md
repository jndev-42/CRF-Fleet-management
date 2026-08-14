<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# notifications

## Purpose
In-app notification management. GET fetches all notifications for the authenticated user in their active UL, ordered by recency. DELETE clears all notifications for the user in that UL. Notifications are triggered by system events (trips, incidents, reservations, etc.) and stored in the `Notification` table, scoped per user and UL.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | GET (list user notifications), DELETE (clear all) — requires auth |

## Subdirectories
- `[id]` — DELETE (remove single notification)

## For AI Agents

### Working In This Directory
**GET** queries `Notification` table by userId and ulId, returns array of `{ id, title, message, url, isRead, createdAt }`. No filtering by read status; all notifications returned. CreatedAt is ISO-formatted.

**DELETE** removes all notifications for the user's current ulId. Returns `{ success: true }` on completion (including if no notifications exist).

Both methods require auth; 401 if no email in session. 404 if User not found (shouldn't happen in normal flow).

## Dependencies

### Internal
- `Notification` table (select, delete)
- `User` table (lookup by email)
- `@/auth` — session, ulId

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

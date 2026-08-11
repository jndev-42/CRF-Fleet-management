<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# [id]

## Purpose
Delete a single notification by ID. Ensures the notification belongs to the authenticated user before deleting (security check). Returns 404 if notification not found or does not belong to user.

## Key Files
| File | Description |
|------|-------------|
| `route.ts` | DELETE (remove single notification) — requires auth and ownership check |

## For AI Agents

### Working In This Directory
**DELETE** removes the notification only if it belongs to the authenticated user. Flow:
1. Auth check; 401 if no email.
2. Lookup user by email.
3. Delete from `Notification` where `id = notificationId AND userId = userId`.
4. If `rowsAffected === 0`, return 404 (not found or not owned by user).
5. Otherwise return 200 with `{ success: true }`.

Ownership check prevents users from deleting other users' notifications.

## Dependencies

### Internal
- `Notification` table (delete)
- `User` table (lookup by email)
- `@/auth` — session

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

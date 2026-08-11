<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# missions/new

## Purpose
Mission report creation route (`/missions/new`). A thin 45-line shell: it enforces the role gate, renders the page title, and delegates the entire multi-step form to `MissionWizard`. On success it routes to the freshly created report's detail page.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | Role gate + `<MissionWizard>` mount. Contains no form logic of its own. |

## For AI Agents

### Working In This Directory
**Access gate:** `canAccess = isAdminOrAbove(roles) || roles.includes('CI/RPAPS')` — SUPER_ADMIN, ADMIN, and CI/RPAPS only. This is **stricter than `/missions`**, which additionally admits Président/Cadre as read-only viewers; they must not be able to file reports. Unauthorized users are pushed to `/` (whereas the list page pushes to `/vehicles`).

The gate is enforced twice: a `useEffect` redirect, and a render guard `if (status === 'loading' || !canAccess) return <div className="page-loading">` so nothing flashes before the redirect lands. Keep both.

This page is intentionally at the line-count ideal from the parent convention — **all new form logic belongs in `MissionWizard`**, not here. The only props passed down are session-derived: `currentUserId`, `currentUserName`, `currentUserUlId` (from `session.user.ulId`), and `onSuccess`.

`handleSuccess(id)` navigates to `/missions/{id}`, so the wizard's submit handler must resolve with the new report id.

## Dependencies

### Internal
- `@/components/missions/MissionWizard` — the whole form; also owns the `POST /api/missions` call
- `@/lib/roles` — `isAdminOrAbove`
- Navigates to `/missions/{id}` on success

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

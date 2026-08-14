<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# users

## Purpose
Administration panel (`/users`) — despite the route name, this is the app's general admin page (`AdminPage`), organised as four tabs: **Utilisateurs** (create/delete users, assign roles, validate driving papers, impersonate), **Menus** (super-admin only, module visibility), **Unités Locales**, and **Bandeaux** (banner messages). It owns the user list state and passes mutation callbacks down to each tab component.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | `AdminPage` — role gates, user list fetch, toast state, tab switching, and the `createUser` / `deleteUser` / `validatePapers` / `impersonateUser` handlers. |

## For AI Agents

### Working In This Directory
**Access gate:** `canAccessAdminPanel(roles)` = `isAdminOrAbove || isReadOnlyManager` → SUPER_ADMIN, ADMIN, PRESIDENT, CADRE. Others are pushed to `/`. A second guard (`if (status === 'unauthenticated' || !canAccess) return null`) prevents any flash of admin content.

Three distinct permission tiers govern the UI — do not collapse them:
- `isSuperAdminUser` → **Menus** tab, and `isSuperAdmin` prop for `ULsTab` / `BannersTab`.
- `isAdminUser` (`isAdminOrAbove`) → **Unités Locales** tab, full-write `UsersTab`.
- `isReadOnly` = `isReadOnlyManager(roles) && !isAdminUser` — Président/Cadre viewing their UL's members. The `&& !isAdminUser` is load-bearing: without it an admin who is also Président would be locked into read-only. The page description text also switches on `isAdminUser`.

The **Utilisateurs** and **Bandeaux** tabs are visible to all four roles; only Menus and ULs are gated.

**Impersonation** goes through NextAuth session `update({ impersonateEmail })` — not an API route — then `router.push('/')` + `router.refresh()`. `session.user.originalEmail` is passed to `UsersTab` so it can show who is really signed in.

Mutations update local state optimistically rather than refetching: `createUser` appends a locally-constructed `User` (with `papiers_valides: 0` and today's `start_date_invalidation_process`) and re-sorts by email; `deleteUser` filters by email; `validatePapers` patches the matching row. If you add a field to the `User` interface, add it to the `createUser` construction too or the new row will be missing it until reload.

`validatePapers` dispatches a `license-validated` window `CustomEvent` after success so other mounted components (license banners) can react. Keep that event name.

Note the identifier asymmetry in the API calls: validate uses **user id** (`/api/users/{id}/validate-papers`), delete uses **email** (`/api/users/{email}`). Both are `encodeURIComponent`-wrapped.

`fetchUsers()` treats a 403 as a redirect to `/` rather than an error. Errors use `console.error` plus the in-page `toast` state (4 s auto-dismiss) rather than `alert()`.

## Dependencies

### Internal
- `@/components/admin/UsersTab`, `MenusTab`, `ULsTab`, `BannersTab`
- `@/lib/roles` — `isSuperAdmin`, `isAdminOrAbove`, `isReadOnlyManager`, `canAccessAdminPanel`
- `GET /api/users` → `{ users, availableRoles }`; `POST /api/users`; `DELETE /api/users/{email}`; `PATCH /api/users/{id}/validate-papers`
- NextAuth `useSession().update()` for impersonation

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# admin

## Purpose
Admin-only administration UI. Four of the five files are *tab panels* rendered by the tabbed admin page `src/app/users/page.tsx` (users, ULs, banners, menu visibility). The fifth, `ImpersonationBanner`, is mounted globally in `src/app/layout.tsx` and only renders when the current session is impersonating another account.

## Key Files
| File | Description |
|------|-------------|
| `UsersTab.tsx` | User list with search + client-side pagination (6/page), role badges, papers validation, add/delete user, home-UL assignment, impersonation trigger. Also contains the private `ManageUserULsModal` (multi-UL rights editor) and renders `users/RoleLegend`. |
| `ULsTab.tsx` | CRUD for ULs (unités locales): name, slug, DT code, phone numbers list, default parking spots, base64 stamp image. Owns its own toast state. |
| `BannersTab.tsx` | CRUD for in-app banners — message, `target_page` (`ALL`/`VEHICLES`/`MISSIONS`/`INVENTORY`), `type` (`info`/`warning`/`danger`/`success`), global vs per-UL scope, active flag, optional link URL/label. Exports the `Banner` interface. |
| `MenusTab.tsx` | Per-module visibility switch (`stats`, `inventory`, `missions`) with three states: `available` / `admin_only` / `disabled`. Optimistic update with revert on failure. |
| `ImpersonationBanner.tsx` | Red top banner while impersonating; "Retourner à mon compte" calls `useSession().update({ impersonateEmail: null })` then routes to `/users`. |

## For AI Agents

### Working In This Directory
Two distinct prop conventions coexist here — match the one already used by the file you touch:

- **`UsersTab` is fully controlled.** It receives `users`, `availableRoles`, `isAdmin`, `isReadOnly`, and callbacks (`onValidatePapers`, `onCreateUser`, `onDeleteUser`, `onImpersonate`, `onRefreshUsers`, `showToast`) from the page. It does *not* fetch the user list itself — only the UL list (`GET /api/ul`) and per-user UL rights.
- **`ULsTab` / `BannersTab` are self-fetching.** They take only `isSuperAdmin` + `userUlId` (+ `showToast` for banners) and load/mutate their own data on mount.

`MenusTab` takes no props at all — it reads and refreshes through `useMenuSettings()` from `@/lib/contexts/MenuSettingsContext`.

**Role visibility.** Write actions in `UsersTab` are gated on `isAdmin && !isReadOnly` (read-only roles such as PRESIDENT/CADRE see the list but no mutate buttons). `ManageUserULsModal` reads roles from `useSession()` and uses `isSuperAdmin()` from `@/lib/roles` to decide whether the actor may grant rights on ULs other than their own. `ULsTab`/`BannersTab` gate UL creation/deletion and global-banner scope on the `isSuperAdmin` prop. The impersonate button is additionally hard-gated on a specific `originalUserEmail` in `UsersTab.tsx:231`.

**Styling.** No CSS Modules in this directory — these files use global classes (`modal`, `btn btn-primary`, `form-group`) plus inline styles on CSS variables (`var(--bg-secondary)`, `var(--text-secondary)`, `var(--radius-lg)`). Role colors in `users/RoleLegend` are the canonical role palette; reuse them rather than inventing new ones.

**Size.** `UsersTab.tsx` (~870 lines), `BannersTab.tsx` (~640), and `ULsTab.tsx` (~600) are well over the 150-line target. When editing them, prefer extracting a slice (a row, the add/edit modal, the form) into its own file per the Carpaccio rule rather than growing the file further.

## Dependencies

### Internal
- `GET/POST /api/ul`, `PATCH/DELETE /api/ul/[id]` — UL list and CRUD
- `PATCH /api/users/[email]/ul` — assign/remove a user's UL and per-UL roles (`{ ulId, isHome, roles?, action }`)
- `GET /api/banners?admin=true`, `PATCH/DELETE /api/banners/[id]` — banner list and mutations
- `PATCH /api/settings/menus/[key]` — `{ visibility }`
- `@/lib/roles` — `isSuperAdmin`; `@/lib/contexts/MenuSettingsContext` — `useMenuSettings`, `MenuVisibility`
- `@/components/users/RoleLegend` — collapsible role reference rendered inside `UsersTab`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

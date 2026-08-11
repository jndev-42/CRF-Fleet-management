<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# login

## Purpose
Authentication entry point (`/login`). Renders the Google OAuth sign-in button for production and, in dev or preview environments, a grid of one-click role-impersonation buttons. Also surfaces the `AccessDenied` error (non-`@croix-rouge.fr` address) and the RGPD data-collection notice linking to `/mentions-legales`.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | **Server Component** (async, no `'use client'`) — redirects signed-in users to `/`, resolves `searchParams`, and renders the sign-in forms as inline Server Actions. |

## For AI Agents

### Working In This Directory
**No session required** — this is the unauthenticated entry point. If `await auth()` finds a user, it `redirect("/")` immediately.

This page is a deliberate exception to the "all pages are Client Components" convention: it must call `signIn` from `@/auth` inside `"use server"` form actions. Keep it a Server Component.

Three environment modes, resolved from `isPreview` / `isDev` in `@/lib/env`:
- **preview** — one-click buttons come from `PREVIEW_ACCOUNTS`; the Google button is hidden entirely.
- **dev** (not preview) — one-click buttons come from the local `DEV_ROLES` array (superadmin, admin, president, tresorier, cadre, chvl, ci, guest, jeannoel); the Google button is labelled "Connexion Google (prod)".
- **production** — no one-click buttons, only Google plus the `@croix-rouge.fr` restriction copy.

Both one-click and Google forms are `<form action={async () => { "use server"; await signIn(...) }}>`. One-click uses the `dev-credentials` provider with a `role` key; Google uses the `google` provider.

**Open-redirect guard — do not remove:** `callbackUrl` from `searchParams` is only honoured when it `startsWith('/')` and does **not** start with `//`, otherwise it falls back to `/`. Any change to `callbackUrl` handling must preserve that check.

`DEV_ROLES` is a local `as const` array of `{ key, label, badge, color }`. Adding a dev persona means adding an entry here *and* a matching case in the `dev-credentials` provider in `src/auth.ts`.

## Dependencies

### Internal
- `@/auth` — `signIn`, `auth`
- `@/lib/env` — `isPreview`, `isDev`
- `@/lib/preview-accounts` — `PREVIEW_ACCOUNTS`
- Links to `/mentions-legales` via `next/link`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

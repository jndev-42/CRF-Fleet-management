<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# React Contexts

## Purpose
Client-side React Context providers for app-wide state management: UL (organizational unit) selection and switching, menu visibility settings, and demo mode toggling. All contexts are used in the root layout or provider wrappers.

## Key Files
| File | Description |
|------|-------------|
| `ULContext.tsx` | Tracks active UL and available ULs from session; exports `useUL()` hook and `ULProvider` |
| `MenuSettingsContext.tsx` | Fetches menu visibility settings from `/api/settings/menus`; exports `useMenuSettings()` hook and `MenuSettingsProvider` |
| `DemoContext.tsx` | Manages demo mode toggle via localStorage and fetch interceptor; exports `useDemoMode()` hook and `DemoProvider` |

## For AI Agents

### Working In This Directory
- All three contexts are React Client Components (`'use client'`)
- Export both a **Provider component** (e.g., `ULProvider`) and a **useContext hook** (e.g., `useUL`)
- ULContext reads from NextAuth session; MenuSettingsContext fetches async; DemoContext uses localStorage
- No DB queries or async side effects beyond fetching in MenuSettingsProvider
- When adding a new context, follow the same Provider + hook pattern and wrap it in the root layout

## Dependencies

### Internal
- `@/auth` via `next-auth/react` (session, update hook)
- `@/lib/demo/fetchInterceptor` (DemoContext initializes fetch interceptor)


<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# aide

## Purpose
Help & contacts page (`/aide`) — the operational phone directory and self-service utilities for every authenticated user. It shows vehicle insurance/assistance references (AXA XL policy number, AXA Assistance convention + France/abroad hotlines), the phone numbers of the active Unité Locale (fetched dynamically), and hardcoded Paris-département emergency directories (Direction 75, Astreintes 75, COT 75, PCM 75). It also hosts two app-level toggles: relaunching the interactive onboarding tour, and switching Demo Mode on/off.

## Key Files
| File | Description |
|------|-------------|
| `layout.tsx` | **Server Component** auth guard — `await auth()`, `redirect('/login')` if no session. The only server-side file here. |
| `page.tsx` | Client page rendering the VCard download button, tour/demo-mode cards, insurance card, and the contacts grid. |

## For AI Agents

### Working In This Directory
**Minimum role: any authenticated user.** No role gate — the guard in `layout.tsx` only requires a session, so GUEST/inactive-adjacent users can read this page.

Data flow: a single `useEffect` fetches `GET /api/ul` on mount and stores `uls` in state; the list is then filtered against `activeUL` from `ULContext`, so only the currently selected Unité Locale's numbers render (when no UL is active, all are shown). Failures are swallowed with an empty `.catch(() => {})` and `loading` is cleared in `finally` — there is no error UI.

Two context hooks drive behaviour: `useDemoMode()` (`isDemoMode`, `toggleDemoMode`) and `useUL()` (`activeUL`). The demo-mode card changes its border and button colour to orange `#ff9800` when active.

`handleRestartTour()` removes the `tour-completed` key from `localStorage`, navigates to `/`, then dispatches a `restart-tour` window event after a 500 ms delay so the destination page has mounted its listener first. If you touch the tour component, keep that event name and the ordering intact.

The VCard button is a plain `<a href="/api/vcard" download>` — an intentional file download, not internal navigation, so `next/link` does not apply.

Note that most phone numbers are **hardcoded JSX**, not data — only the UL block is dynamic. Adding a new département directory means editing this file.

`layout.tsx` is a Server Component by design (auth guard). Do not convert `page.tsx` to a Server Component — the M-4 migration has not started.

## Dependencies

### Internal
- `@/auth` — `auth()` in the layout guard
- `@/lib/contexts/DemoContext` — `useDemoMode`
- `@/lib/contexts/ULContext` — `useUL`
- `GET /api/ul` — Unités Locales with their `phoneNumbers`
- `GET /api/vcard` — generates `Annuaire_CRF_Paris.vcf`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

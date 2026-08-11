<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# components

## Purpose
Shared React UI components used across pages, plus feature-specific component subdirectories.

## Key Files
| File | Description |
|------|-------------|
| `Navbar.tsx` | Main app navigation |
| `NotificationBell.tsx` | In-app notification dropdown |
| `PhotoViewer.tsx` | Lightbox for Drive-hosted photos |
| `ThemeProvider.tsx` / `ThemeToggle.tsx` | Dark/light theme (next-themes) |
| `OneSignalProvider.tsx` | Push notification bootstrap |
| `BugReportButton.tsx` / `BugReportModal.tsx` | In-app bug reporting |
| `CommunicationBanner.tsx` / `DemoBanner.tsx` / `LicenseBanner.tsx` | Top-of-app banners |
| `GuidedTour.tsx` | Onboarding tour |
| `FooterChangelog.tsx` | Footer changelog link/version |
| `KonamiEasterEgg.tsx` | Easter egg |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `admin/` | Admin-only UI (see `admin/AGENTS.md`) |
| `expenses/` | Expense report UI (see `expenses/AGENTS.md`) |
| `incident/` | Incident report UI (see `incident/AGENTS.md`) |
| `inventory/` | Inventory/stock UI (see `inventory/AGENTS.md`) |
| `missions/` | Mission management UI (see `missions/AGENTS.md`) |
| `stats/` | Statistics/charts UI (see `stats/AGENTS.md`) |
| `ui/` | Generic reusable primitives (see `ui/AGENTS.md`) |
| `users/` | User administration UI (see `users/AGENTS.md`) |
| `vehicle/` | Vehicle detail/trip/reservation UI (see `vehicle/AGENTS.md`) |

## For AI Agents

### Working In This Directory
New component/modal → invoke `/component-templates` skill for modal JSX, form hierarchy, and role-visibility patterns.

### Carpaccio rule — slice thin, extract early
Any distinct UI section must live in its own component file. Never leave large inline JSX blocks inside page files or parent components. When a piece of UI has a clear identity (a legend, a toolbar, a card, a panel, a table, a stat block…), extract it immediately — even if it's currently small.

### Component size rule
Target: under 150 lines per component file. Split at natural concern boundaries — not to hit a number. Always extract stateful logic into custom hooks (`use*.ts` in the same folder or a `hooks/` subfolder).

### Styling — three layers
1. **Global classes** (`modal`, `btn btn-primary`, `form-group`, `form-label`) — shared structural patterns
2. **CSS Modules** (`.module.css` co-located) — component-specific layout/styles
3. **Inline styles** — only for dynamic values; always use CSS variables

### Icons — lucide-react only
```tsx
import { Car, CheckCircle } from 'lucide-react';
<Car size={18} />
```

### Language
All user-facing text in **French**.

## Dependencies

### External
- `lucide-react` — icons only
- `next-themes` — theme state

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

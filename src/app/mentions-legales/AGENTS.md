<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# mentions-legales

## Purpose
Static legal page (`/mentions-legales`) holding the French *mentions légales* and the RGPD privacy policy for the Martine app: publisher identity (Croix-Rouge unité locale de Paris 18, Loi 1901 association), the app owner and contact email, hosting details (Vercel in the USA for the site, Turso in Ireland for the database), and four RGPD sections — why data is collected, who can access it, how long it is kept, and how to exercise access/rectification/deletion rights.

## Key Files
| File | Description |
|------|-------------|
| `page.tsx` | Client Component — "Retour à l'accueil" link plus four `detail-card` sections of static legal copy. No state, no data fetching. |

## For AI Agents

### Working In This Directory
**No role required and no session needed** — this page must stay publicly reachable, since `/login` links to it before sign-in. Do not add an auth guard or a role check.

All content is hardcoded JSX. There are no API calls, no props, and no state. Icons come from `lucide-react` (`Shield`, `Mail`, `Building`, `Globe`, `Server`, `FileText`, `Info`, `ArrowLeft`), tinted with `var(--crf-red)`.

This is a **compliance document**, not ordinary copy. Company names, addresses, policy references, retention periods, and the contact email are legally meaningful — do not reword, "improve", or translate them without an explicit instruction. Fixing a genuine typo is fine; paraphrasing an RGPD clause is not.

Text uses typographic apostrophes (`’`) directly rather than `&apos;`, which is valid inside JSX text nodes here.

## Dependencies

### Internal
- `next/link` — back-link to `/`
- `lucide-react` — section icons
- Global CSS classes: `page-container`, `page-header`, `page-title`, `page-description`, `detail-card`, `section-title`, `btn btn-secondary`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

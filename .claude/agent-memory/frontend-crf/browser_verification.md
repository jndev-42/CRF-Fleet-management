---
name: browser-verification
description: How to actually run the app and screenshot it (Playwright) for this Next.js repo, including dev login and gotchas
metadata:
  type: project
---

To visually verify UI work in this repo (no project `/run` skill exists yet — checked `.claude/skills/`, only `component-templates.md`, `page-template.md`, `api-route-template.md`, `dev-setup.md`):

- `npm run dev` starts the container DB + Next.js on :3000 (webpack, not Turbopack). Wait for `GET /login 200` in the log, not just process start.
- Dev one-click login: go to `/login`, click a role button (e.g. "Admin", "Chauffeur"). Uses NextAuth `dev-credentials` provider, no password. Roles: superadmin, admin, president, tresorier, cadre, chvl, ci, guest — see `src/app/login/page.tsx` `DEV_ROLES`.
- `@playwright/test` is a devDependency (`playwright`, `playwright-core` present in `node_modules/.bin`), but plain `node script.mjs` run from `/tmp` or the scratchpad fails with `ERR_MODULE_NOT_FOUND` for `playwright` — Node's ESM resolution needs the script inside the project tree (so it can see `node_modules`). Copy the script into a throwaway dir under the repo root (e.g. `.scratch_playwright/`), run it with `node`, then `rm -rf` it afterward — don't commit it.
- Dark/light theme: `next-themes` here does NOT follow the browser's `prefers-color-scheme` — Playwright's `colorScheme: 'light'` context option has no effect. Default app theme is dark. To force a theme, click the actual toggle button in the DOM: `page.locator('button[aria-label^="Passer en mode"]')` (aria-label is "Passer en mode clair" when currently dark, "Passer en mode sombre" when currently light) — `getByRole('button', { name: /Passer en mode/ })` mysteriously did not match this element (count 0) even though the aria-label matched the regex; the attribute-selector locator worked fine. Worth a look if it recurs.

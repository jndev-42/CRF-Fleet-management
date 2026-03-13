# Lint Enforcement

**Zero-tolerance policy:** `npm run lint` must produce **0 errors and 0 warnings** at all times.

**Pre-commit hook (Husky + lint-staged):** Every commit automatically runs ESLint with `--max-warnings=0` on all staged `.ts`/`.tsx` files. A commit that introduces lint issues will be rejected.

**When adding `any`:** Always use `// eslint-disable-next-line @typescript-eslint/no-explicit-any -- <reason>` with a mandatory justification comment. Prefer typed alternatives:
- Catch blocks: use `catch (e: unknown)` + `e instanceof Error ? e.message : String(e)`
- API response shapes: use typed interfaces or `Record<string, unknown>`
- Use `src/lib/utils/error.ts` `getErrorMessage(e)` for consistent error message extraction

**React hooks rules:**
- `react-hooks/exhaustive-deps` disables require a comment explaining why the dep is intentionally omitted
- `react-hooks/set-state-in-effect` disables are only allowed for SSR hydration guards
- Prefer wrapping callbacks in `useCallback` over disabling the rule

**Next.js rules:**
- Always use `<Link>` from `next/link` instead of `<a>` for internal navigation
- Always use `<Image>` from `next/image` instead of `<img>` for static assets
- Dynamic/proxy image URLs (e.g. `/api/drive/photos/...`) may use `<img>` with an `eslint-disable` comment

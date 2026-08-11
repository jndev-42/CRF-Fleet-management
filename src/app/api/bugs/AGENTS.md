<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# bugs

## Purpose
Bug report submission system. Users submit browser errors, console logs, network requests, and page context. Reports are auto-created as GitHub issues in the CRF repo with labels `bug` and `user-report`. Requires auth and a non-inactive role (not GUEST or INACTIF). No database writes — external integration with GitHub API only.

## Subdirectories
- `report` — POST endpoint to submit a bug report and create GitHub issue

## For AI Agents

### Working In This Directory
This is a container directory with the `report` subdirectory for POST bug submissions. Credentials check is non-standard: users must have at least one active role (not purely GUEST/INACTIF). The GitHub API token is required in `process.env.GITHUB_TOKEN` or requests fail with 502. Reports are markdown-formatted with collapsible details sections for logs and network activity.

## Dependencies

### Internal
- GitHub API (`https://api.github.com/repos/jndev-42/CRF-Fleet-management/issues`)
- `@/auth` — session for user identity
- `process.env.GITHUB_TOKEN` — required

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# Demo Mode

## Purpose
Implements a complete offline-first demo mode by storing mock data in localStorage and intercepting all `/api/` calls to return mock responses. Allows users to test the app without a backend or live database. Includes mock vehicle, trip, mission, and maintenance data with full CRUD operations.

## Key Files
| File | Description |
|------|-------------|
| `DemoDB.ts` | In-memory demo database with initial vehicles/missions/users; static methods for CRUD on trips, vehicles, missions, maintenance |
| `fetchInterceptor.ts` | Wraps `window.fetch` to route `/api/` calls to `DemoDB` and return mock responses when demo mode is active |

## For AI Agents

### Working In This Directory
- **Demo mode is opt-in**: toggled via `DemoContext` and stored in localStorage under `crf_is_demo_mode`
- `fetchInterceptor` is set up on client mount in `DemoProvider`
- All API routes in `fetchInterceptor` use regex pattern matching to identify endpoints; `/api/auth/` is never intercepted
- Mock data includes: vehicles (VPSP ambulance, VL light vehicle), demo users with roles, missions, trips, maintenance records
- `DemoDB` stores everything in a single localStorage key (`crf_demo_db`) — no actual database
- When adding new API endpoints to intercept: add a new regex pattern and mock response in `fetchInterceptor.ts`
- If tests need demo mode, import `DemoDB` directly; it works in Node (though `window` checks prevent most operations outside browser)

### Notable Implementation Details
- Timestamps are ISO strings for consistency
- Vehicle IDs use `encodeURIComponent` for encoding/decoding (handles spaces in IDs like "VPSP - 18-01")
- Second driver can be patched on trips; orphaned IDs default to `null`
- Maintenance records track vehicle ID and type (CT, REVISION, CT_REVISION)
- Stats endpoint returns empty aggregations to avoid calc complexity in demo

## Dependencies

### Internal
- `@/app/vehicles/[id]/types` (Vehicle, Trip, MaintenanceRecord interfaces)
- `@/lib/contexts/DemoContext` (IS_DEMO_MODE_KEY)


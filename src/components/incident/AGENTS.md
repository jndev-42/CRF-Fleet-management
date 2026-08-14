<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# incident

## Purpose
PDF rendering for vehicle incident reports ("rapport d'incident"). This directory holds a single `@react-pdf/renderer` document — the incident *form* UI lives in `src/components/vehicle/modals/IncidentReportModal.tsx`, not here.

## Key Files
| File | Description |
|------|-------------|
| `IncidentPdfDocument.tsx` | A4 `Document` for an incident report: header with logo and generation date, vehicle/driver/date/location block, then conditional sections driven by `report.type` — `flashDetails`, `accidentDetails`, `damages`, `victims`, `actions`, `context`, free-text `description` and `retrospection`, plus an appended photo gallery from the `photos` prop. |

## For AI Agents

### Working In This Directory
**This is not a browser component.** It is instantiated server-side via `createElement` in `src/app/api/incidents/[id]/pdf/route.ts` and streamed as a PDF. Consequences:

- No `'use client'`, no hooks, no state, no event handlers.
- Layout uses `StyleSheet.create` from `@react-pdf/renderer` — **not** CSS Modules and **not** global classes. `View`/`Text`/`Image`/`Svg`/`Path` replace `div`/`span`/`img`.
- Icons must be drawn as `<Svg><Path/></Svg>`; `lucide-react` does not render in `@react-pdf`.
- Only a subset of flexbox is supported and there is no cascade — style every element explicitly.

**Props are all optional and defensively typed.** `IncidentReport` fields are `?`-optional because the DB row is cast loosely at the call site (`report as unknown as Parameters<typeof IncidentPdfDocument>[0]['report']`). Guard every nested access (`report.damages?.…`) — a missing sub-object must not throw inside PDF generation. `photos` defaults to `[]`.

Section visibility branches on `isAccident = report.type === 'ACCIDENT'`; a new incident type means adding a branch here, not widening an existing one. All labels are in French.

## Dependencies

### Internal
- `src/app/api/incidents/[id]/pdf/route.ts` — the only consumer; supplies `report`, `logoSrc` (base64 PNG), `generatedAt`, and `photos`
- Incident data originates from `src/components/vehicle/modals/IncidentReportModal.tsx` → `src/app/api/incidents/*`

### External
- `@react-pdf/renderer`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

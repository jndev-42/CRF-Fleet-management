<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# vehicle

## Purpose
Vehicle detail-page UI: badges, trip/reservation timeline, checklist, maintenance, fuel, Renault Connect telemetry block, and the check-in/checkout/edit modal set.

## Key Files
| File | Description |
|------|-------------|
| `DetailCard.tsx` | Vehicle detail summary card |
| `TripItem.tsx` | Single trip row in vehicle history |
| `ReservationBlock.tsx` / `Reservation.module.css` | Reservation display block |
| `RecurrencePanel.tsx` / `RecurrencePanel.module.css` | Recurring reservation config panel |
| `VehicleCalendar.tsx` / `VehicleCalendar.module.css` | Vehicle availability calendar |
| `VehicleBadges.tsx` | Status/role badges |
| `VehicleNotes.tsx` | Free-text notes |
| `VehicleInteractiveSVG.tsx` | Interactive vehicle diagram (damage reporting) |
| `ChecklistItems.tsx` | Checklist display during a trip |
| `ChecklistManager.tsx` | Checklist admin editing (separate from `ChecklistItems.tsx` on purpose) |
| `MaintenanceCard.tsx` | Maintenance summary card |
| `FuelBar.tsx` | Fuel level indicator |
| `RenaultConnectBlock.tsx` | Renault Connect telemetry display |
| `IncidentGuidelines.tsx` | Incident reporting guidance text |

## Subdirectories
| Directory | Purpose |
|-----------|---------|
| `modals/` | Self-contained modals (checkin/checkout/edit/etc.) (see `modals/AGENTS.md`) |

## For AI Agents

### Working In This Directory
This directory has its own actively-maintained `CLAUDE.md` — treat it as authoritative; the guidance below mirrors it.

### Types & utils
Import shared types from `@/app/vehicles/[id]/types` and date helpers from `@/app/vehicles/[id]/utils`. Don't redefine `Trip`, `Vehicle`, or `Reservation` types locally.

### Props pattern — pass callbacks, don't fetch
Vehicle components receive data and callbacks as props. They do **not** fetch from the API directly.
```tsx
interface TripItemProps {
  trip: Trip;
  vehicle: Vehicle;
  userRoles: string[];
  onDelete: (tripId: string) => Promise<void>;
  onViewPhotos: (folderId: string) => void;
}
```

### Size rule
`ChecklistManager.tsx` and `ChecklistItems.tsx` are separate for a reason — manager = admin editing, items = display during trip. Split complex components using hooks (form state → `useCheckOutForm(vehicle)`, photo upload → `usePhotoUpload()`).

### Styling
Mix of global classes (`trip-item`, `detail-card`) and CSS Modules for layout-heavy components (`ReservationBlock.module.css`). Check if a `.module.css` exists before adding one.

## Dependencies

### Internal
- `src/app/vehicles/[id]/types`, `src/app/vehicles/[id]/utils`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

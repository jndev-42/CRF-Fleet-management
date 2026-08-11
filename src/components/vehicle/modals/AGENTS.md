<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# modals

## Purpose
Self-contained vehicle modals — checkin/checkout, edit, maintenance, incident, QR, and history dialogs.

## Key Files
| File | Description |
|------|-------------|
| `CheckOutModal.tsx` / `EditCheckOutModal.tsx` | Vehicle checkout (start of trip) |
| `CheckInModal.tsx` | Vehicle checkin (end of trip) |
| `AddVehicleModal.tsx` / `EditVehicleModal.tsx` | Vehicle create/edit |
| `DeleteConfirmationModal.tsx` | Generic delete confirmation |
| `DesinfHistoryModal.tsx` / `DesinfPreCheckinModal.tsx` | Disinfection history / pre-checkin disinfection |
| `EditMetricsModal.tsx` | Mileage/metrics edit |
| `EditRevisionIntervalsModal.tsx` | Maintenance interval config |
| `IncidentHistoryModal.tsx` / `IncidentReportModal.tsx` | Incident history / new incident report |
| `MaintenanceHistoryModal.tsx` | Maintenance history |
| `PutInMaintenanceModal.tsx` | Take vehicle out of service for maintenance |
| `QRCodeModal.tsx` | Vehicle QR code display |

## For AI Agents

### Working In This Directory
Each modal is self-contained: owns its own form state and submits to the API itself. Props: `vehicle` (or relevant entity) + `onClose` + `onSuccess` + optional `onRefetch`.
```tsx
interface CheckOutModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onSuccess: () => void;
  onRefetch?: () => void;
}
```
Modals that prefill from session fetch `GET /api/auth/session` in a `useEffect` on mount — don't pass session as a prop.

CheckOut/CheckIn modals are complex by nature — split using hooks: form state + validation → `useCheckOutForm(vehicle)`, photo upload logic → `usePhotoUpload()`.

## Dependencies

### Internal
- `src/app/api/vehicles/[id]/*`, `src/app/api/trips/[id]/*` — submission targets

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

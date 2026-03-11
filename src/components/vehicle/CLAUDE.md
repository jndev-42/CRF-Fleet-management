# Vehicle Components

## Types & utils
Import shared types from `@/app/vehicles/[id]/types` and date helpers from `@/app/vehicles/[id]/utils`.
Don't redefine `Trip`, `Vehicle`, or `Reservation` types locally.

## Props pattern — pass callbacks, don't fetch
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

## Modals — co-located in `modals/`
Each modal is self-contained: owns its own form state and submits to the API itself.
Props: `vehicle` (or relevant entity) + `onClose` + `onSuccess` + optional `onRefetch`.

```tsx
interface CheckOutModalProps {
  vehicle: Vehicle;
  onClose: () => void;
  onSuccess: () => void;
  onRefetch?: () => void;
}
```

Modals that prefill from session fetch `GET /api/auth/session` in a `useEffect` on mount — don't pass session as a prop.

## Size rule
Modals (CheckOut, CheckIn) are complex by nature. Split using hooks:
- Form state + validation → `useCheckOutForm(vehicle)`
- Photo upload logic → `usePhotoUpload()`
- Checklist state → already in `ChecklistItems` component

`ChecklistManager.tsx` and `ChecklistItems.tsx` are separate for a reason — manager = admin editing, items = display during trip.

## Styling
Mix of global classes (`trip-item`, `detail-card`) and CSS Modules for layout-heavy components (`ReservationBlock.module.css`). Check if a `.module.css` exists before adding one.

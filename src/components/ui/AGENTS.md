<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# ui

## Purpose
Generic, feature-agnostic primitives shared across the app: the file/photo picker used by every upload flow, a searchable user dropdown, loading skeletons, and one animated success overlay. Nothing here knows about vehicles, missions, or expenses — anything domain-specific belongs in the matching feature directory.

## Key Files
| File | Description |
|------|-------------|
| `PhotoPicker.tsx` | The app's single file-selection component. Dual-mode: multi-file (`photos` + `onPhotosChange`) or single-file (`file` + `onFileChange`). Offers separate camera-capture and gallery inputs, thumbnail previews with per-item removal, PDF detection, and per-file/total size validation. Pre-compresses selections on pick. |
| `UserCombobox.tsx` | Searchable user dropdown — filters on name or email, click-outside to close, optional `excludeEmail`, and a `defaultLabel` (default `'Moi-même'`) for the empty value. Renders the special value `'UNASSIGNED'` as "Chauffeur non décidé". |
| `UserCombobox.module.css` | Trigger, dropdown panel, search input, and option styling. |
| `Skeleton.tsx` | Base `Skeleton` (variants `text` / `circular` / `rectangular` / `rounded`, `width`, `height`, passes through extra `div` props) plus composites `VehicleCardSkeleton` and `DashboardSkeletons({ count = 6 })`. |
| `Skeleton.module.css` | Shimmer/pulse animation and variant shapes. |
| `VehicleDetailSkeleton.tsx` | Page-shaped loading state for `src/app/vehicles/[id]/page.tsx`, composed from `Skeleton` + `VehicleCardSkeleton`. |
| `MarineApprovedOverlay.tsx` | Timed 5-step "MARINE APPROVED" stamp animation (backdrop → photo → rotating SVG seal → stamp+shake → fade), calling `onAnimationComplete()` at ~3.7 s. Easter egg. |
| `MarineApprovedOverlay.module.css` | Overlay, seal rotation, stamp slam, and shake keyframes. |

## For AI Agents

### Working In This Directory
**These components are consumed widely — changing a prop or a default is a cross-app change.** `PhotoPicker` alone is used by `vehicle/modals/CheckInModal`, `CheckOutModal`, `IncidentReportModal`, `expenses/ExpenseForm`, and `missions/steps/Step7SignedReport` + `Step8Photos`, and is covered by `src/__tests__/components/PhotoPicker.test.tsx` — run that test after any edit.

**`PhotoPicker`'s mode is inferred, not declared:** `isMultiple = !!onPhotosChange`. Pass either the `photos`/`onPhotosChange` pair or the `file`/`onFileChange` pair, never both. Other behavior worth preserving:
- Defaults are `maxSizeMB = 15`, `maxTotalSizeMB = 150`, `maxFiles = Infinity`, `accept = "image/*"`. The 150 MB total matches the serverless upload limit — don't raise it without checking the upload route.
- Multi-file mode accumulates valid files and reports **all** rejections as one joined French message; single-file mode rejects and returns early. Errors go both to internal state and the optional `onError` callback, which callers (e.g. `Step8Photos`) surface themselves.
- Compression happens at selection time via `compressImages`/`compressImage` from `@/lib/imageCompression`, so submit is instant — size checks run against the *compressed* file. Inputs are reset to `''` after handling so re-picking the same file still fires `onChange`.
- PDFs are detected by MIME **or** `.pdf` extension and shown as an icon instead of a thumbnail; pass `accept` explicitly to allow them.

**`UserCombobox` is fully controlled** — it receives the `users` array and does not fetch. `''` means "the default label" and `'UNASSIGNED'` is a sentinel the parent interprets; keep both.

**`MarineApprovedOverlay` is a deliberate easter egg**, gated by its callers (`missions/MissionWizard` shows it only for `ul-paris-18`; `vehicle/modals/CheckInModal` has its own condition). Its `useEffect` timeline clears all five timeouts on unmount — preserve that on any timing change, and keep `onAnimationComplete` firing exactly once since callers navigate from it.

**Adding here vs. elsewhere:** a component belongs in `ui/` only if it has no domain types in its props. `VehicleDetailSkeleton` sits at the edge of that rule — it's a layout-shaped skeleton, not vehicle logic.

## Dependencies

### Internal
- `@/lib/imageCompression` — `compressImage`, `compressImages` (`PhotoPicker`)
- No API calls from this directory — all data arrives via props

### External
- `lucide-react` — icons; `next/image` — the overlay's image

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

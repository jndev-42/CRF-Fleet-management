<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# steps

## Purpose
The nine step panels of the mission-report wizard. Each is a presentational panel rendered one at a time by `../MissionWizard.tsx`, which owns all of the state; the steps only read `data`/`supplies` and emit patches.

## Key Files
| File | Description |
|------|-------------|
| `Step1General.tsx` | Mission type radios (`RESEAU` shown as "Réseaux", `DPS`, `PAPS`), mission name, date, location, victim count (clamped to ≥ 0). |
| `Step2Vehicle.tsx` | Vehicle select (DB vehicles + `EXTERNAL_VEHICLES`), driver select, Pegass toggle, volunteers textarea. The only step that fetches. |
| `Step3Supplies.tsx` | Consumed-supplies accordion by category (`SAC_PRIMAIRE` open by default), one number input per item, per-category total badge. |
| `Step4Oxygen.tsx` | Same quantity-input pattern restricted to the oxygen category. |
| `Step5Team.tsx` | Submitter's home-UL presence toggle (label built from `currentUserUlName` prop, e.g. "Présence UL Paris 18 ?", falls back to "Présence mon UL ?"); when true, reveals team dynamics radios (`BIEN`/`PLUTOT_BIEN`/`PEUT_MIEUX`/`SUJET`), two yes/no toggles, and a free comment. |
| `Step6Incidents.tsx` | Three critical-incident checkboxes (ACR, hémorragie grave, prise en charge complexe); the follow-up question appears only if one is checked. |
| `Step7SignedReport.tsx` | Single-file `PhotoPicker` (image or PDF) for the mandatory signed report on DPS/PAPS missions. |
| `Step8Photos.tsx` | Multi-file `PhotoPicker` for communication photos; displays `uploadError` from the wizard. |
| `Step9Comment.tsx` | Free-text `mission_comment` textarea — optional, always shown (not conditionally gated), positioned right before Photos. Distinct from `Step5Team`'s `free_comment`. |

## For AI Agents

### Working In This Directory
**Two prop shapes, no local form state.** Steps that edit the report take `{ data: MissionFormData; onChange: (patch: Partial<MissionFormData>) => void }` and call `onChange` with only the changed keys. Supply steps take `{ supplies: Record<string, number>; onSupplyChange: (key, qty) => void }`. Import `MissionFormData` from `../MissionWizard` — never redeclare it, and never add a `useState` mirroring a `data` field.

**The supplies key convention is `` `${CATEGORY}__${item.name}` ``** — the wizard splits on that `__` separator when building the API payload, so any new supply input must use it. Quantities are clamped with `Math.max(0, parseInt(v, 10) || 0)`.

**Conditional reveals are one-way clears.** `Step5Team` resets the dependent fields to `null` when UL presence is set to "Non" (`presence_ul: false, team_dynamics: null, all_found_place: null, member_difficulties: null, free_comment: null`) so a hidden field can never be submitted with a stale value. Follow that pattern for any new conditional block. `Step6Incidents` hides (but does not clear) `needs_followup` when no incident is checked.

**`Step2Vehicle` is the exception that fetches** — `GET /api/vehicles` and `GET /api/users?drivers=true` in parallel on mount, tolerating both an array and `{ vehicles }` response shape. It also holds the VPSP rule: when the selected vehicle is VPSP (`type === 'VPSP'` or `EXTERNAL_VPSP`), the driver list is filtered to holders of the `CHVPSP` role, including the "Moi" option. Changing the vehicle resets `driver_id` to `null`.

**Only local UI state is allowed** — e.g. `Step3Supplies` keeps its open-accordion `Set<SupplyCategory>` locally. That's fine; form values are not.

**Styling.** All eight steps import the parent's stylesheet: `import styles from '../MissionWizard.module.css'`. There is no per-step `.module.css` — add classes there, not in a new file. Structure uses global classes (`form-group`, `form-label`, `form-input`) with module classes for step-specific layout (`stepContent`, `stepTitle`, `radioGroup`, `toggleRow`, `accordion`). Icons from `lucide-react`. All text French.

## Dependencies

### Internal
- `../MissionWizard` — `MissionFormData` type
- `@/lib/mission-supplies` — `SUPPLIES_BY_CATEGORY`, `SupplyCategory`, `EXTERNAL_VEHICLES`
- `@/components/ui/PhotoPicker` — steps 7 (single-file mode) and 8 (multi-file mode)
- `GET /api/vehicles`, `GET /api/users?drivers=true` — `Step2Vehicle` only

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

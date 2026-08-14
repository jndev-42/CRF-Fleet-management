<!-- Parent: ../AGENTS.md -->
<!-- Generated: 2026-08-11 | Updated: 2026-08-11 -->

# checklist

## Purpose
Vehicle pre-trip checklist item management. Stores and maintains checklist items tied to vehicles (e.g., DSA, fuel, tires, lights). Admin-only resource for updating item labels, required status, and display order; for deleting custom items (DSA items are protected from deletion/label changes). Touches `VehicleChecklistItem` table.

## Subdirectories
- `[itemId]` — PATCH (update), DELETE (remove) individual checklist items

## For AI Agents

### Working In This Directory
This is a container directory with dynamic `[itemId]` segment for PATCH/DELETE operations. No direct route.ts in this directory. All checklist item operations go through `[itemId]` handler. DSA items (id starts with `dsa-`) have special protections: labels cannot be changed, required status cannot be unset, and they cannot be deleted.

## Dependencies

### Internal
- `VehicleChecklistItem` table
- `@/lib/roles` — `isAdminOrAbove()`

<!-- MANUAL: Any manually added notes below this line are preserved on regeneration -->

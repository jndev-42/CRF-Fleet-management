---
name: changelog-manager
description: Automatically maintains the CHANGELOG.md file using Semantic Versioning principles after completing development tasks.
---

# Changelog Management Skill

As an autonomous agent, you are responsible for maintaining the project's `CHANGELOG.md` file whenever you implement new features, fix bugs, or make significant changes to the codebase.

## Trigger Conditions
- You have completed a feature implementation.
- You have resolved a bug.
- You have refactored a significant portion of the codebase.
- You have completed a task that alters user-facing behavior or core architecture.

## Workflow
1. **Assess the Impact:** After completing your coding task, evaluate the changes made. Determine if the updates justify a new version release or should be appended to the "Unreleased" section if one exists.
2. **Determine Semantic Version (SemVer):** It is up to you to decide whether to increment the version number in `CHANGELOG.md` based on semantic versioning rules:
   - **MAJOR (x.0.0):** Incompatible changes, major architectural shifts, or complete system rewrites.
   - **MINOR (0.x.0):** Addition of functionality in a backward-compatible manner (e.g., adding a new field, a new button, a new standalone page or system).
   - **PATCH (0.0.x):** Backward-compatible bug fixes, minor UI tweaks, or documentation updates.
3. **Update `CHANGELOG.md`:** Write a concise, clear entry detailing the changes exactly under the proper version header. Use standard categories like `### Added`, `### Changed`, `### Fixed`, `### Deprecated`, or `### Removed`.
4. **Content Language:** While these instructions are in English, ensure the changelog entries are written in the primary language of the project (French, in this case).

## Example Format
```md
## [1.1.0] - 2026-03-02
### Added
- Ajout de l'option "Urgence" dans la liste des missions.
- Le 2ème conducteur peut désormais être ajouté en cours de route.

### Fixed
- Correction d'un bug d'affichage sur mobile.
```

## Rules
- Always decide the version bump (Major, Minor, or Patch) autonomously based on your understanding of what you just built.
- Do not ask the user for permission to update the changelog if you deem it necessary; just do it as part of your final workflow steps before notifying the user of task completion.

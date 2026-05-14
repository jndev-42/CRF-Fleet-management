/**
 * Shared utility functions for user management.
 */

/**
 * Resolves the final set of roles for a user based on input roles.
 * Handles normalization between 'INACTIF' and 'GUEST'.
 *
 * NOTE: Previously this function auto-assigned the 'SECOURISTE' role
 * to any active user. This has been removed to allow manual assignment only.
 */
export function resolveRoles(roles: string[]): string[] {
    // 'INACTIF' is the current inactive role; 'GUEST' is the legacy alias (DB backfill pending)
    const isInactiveRole = (r: string) => r === 'INACTIF' || r === 'GUEST';
    const activeRoles = roles.filter(r => !isInactiveRole(r));

    if (activeRoles.length === 0) {
        // Preserve whatever inactive role was passed (GUEST or INACTIF) — DB backfill handles normalization
        const inactiveRole = roles.find(isInactiveRole);
        return inactiveRole ? [inactiveRole] : [];
    }

    // Auto-assignment of SECOURISTE removed as per bug report.
    // Users should only have the roles explicitly assigned to them.

    return activeRoles;
}

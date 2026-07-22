/**
 * Text labels corresponding to vehicle statuses.
 */
export const statusLabels: Record<string, string> = {
    AVAILABLE: 'Disponible',
    IN_USE: 'En mission',
    MAINTENANCE: 'Maintenance',
};

/**
 * CSS classes corresponding to vehicle statuses.
 */
export const statusClass: Record<string, string> = {
    AVAILABLE: 'available',
    IN_USE: 'inuse',
    MAINTENANCE: 'maintenance',
};

/**
 * Get CSS class suffix for fuel bar coloring.
 * @param level Fuel percentage (0-100)
 */
export function getFuelClass(level: number): string {
    if (level >= 50) return 'full';
    if (level >= 25) return 'mid';
    return 'low';
}

/**
 * Check if the vehicle is connected via Renault connect.
 * A vehicle is connected if it has a VIN stored in the database.
 */
export function isConnected(vin: string | null | undefined): boolean {
    return !!vin;
}

/**
 * Format an ISO date string to a readable French date.
 */
export function formatDate(d: string): string {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
        timeZone: 'Europe/Paris',
    });
}

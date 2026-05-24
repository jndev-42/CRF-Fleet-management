export function boolLabel(val: boolean | null): string {
    if (val === null) return '—';
    return val ? 'Oui' : 'Non';
}

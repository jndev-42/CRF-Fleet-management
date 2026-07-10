/**
 * Comptes de test préchargés pour l'environnement preview.
 * Ces utilisateurs doivent exister dans la base de données preview
 * (voir scripts/seed-preview-users.sql).
 *
 * Le domaine @preview.local est reconnu par auth.ts comme un domaine
 * interne (comme @dev.local) pour bypasser la vérification @croix-rouge.fr.
 */

export const PREVIEW_ACCOUNTS = [
    {
        key: 'preview-admin',
        email: 'preview-admin@preview.local',
        name: 'Admin Preview',
        badge: 'ADMIN',
        color: '#ef4444',
        label: 'Admin',
    },
    {
        key: 'preview-respo',
        email: 'preview-respo@preview.local',
        name: 'Responsable Preview',
        badge: 'RESPO',
        color: '#f97316',
        label: 'Responsable',
    },
    {
        key: 'preview-chvl',
        email: 'preview-chvl@preview.local',
        name: 'Chauffeur Preview',
        badge: 'CHVL',
        color: '#3b82f6',
        label: 'Chauffeur',
    },
    {
        key: 'preview-ci',
        email: 'preview-ci@preview.local',
        name: 'CI/RPAPS Preview',
        badge: 'CI/RPAPS',
        color: '#8b5cf6',
        label: 'CI/RPAPS',
    },
    {
        key: 'preview-secouriste',
        email: 'preview-secouriste@preview.local',
        name: 'Secouriste Preview',
        badge: 'SECOUR.',
        color: '#10b981',
        label: 'Secouriste',
    },
    {
        key: 'preview-inactif',
        email: 'preview-inactif@preview.local',
        name: 'Inactif Preview',
        badge: 'INACTIF',
        color: '#6b7280',
        label: 'Inactif',
    },
] as const;

export type PreviewAccountKey = (typeof PREVIEW_ACCOUNTS)[number]['key'];

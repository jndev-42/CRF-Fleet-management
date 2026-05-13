export type SupplyCategory =
    | 'SAC_PRIMAIRE'
    | 'BRULURE'
    | 'HEMORRHAGIE'
    | 'KIT_DSA'
    | 'HYGIENE'
    | 'OXYGENE';

export interface SupplyItem {
    name: string;
}

export interface SupplyCategoryDef {
    label: string;
    items: SupplyItem[];
}

export const SUPPLIES_BY_CATEGORY: Record<SupplyCategory, SupplyCategoryDef> = {
    SAC_PRIMAIRE: {
        label: 'Sac primaire',
        items: [
            { name: 'Sérum physiologique' },
            { name: 'Languette dextro' },
            { name: 'Autopiqueur' },
            { name: 'Compresses' },
            { name: 'Couverture de survie' },
            { name: 'Poche de froid' },
            { name: 'Vomix' },
            { name: 'Sparadrap' },
        ],
    },
    BRULURE: {
        label: 'Brûlures',
        items: [
            { name: 'Brûle-stop / Burnshield' },
            { name: 'Couvertures stériles' },
            { name: 'Champs stériles' },
            { name: 'Gants stériles' },
        ],
    },
    HEMORRHAGIE: {
        label: 'Hémorragies',
        items: [
            { name: 'Couverture de survie stérile' },
            { name: 'Champs stériles' },
            { name: 'Gants stériles' },
            { name: 'ChitoSam' },
            { name: 'Pansement occlusif' },
            { name: 'Garrot tourniquet' },
            { name: 'Pansement Israélien' },
            { name: 'C.H.U' },
            { name: 'Pansement absorbant' },
        ],
    },
    KIT_DSA: {
        label: 'Kit & DSA',
        items: [
            { name: 'Kit accouchement' },
            { name: 'Kit membre sectionné' },
            { name: 'Kit AES' },
            { name: 'Patches DSA' },
            { name: 'Patches ECG' },
        ],
    },
    HYGIENE: {
        label: 'Hygiène',
        items: [
            { name: 'Gants S' },
            { name: 'Gants M' },
            { name: 'Gants L' },
            { name: 'Gants XL' },
            { name: 'Sopalin/Lavettes' },
            { name: 'Masques chirurgicaux' },
            { name: 'Masques FFP2' },
            { name: 'Draps' },
            { name: 'Kit EPI' },
            { name: 'Gel hydro' },
            { name: 'Rouleau sac rouge' },
            { name: 'Rouleau sac blanc/noir' },
            { name: 'Rouleau DASRI' },
        ],
    },
    OXYGENE: {
        label: 'Oxygénothérapie',
        items: [
            { name: 'Masque O2 haute concentration adulte' },
            { name: 'Masque O2 moyenne concentration adulte' },
            { name: 'Lunettes O2 adulte' },
            { name: 'BAVU adulte' },
            { name: 'Masque O2 haute concentration enfant' },
            { name: 'Masque O2 moyenne concentration enfant' },
            { name: 'Lunettes O2 enfant' },
            { name: 'BAVU enfant' },
            { name: "Valve d'impédance" },
            { name: 'Canules de Guédel' },
            { name: "Canules d'aspiration" },
            { name: "Bouteilles d'O2" },
            { name: 'Ceinture pelvienne' },
            { name: 'Collier cervical adulte' },
            { name: 'Collier cervical enfant' },
        ],
    },
};

export const SUPPLY_CATEGORIES: SupplyCategory[] = [
    'SAC_PRIMAIRE',
    'BRULURE',
    'HEMORRHAGIE',
    'KIT_DSA',
    'HYGIENE',
    'OXYGENE',
];

export const MISSION_TYPE_LABELS: Record<string, string> = {
    RESEAU: 'Réseaux',
    DPS: 'DPS',
    PAPS: 'PAPS',
};

export const TEAM_DYNAMICS_LABELS: Record<string, string> = {
    BIEN: 'Bien',
    PLUTOT_BIEN: 'Plutôt bien',
    PEUT_MIEUX: 'Peut mieux faire',
    SUJET: 'Sujet à traiter',
};

export const EXTERNAL_VEHICLES: Record<string, { name: string, type: string }> = {
    EXTERNAL_VL: { name: 'VL extérieure', type: 'VL' },
    EXTERNAL_VPSP: { name: 'VPSP extérieur', type: 'VPSP' },
};

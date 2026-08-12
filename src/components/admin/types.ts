export interface User {
    id: string;
    email: string;
    name: string | null;
    createdAt: string;
    roles: string[];
    papiers_valides: number;
    last_validation: string | null;
    start_date_invalidation_process: string | null;
    validated_by: string | null;
    homeUlId?: string | null;
    homeUlName?: string | null;
}

export interface ULEntry {
    id: string;
    name: string;
    slug: string;
}

export const DRIVER_ROLES = ['CHVL', 'CHVPSP'];

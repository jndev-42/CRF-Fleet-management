import { z } from 'zod';
import { isAcceptableMediaRef } from '@/lib/media/refs';
import { MISSION_TYPES } from '@/lib/mission-types';

/**
 * Type de mission d'une nouvelle prise : uniquement une valeur de la liste partagée,
 * pour qu'une variante orthographique (« Entrainement » sans accent, casse…) envoyée
 * par un client API ne scinde pas les statistiques par type.
 */
export const missionTypeSchema = z.enum(MISSION_TYPES, {
    error: (issue) => (issue.input === undefined || issue.input === ''
        ? 'Le type de mission est requis'
        : 'Type de mission inconnu'),
});

export const checkOutSchema = z.object({
    vehicleId: z.string().min(1),
    missionType: missionTypeSchema,
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessOut: z.string().optional(),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean(),
    commentsOut: z.string().optional(),
    secondDriverId: z.string().optional().nullable(),
    driveFolderId: z.string().max(512).refine(v => isAcceptableMediaRef(v, 'trip-photos'), 'Dossier de photos invalide').optional(),
    checklistOut: z.record(z.string(), z.boolean()).optional(),
    dataIncorrect: z.boolean().optional(),
    correctedMileage: z.number().int().min(0).optional(),
    correctedFuel: z.number().int().min(0).max(100).optional(),
    /** Confirmation explicite d'un kilométrage corrigé à la baisse (cf. mileageAnomaly.ts). */
    confirmMileageDecrease: z.boolean().optional(),
});

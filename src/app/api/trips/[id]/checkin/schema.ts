import { z } from 'zod';

export const checkInSchema = z.object({
    mileageIn: z.number().min(0).optional(),
    fuelIn: z.number().min(0).max(100).optional(),
    parkingIn: z.string().optional(),
    conditionIn: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessIn: z.string().optional(),
    incident: z.string().optional(),
    commentsIn: z.string().optional(),
    parkingPhoto: z.string().optional(),
    driveFolderId: z.string().optional(),
    checklistIn: z.record(z.string(), z.boolean()).optional(),
    desinfResponsable: z.string().optional(),
    desinfLotNumber: z.string().optional(),
    desinfType: z.string().optional(),
    /** Confirmation explicite d'un kilométrage inhabituel (cf. src/lib/utils/mileageAnomaly.ts). */
    confirmMileageAnomaly: z.boolean().optional(),
});

import { z } from 'zod';

export const checkOutSchema = z.object({
    vehicleId: z.string().min(1),
    missionType: z.string().min(1, 'Le type de mission est requis'),
    missionName: z.string().optional(),
    conditionOut: z.string().min(1, "L'état du véhicule est requis"),
    cleanlinessOut: z.string().optional(),
    parkingOut: z.string().optional(),
    dsaChecked: z.boolean(),
    commentsOut: z.string().optional(),
    secondDriverId: z.string().optional().nullable(),
    driveFolderId: z.string().optional(),
    checklistOut: z.record(z.string(), z.boolean()).optional(),
    dataIncorrect: z.boolean().optional(),
    correctedMileage: z.number().int().min(0).optional(),
    correctedFuel: z.number().int().min(0).max(100).optional(),
});

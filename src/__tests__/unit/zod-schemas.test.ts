/**
 * Tests unitaires des schémas Zod de validation des formulaires de prise/retour.
 *
 * Les schémas ne sont pas exportés depuis les routes Next.js (ils sont définis
 * en local dans chaque fichier route). On les recopie ici pour tester le contrat
 * de validation sans modifier le code de production.
 *
 * Fichiers sources : src/app/api/trips/route.ts (checkOutSchema)
 *                    src/app/api/trips/[id]/checkin/route.ts (checkInSchema)
 *
 * Si un schéma change en production, ce fichier doit être mis à jour en parallèle.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Copie du checkOutSchema depuis src/app/api/trips/route.ts
const checkOutSchema = z.object({
  vehicleId: z.string().min(1),
  driverName: z.string().min(1, 'Le nom du chauffeur est requis'),
  driverEmail: z.string().email().optional().or(z.literal('')),
  missionType: z.string().min(1, 'Le type de mission est requis'),
  missionName: z.string().optional(),
  conditionOut: z.string().min(1, "L'état du véhicule est requis"),
  cleanlinessOut: z.string().optional(),
  parkingOut: z.string().optional(),
  dsaChecked: z.boolean(),
  commentsOut: z.string().optional(),
  secondDriverName: z.string().optional(),
  secondDriverEmail: z.string().email('Email 2nd conducteur invalide').optional().or(z.literal('')),
  driveFolderId: z.string().optional(),
  checklistOut: z.record(z.string(), z.boolean()).optional(),
  dataIncorrect: z.boolean().optional(),
  correctedMileage: z.number().int().min(0).optional(),
  correctedFuel: z.number().int().min(0).max(100).optional(),
});

// Copie du checkInSchema depuis src/app/api/trips/[id]/checkin/route.ts
const checkInSchema = z.object({
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
});

const validCheckOut = {
  vehicleId: 'VL001',
  driverName: 'Test Driver',
  driverEmail: 'driver@test.com',
  missionType: 'LOGISTIQUE',
  conditionOut: 'BON',
  dsaChecked: false,
};

const validCheckIn = {
  conditionIn: 'BON',
  mileageIn: 10200,
  fuelIn: 60,
};

describe('checkOutSchema', () => {
  it('parses a valid checkout object successfully', () => {
    const result = checkOutSchema.safeParse(validCheckOut);
    expect(result.success).toBe(true);
  });

  it('fails when vehicleId is missing', () => {
    const { vehicleId, ...rest } = validCheckOut;
    const result = checkOutSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('vehicleId');
    }
  });

  it('fails when missionType is missing', () => {
    const { missionType, ...rest } = validCheckOut;
    const result = checkOutSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('missionType');
    }
  });

  it('fails when dsaChecked is a string instead of boolean', () => {
    const result = checkOutSchema.safeParse({ ...validCheckOut, dsaChecked: 'yes' });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('dsaChecked');
    }
  });

  it('accepts empty string for optional email fields', () => {
    const result = checkOutSchema.safeParse({ ...validCheckOut, driverEmail: '' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email format', () => {
    const result = checkOutSchema.safeParse({ ...validCheckOut, driverEmail: 'not-an-email' });
    expect(result.success).toBe(false);
  });

  it('rejects correctedFuel above 100', () => {
    const result = checkOutSchema.safeParse({ ...validCheckOut, correctedFuel: 101 });
    expect(result.success).toBe(false);
  });
});

describe('checkInSchema', () => {
  it('parses a valid checkin object with only conditionIn', () => {
    // fuelIn et mileageIn sont optionnels dans le schéma Zod ;
    // la route les rend obligatoires via une vérification métier séparée
    const result = checkInSchema.safeParse({ conditionIn: 'BON' });
    expect(result.success).toBe(true);
  });

  it('parses a full valid checkin object', () => {
    const result = checkInSchema.safeParse(validCheckIn);
    expect(result.success).toBe(true);
  });

  it('fails when conditionIn is missing', () => {
    const { conditionIn, ...rest } = validCheckIn;
    const result = checkInSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('conditionIn');
    }
  });

  it('fails when fuelIn is below 0', () => {
    const result = checkInSchema.safeParse({ ...validCheckIn, fuelIn: -1 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('fuelIn');
    }
  });

  it('fails when fuelIn is above 100', () => {
    const result = checkInSchema.safeParse({ ...validCheckIn, fuelIn: 101 });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('fuelIn');
    }
  });

  it('accepts fuelIn at exactly 0 (boundary)', () => {
    const result = checkInSchema.safeParse({ ...validCheckIn, fuelIn: 0 });
    expect(result.success).toBe(true);
  });

  it('accepts fuelIn at exactly 100 (boundary)', () => {
    const result = checkInSchema.safeParse({ ...validCheckIn, fuelIn: 100 });
    expect(result.success).toBe(true);
  });
});

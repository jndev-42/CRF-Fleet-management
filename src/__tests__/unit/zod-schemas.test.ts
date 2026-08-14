/**
 * Tests unitaires des schémas Zod de validation des formulaires de prise/retour.
 *
 * Importe les vrais schémas depuis leurs fichiers dédiés (extraits des routes
 * dans schema.ts — un fichier route.ts Next.js ne peut exporter que des handlers
 * HTTP/config, pas des consts arbitraires) plutôt que d'en garder une copie
 * locale, pour que ces tests échouent si le contrat de validation réel change.
 */
import { describe, it, expect } from 'vitest';
import { checkOutSchema } from '@/app/api/trips/schema';
import { checkInSchema } from '@/app/api/trips/[id]/checkin/schema';

const validCheckOut = {
  vehicleId: 'VL001',
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vehicleId: _vehicleId, ...rest } = validCheckOut;
    const result = checkOutSchema.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((i) => i.path[0]);
      expect(fields).toContain('vehicleId');
    }
  });

  it('fails when missionType is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { missionType: _missionType, ...rest } = validCheckOut;
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

  it('accepts optional secondDriverId', () => {
    const result = checkOutSchema.safeParse({ ...validCheckOut, secondDriverId: 'some-user-id' });
    expect(result.success).toBe(true);
  });

  it('accepts null secondDriverId', () => {
    const result = checkOutSchema.safeParse({ ...validCheckOut, secondDriverId: null });
    expect(result.success).toBe(true);
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

  it('accepts optional desinfection fields', () => {
    const result = checkInSchema.safeParse({
      ...validCheckIn,
      desinfResponsable: 'Marc Dupont',
      desinfLotNumber: 'LOT-2026-001',
      desinfType: 'simple',
    });
    expect(result.success).toBe(true);
  });

  it('fails when conditionIn is missing', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { conditionIn: _conditionIn, ...rest } = validCheckIn;
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

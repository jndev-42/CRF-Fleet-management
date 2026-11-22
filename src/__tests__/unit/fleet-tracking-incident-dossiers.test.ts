import { describe, it, expect } from 'vitest';
import { incidentDossierDescription, incidentDossierTitle } from '@/lib/fleetTracking/incidentDossiers';
import {
  CLOSE_REASONS, CLOSE_REASON_LABELS, DOSSIER_STATUS_LABELS, createDossierSchema, incidentReportLink,
  isDossierActive, updateDossierSchema,
} from '@/lib/fleetTracking/dossiers';

describe('statuts de dossier', () => {
  it('libellés français et « ouvert » = tout sauf clos', () => {
    expect(DOSSIER_STATUS_LABELS).toEqual({ NEW: 'Nouveau', OPEN: 'En cours', WAITING: 'En attente', CLOSED: 'Clos' });
    expect(isDossierActive('NEW')).toBe(true);
    expect(isDossierActive('OPEN')).toBe(true);
    expect(isDossierActive('WAITING')).toBe(true);
    expect(isDossierActive('CLOSED')).toBe(false);
  });

  it('motifs de clôture', () => {
    expect(CLOSE_REASONS).toEqual(['NO_ACTION', 'REPAIRED', 'INSURANCE', 'OTHER']);
    expect(CLOSE_REASON_LABELS.INSURANCE).toBe('Pris en charge par l\'assurance');
    expect(CLOSE_REASON_LABELS.NO_ACTION).toBe('Sans suite');
  });

  it('clore exige un motif (création et modification)', () => {
    expect(updateDossierSchema.safeParse({ status: 'CLOSED' }).success).toBe(false);
    expect(updateDossierSchema.safeParse({ status: 'CLOSED', closeReason: 'OTHER' }).success).toBe(true);
    expect(updateDossierSchema.safeParse({ status: 'WAITING' }).success).toBe(true);
    expect(createDossierSchema.safeParse({ vehicleId: 'v', title: 'T', status: 'CLOSED' }).success).toBe(false);
    expect(createDossierSchema.parse({ vehicleId: 'v', title: 'T' }).status).toBe('OPEN');
  });

  it('lien vers la déclaration : son PDF', () => {
    expect(incidentReportLink('abc')).toBe('/api/incidents/abc/pdf');
  });
});

describe('dossier généré depuis une déclaration', () => {
  it('titres', () => {
    expect(incidentDossierTitle('ACCIDENT', 'VL186')).toBe('Accident — VL186');
    expect(incidentDossierTitle('FLASH', 'VL186')).toBe('Avis de contravention (flash) — VL186');
    expect(incidentDossierTitle(null, 'VL186')).toBe('Incident — VL186');
  });

  it('description : déclarant, date, lieu, texte saisi', () => {
    const text = incidentDossierDescription({
      type: 'ACCIDENT', vehicleName: 'VL186', declarantName: 'Jeanne', occurredAt: '2026-11-20T10:30:00.000Z',
      location: 'Rue X', description: 'Choc',
    });
    expect(text).toContain('Déclaré par : Jeanne');
    expect(text).toContain('20/11/2026');
    expect(text).toContain('Lieu : Rue X');
    expect(text.endsWith('Choc')).toBe(true);
  });

  it('description minimale sans date ni lieu', () => {
    const text = incidentDossierDescription({ type: 'FLASH', vehicleName: 'V', declarantName: null, occurredAt: null, location: null, description: null });
    expect(text).toBe('Déclaré par : inconnu');
  });
});

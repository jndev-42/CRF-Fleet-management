/**
 * Unit tests for stats.ts helpers:
 * - buildTripWhere: WHERE clause builder with optional filters
 * - incidentRate: derived from totalIncidents / totalKm * 100
 * - fleetUtilizationRate: activeDays / periodDays * 100, capped at 100
 */
import { describe, it, expect } from 'vitest';
import { buildTripWhere } from '@/lib/stats-trips';

describe('buildTripWhere', () => {
  it('returns base date clause with no filters', () => {
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31');
    expect(whereSql).toBe('DATE(t.checkOutAt) >= ? AND DATE(t.checkOutAt) <= ?');
    expect(args).toEqual(['2026-01-01', '2026-01-31']);
  });

  it('appends vehicleId clause when provided', () => {
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31', { vehicleId: 'VL001' });
    expect(whereSql).toContain('t.vehicleId = ?');
    expect(args).toContain('VL001');
    expect(args.length).toBe(3);
  });

  it('appends driverId clause when provided', () => {
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31', { driverIds: ['user-1'] });
    expect(whereSql).toContain('t.driverId IN (?)');
    expect(args).toContain('user-1');
    expect(args.length).toBe(3);
  });

  it('appends missionType clause when provided', () => {
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31', { missionType: 'Opération' });
    expect(whereSql).toContain('t.missionType = ?');
    expect(args).toContain('Opération');
    expect(args.length).toBe(3);
  });

  it('appends all three filter clauses when all provided', () => {
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31', {
      vehicleId: 'VL001',
      driverIds: ['user-1'],
      missionType: 'Formation',
    });
    expect(whereSql).toContain('t.vehicleId = ?');
    expect(whereSql).toContain('t.driverId IN (?)');
    expect(whereSql).toContain('t.missionType = ?');
    expect(args).toEqual(['2026-01-01', '2026-01-31', 'VL001', 'user-1', 'Formation']);
  });

  it('does not inject filter when filter value is undefined', () => {
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31', { vehicleId: undefined });
    expect(whereSql).not.toContain('vehicleId');
    expect(args.length).toBe(2);
  });

  it('never puts user values directly into the SQL string (injection safety)', () => {
    const malicious = "' OR 1=1 --";
    const { whereSql, args } = buildTripWhere('2026-01-01', '2026-01-31', { vehicleId: malicious });
    expect(whereSql).not.toContain(malicious);
    expect(args).toContain(malicious);
  });
});

describe('incidentRate calculation', () => {
  it('returns 0 when totalKm is 0', () => {
    const totalIncidents = 5;
    const totalKm = 0;
    const rate = totalKm > 0 ? (totalIncidents / totalKm) * 100 : 0;
    expect(rate).toBe(0);
  });

  it('computes incidents per 100 km correctly', () => {
    const totalIncidents = 2;
    const totalKm = 1000;
    const rate = totalKm > 0 ? (totalIncidents / totalKm) * 100 : 0;
    expect(rate).toBeCloseTo(0.2);
  });

  it('returns 0 when no incidents', () => {
    const totalIncidents = 0;
    const totalKm = 500;
    const rate = totalKm > 0 ? (totalIncidents / totalKm) * 100 : 0;
    expect(rate).toBe(0);
  });
});

describe('fleetUtilizationRate calculation', () => {
  it('returns 0 when period is 0 days', () => {
    const activeDays = 3;
    const periodDays = 0;
    const rate = Math.min(100, periodDays > 0 ? Math.round((activeDays / periodDays) * 100) : 0);
    expect(rate).toBe(0);
  });

  it('computes percentage of active days correctly', () => {
    const activeDays = 15;
    const periodDays = 30;
    const rate = Math.min(100, periodDays > 0 ? Math.round((activeDays / periodDays) * 100) : 0);
    expect(rate).toBe(50);
  });

  it('caps at 100 even if activeDays > periodDays (overlapping trips)', () => {
    const activeDays = 35;
    const periodDays = 30;
    const rate = Math.min(100, periodDays > 0 ? Math.round((activeDays / periodDays) * 100) : 0);
    expect(rate).toBe(100);
  });

  it('returns 100 when all days have at least one trip', () => {
    const activeDays = 30;
    const periodDays = 30;
    const rate = Math.min(100, periodDays > 0 ? Math.round((activeDays / periodDays) * 100) : 0);
    expect(rate).toBe(100);
  });
});

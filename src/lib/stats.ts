import { db } from '@/lib/db';

export interface StatsDataResult {
  period: { from: string; to: string };
  global: {
    totalTrips: number;
    completedTrips: number;
    totalKm: number;
    avgKmPerTrip: number;
    totalIncidents: number;
    avgFuelConsumption: number;
  };
  byDriver: Array<{
    driverName: string;
    driverEmail: string;
    tripCount: number;
    totalKm: number;
    percentOfTotal: number;
    incidents: number;
    byVehicle: Array<{
      vehicleId: string;
      vehicleName: string;
      tripCount: number;
      percentOfVehicleTotal: number;
    }>;
  }>;
  byVehicle: Array<{
    vehicleId: string;
    vehicleName: string;
    tripCount: number;
    totalKm: number;
    avgFuelDelta: number;
    percentOfTotal: number;
  }>;
  byMissionType: Array<{ missionType: string; count: number }>;
  kmOverTime: Array<{ week: string; km: number; trips: number }>;
}

export async function fetchStatsData(dateFrom: string, dateTo: string): Promise<StatsDataResult> {
  // Global stats
  const globalResult = await db.execute({
    sql: `SELECT
      COUNT(*) as totalTrips,
      COUNT(CASE WHEN checkInAt IS NOT NULL THEN 1 END) as completedTrips,
      COALESCE(SUM(CASE WHEN mileageIn IS NOT NULL THEN mileageIn - mileageOut ELSE 0 END), 0) as totalKm,
      COUNT(CASE WHEN incident IS NOT NULL AND incident != '' THEN 1 END) as totalIncidents,
      AVG(CASE WHEN fuelIn IS NOT NULL THEN fuelOut - fuelIn ELSE NULL END) as avgFuelConsumption
    FROM Trip
    WHERE checkOutAt >= ? AND checkOutAt <= ?`,
    args: [dateFrom, dateTo],
  });

  const globalRow = globalResult.rows[0];
  const totalTrips = Number(globalRow.totalTrips ?? 0);
  const completedTrips = Number(globalRow.completedTrips ?? 0);
  const totalKm = Number(globalRow.totalKm ?? 0);
  const totalIncidents = Number(globalRow.totalIncidents ?? 0);
  const avgFuelConsumption = globalRow.avgFuelConsumption != null ? Number(globalRow.avgFuelConsumption) : 0;
  const avgKmPerTrip = completedTrips > 0 ? Math.round(totalKm / completedTrips) : 0;

  // By driver
  const driverResult = await db.execute({
    sql: `SELECT driverName, driverEmail,
      COUNT(*) as tripCount,
      COALESCE(SUM(CASE WHEN mileageIn IS NOT NULL THEN mileageIn - mileageOut ELSE 0 END), 0) as totalKm,
      COUNT(CASE WHEN incident != '' AND incident IS NOT NULL THEN 1 END) as incidents
    FROM Trip
    WHERE checkOutAt >= ? AND checkOutAt <= ?
    GROUP BY driverEmail, driverName
    ORDER BY tripCount DESC`,
    args: [dateFrom, dateTo],
  });

  // By vehicle
  const vehicleResult = await db.execute({
    sql: `SELECT t.vehicleId, v.name as vehicleName,
      COUNT(*) as tripCount,
      COALESCE(SUM(CASE WHEN t.mileageIn IS NOT NULL THEN t.mileageIn - t.mileageOut ELSE 0 END), 0) as totalKm,
      AVG(CASE WHEN t.fuelIn IS NOT NULL THEN t.fuelOut - t.fuelIn ELSE NULL END) as avgFuelDelta
    FROM Trip t
    JOIN Vehicle v ON v.id = t.vehicleId
    WHERE t.checkOutAt >= ? AND t.checkOutAt <= ?
    GROUP BY t.vehicleId, v.name
    ORDER BY tripCount DESC`,
    args: [dateFrom, dateTo],
  });

  // By mission type
  const missionResult = await db.execute({
    sql: `SELECT missionType, COUNT(*) as count
    FROM Trip
    WHERE checkOutAt >= ? AND checkOutAt <= ? AND missionType IS NOT NULL
    GROUP BY missionType
    ORDER BY count DESC`,
    args: [dateFrom, dateTo],
  });

  // Km per week
  const kmOverTimeResult = await db.execute({
    sql: `SELECT
      strftime('%Y-W%W', checkOutAt) as week,
      COUNT(*) as trips,
      COALESCE(SUM(CASE WHEN mileageIn IS NOT NULL THEN mileageIn - mileageOut ELSE 0 END), 0) as km
    FROM Trip
    WHERE checkOutAt >= ? AND checkOutAt <= ?
    GROUP BY week
    ORDER BY week ASC`,
    args: [dateFrom, dateTo],
  });

  // Cross-query for driver-vehicle breakdown
  const crossResult = await db.execute({
    sql: `SELECT driverEmail, driverName, vehicleId, COUNT(*) as cnt
    FROM Trip
    WHERE checkOutAt >= ? AND checkOutAt <= ?
    GROUP BY vehicleId, driverEmail`,
    args: [dateFrom, dateTo],
  });

  // Build vehicle trip count map
  const vehicleTripCounts: Record<string, number> = {};
  vehicleResult.rows.forEach((r) => {
    vehicleTripCounts[String(r.vehicleId)] = Number(r.tripCount);
  });

  // Build vehicleName map
  const vehicleNameMap: Record<string, string> = {};
  vehicleResult.rows.forEach((r) => {
    vehicleNameMap[String(r.vehicleId)] = String(r.vehicleName);
  });

  // Build per-driver vehicle breakdown
  const driverVehicleMap: Record<string, Array<{
    vehicleId: string;
    vehicleName: string;
    tripCount: number;
    percentOfVehicleTotal: number;
  }>> = {};
  crossResult.rows.forEach((r) => {
    const email = String(r.driverEmail);
    const vehicleId = String(r.vehicleId);
    const cnt = Number(r.cnt);
    const vehicleTotal = vehicleTripCounts[vehicleId] ?? 1;
    if (!driverVehicleMap[email]) driverVehicleMap[email] = [];
    driverVehicleMap[email].push({
      vehicleId,
      vehicleName: vehicleNameMap[vehicleId] ?? vehicleId,
      tripCount: cnt,
      percentOfVehicleTotal: Math.round((cnt / vehicleTotal) * 100),
    });
  });

  const byDriver = driverResult.rows.map((r) => {
    const driverTripCount = Number(r.tripCount);
    const driverKm = Number(r.totalKm ?? 0);
    const email = String(r.driverEmail);
    return {
      driverName: String(r.driverName),
      driverEmail: email,
      tripCount: driverTripCount,
      totalKm: driverKm,
      percentOfTotal: totalTrips > 0 ? Math.round((driverTripCount / totalTrips) * 100) : 0,
      incidents: Number(r.incidents ?? 0),
      byVehicle: driverVehicleMap[email] ?? [],
    };
  });

  const byVehicle = vehicleResult.rows.map((r) => {
    const vehicleTripCount = Number(r.tripCount);
    return {
      vehicleId: String(r.vehicleId),
      vehicleName: String(r.vehicleName),
      tripCount: vehicleTripCount,
      totalKm: Number(r.totalKm ?? 0),
      avgFuelDelta: r.avgFuelDelta != null ? Number(r.avgFuelDelta) : 0,
      percentOfTotal: totalTrips > 0 ? Math.round((vehicleTripCount / totalTrips) * 100) : 0,
    };
  });

  const byMissionType = missionResult.rows.map((r) => ({
    missionType: String(r.missionType),
    count: Number(r.count),
  }));

  const kmOverTime = kmOverTimeResult.rows.map((r) => ({
    week: String(r.week),
    km: Number(r.km ?? 0),
    trips: Number(r.trips ?? 0),
  }));

  return {
    period: { from: dateFrom, to: dateTo },
    global: {
      totalTrips,
      completedTrips,
      totalKm,
      avgKmPerTrip,
      totalIncidents,
      avgFuelConsumption,
    },
    byDriver,
    byVehicle,
    byMissionType,
    kmOverTime,
  };
}

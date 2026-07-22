import { db } from '@/lib/db';

export interface StatsFilters {
  vehicleId?: string;
  driverIds?: string[];
  missionType?: string;
  ulId?: string;
}

/**
 * Builds the WHERE clause for trip queries with optional filters.
 * Only hardcoded strings are appended to whereSql; user-supplied values
 * always go into args to prevent SQL injection.
 */
export function buildTripWhere(
  dateFrom: string,
  dateTo: string,
  filters?: StatsFilters
): { whereSql: string; args: (string | null)[] } {
  const args: (string | null)[] = [dateFrom, dateTo];
  let whereSql = 'DATE(t.checkOutAt) >= ? AND DATE(t.checkOutAt) <= ?';

  if (filters?.ulId) {
    whereSql += ' AND v.ulId = ?';
    args.push(filters.ulId);
  }
  if (filters?.vehicleId) {
    whereSql += ' AND t.vehicleId = ?';
    args.push(filters.vehicleId);
  }
  if (filters?.driverIds && filters.driverIds.length > 0) {
    const placeholders = filters.driverIds.map(() => '?').join(', ');
    whereSql += ` AND t.driverId IN (${placeholders})`;
    args.push(...filters.driverIds);
  }
  if (filters?.missionType) {
    whereSql += ' AND t.missionType = ?';
    args.push(filters.missionType);
  }

  return { whereSql, args };
}

export interface StatsDataResult {
  period: { from: string; to: string };
  global: {
    totalTrips: number;
    completedTrips: number;
    totalKm: number;
    avgKmPerTrip: number;
    totalIncidents: number;
    avgFuelConsumption: number;
    avgLPer100km: number;
    totalFuelLiters: number;
    avgFuelAtReturn: number;
    fleetUtilizationRate: number;
    incidentRate: number;
    avgKwhPer100km: number;
    totalKwhConsumed: number;
  };
  byDriver: Array<{
    driverId: string;
    driverName: string;
    driverEmail: string;
    tripCount: number;
    totalKm: number;
    percentOfTotal: number;
    incidents: number;
    avgFuelAtReturn: number;
    avgLPer100km: number;
    avgKwhPer100km: number;
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
    avgLPer100km: number;
    avgKwhPer100km: number;
    percentOfTotal: number;
  }>;
  byMissionType: Array<{ missionType: string; count: number }>;
  kmOverTime: Array<{ week: string; km: number; trips: number }>;
}

export async function fetchStatsData(
  dateFrom: string,
  dateTo: string,
  filters?: StatsFilters
): Promise<StatsDataResult> {
  const { whereSql, args } = buildTripWhere(dateFrom, dateTo, filters);

  // Global stats — join Vehicle for L/100km calculation
  const globalResult = await db.execute({
    sql: `SELECT
      COUNT(*) as totalTrips,
      COUNT(CASE WHEN t.checkInAt IS NOT NULL THEN 1 END) as completedTrips,
      COALESCE(SUM(CASE WHEN t.mileageIn IS NOT NULL THEN t.mileageIn - t.mileageOut ELSE 0 END), 0) as totalKm,
      COUNT(CASE WHEN t.incident IS NOT NULL AND t.incident != '' THEN 1 END) as totalIncidents,
      AVG(CASE WHEN t.fuelIn IS NOT NULL AND t.fuelOut > t.fuelIn THEN t.fuelOut - t.fuelIn ELSE NULL END) as avgFuelConsumption,
      AVG(
        CASE
          WHEN t.mileageIn IS NOT NULL
            AND t.mileageIn > t.mileageOut
            AND t.fuelOut > t.fuelIn
            AND v.maxFuelCapacity IS NOT NULL
            AND v.maxFuelCapacity > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxFuelCapacity / 100.0
               / (t.mileageIn - t.mileageOut) * 100.0
          ELSE NULL
        END
      ) as avgLPer100km,
      SUM(
        CASE
          WHEN t.fuelOut > t.fuelIn
            AND v.maxFuelCapacity IS NOT NULL
            AND v.maxFuelCapacity > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxFuelCapacity / 100.0
          ELSE 0
        END
      ) as totalFuelLiters,
      AVG(CASE WHEN t.checkInAt IS NOT NULL AND t.fuelIn IS NOT NULL THEN t.fuelIn ELSE NULL END) as avgFuelAtReturn,
      AVG(
        CASE
          WHEN t.mileageIn IS NOT NULL
            AND t.mileageIn > t.mileageOut
            AND t.fuelOut > t.fuelIn
            AND v.maxBatteryCapacityKwh IS NOT NULL
            AND v.maxBatteryCapacityKwh > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxBatteryCapacityKwh / 100.0
               / (t.mileageIn - t.mileageOut) * 100.0
          ELSE NULL
        END
      ) as avgKwhPer100km,
      SUM(
        CASE
          WHEN t.fuelOut > t.fuelIn
            AND v.maxBatteryCapacityKwh IS NOT NULL
            AND v.maxBatteryCapacityKwh > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxBatteryCapacityKwh / 100.0
          ELSE 0
        END
      ) as totalKwhConsumed
    FROM Trip t
    LEFT JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql}`,
    args,
  });

  const globalRow = globalResult.rows[0];
  const totalTrips = Number(globalRow.totalTrips ?? 0);
  const completedTrips = Number(globalRow.completedTrips ?? 0);
  const totalKm = Number(globalRow.totalKm ?? 0);
  const totalIncidents = Number(globalRow.totalIncidents ?? 0);
  const avgFuelConsumption = globalRow.avgFuelConsumption != null ? Number(globalRow.avgFuelConsumption) : 0;
  const avgLPer100km = globalRow.avgLPer100km != null ? Number(globalRow.avgLPer100km) : 0;
  const totalFuelLiters = Number(globalRow.totalFuelLiters ?? 0);
  const avgFuelAtReturn = globalRow.avgFuelAtReturn != null ? Math.round(Number(globalRow.avgFuelAtReturn)) : 0;
  const avgKwhPer100km = globalRow.avgKwhPer100km != null ? Number(globalRow.avgKwhPer100km) : 0;
  const totalKwhConsumed = Number(globalRow.totalKwhConsumed ?? 0);
  const avgKmPerTrip = completedTrips > 0 ? Math.round(totalKm / completedTrips) : 0;
  const incidentRate = totalKm > 0 ? (totalIncidents / totalKm) * 100 : 0;

  // Fleet utilization: count distinct days with at least one checkout
  const periodDays =
    (new Date(dateTo).getTime() - new Date(dateFrom).getTime()) / (1000 * 60 * 60 * 24) + 1;

  const utilizationResult = await db.execute({
    sql: `SELECT COUNT(DISTINCT DATE(t.checkOutAt)) as activeDays
    FROM Trip t
    LEFT JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql}`,
    args,
  });
  const activeDays = Number(utilizationResult.rows[0].activeDays ?? 0);
  const fleetUtilizationRate = Math.min(
    100,
    periodDays > 0 ? Math.round((activeDays / periodDays) * 100) : 0
  );

  // By driver — join Vehicle for L/100km and avgFuelAtReturn
  const driverResult = await db.execute({
    sql: `SELECT t.driverId, u.name AS driverName, u.email AS driverEmail,
      COUNT(*) as tripCount,
      COALESCE(SUM(CASE WHEN t.mileageIn IS NOT NULL THEN t.mileageIn - t.mileageOut ELSE 0 END), 0) as totalKm,
      COUNT(CASE WHEN t.incident != '' AND t.incident IS NOT NULL THEN 1 END) as incidents,
      AVG(CASE WHEN t.checkInAt IS NOT NULL AND t.fuelIn IS NOT NULL THEN t.fuelIn ELSE NULL END) as avgFuelAtReturn,
      AVG(
        CASE
          WHEN t.mileageIn IS NOT NULL
            AND t.mileageIn > t.mileageOut
            AND t.fuelOut > t.fuelIn
            AND v.maxFuelCapacity IS NOT NULL
            AND v.maxFuelCapacity > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxFuelCapacity / 100.0
               / (t.mileageIn - t.mileageOut) * 100.0
          ELSE NULL
        END
      ) as avgLPer100km,
      AVG(
        CASE
          WHEN t.mileageIn IS NOT NULL
            AND t.mileageIn > t.mileageOut
            AND t.fuelOut > t.fuelIn
            AND v.maxBatteryCapacityKwh IS NOT NULL
            AND v.maxBatteryCapacityKwh > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxBatteryCapacityKwh / 100.0
               / (t.mileageIn - t.mileageOut) * 100.0
          ELSE NULL
        END
      ) as avgKwhPer100km
    FROM Trip t
    JOIN "User" u ON u.id = t.driverId
    LEFT JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql}
    GROUP BY t.driverId, u.name, u.email
    ORDER BY tripCount DESC`,
    args,
  });

  // By vehicle — join Vehicle for L/100km
  const vehicleResult = await db.execute({
    sql: `SELECT t.vehicleId, v.name as vehicleName,
      COUNT(*) as tripCount,
      COALESCE(SUM(CASE WHEN t.mileageIn IS NOT NULL THEN t.mileageIn - t.mileageOut ELSE 0 END), 0) as totalKm,
      AVG(CASE WHEN t.fuelIn IS NOT NULL AND t.fuelOut > t.fuelIn THEN t.fuelOut - t.fuelIn ELSE NULL END) as avgFuelDelta,
      AVG(
        CASE
          WHEN t.mileageIn IS NOT NULL
            AND t.mileageIn > t.mileageOut
            AND t.fuelOut > t.fuelIn
            AND v.maxFuelCapacity IS NOT NULL
            AND v.maxFuelCapacity > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxFuelCapacity / 100.0
               / (t.mileageIn - t.mileageOut) * 100.0
          ELSE NULL
        END
      ) as avgLPer100km,
      AVG(
        CASE
          WHEN t.mileageIn IS NOT NULL
            AND t.mileageIn > t.mileageOut
            AND t.fuelOut > t.fuelIn
            AND v.maxBatteryCapacityKwh IS NOT NULL
            AND v.maxBatteryCapacityKwh > 0
          THEN CAST((t.fuelOut - t.fuelIn) AS REAL) * v.maxBatteryCapacityKwh / 100.0
               / (t.mileageIn - t.mileageOut) * 100.0
          ELSE NULL
        END
      ) as avgKwhPer100km
    FROM Trip t
    JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql}
    GROUP BY t.vehicleId, v.name
    ORDER BY tripCount DESC`,
    args,
  });

  // By mission type — use same alias `t` so whereSql applies directly
  const missionResult = await db.execute({
    sql: `SELECT t.missionType as missionType, COUNT(*) as count
    FROM Trip t
    LEFT JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql} AND t.missionType IS NOT NULL
    GROUP BY t.missionType
    ORDER BY count DESC`,
    args,
  });

  // Km per week
  const kmOverTimeResult = await db.execute({
    sql: `SELECT
      strftime('%Y-W%W', t.checkOutAt) as week,
      COUNT(*) as trips,
      COALESCE(SUM(CASE WHEN t.mileageIn IS NOT NULL THEN t.mileageIn - t.mileageOut ELSE 0 END), 0) as km
    FROM Trip t
    LEFT JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql}
    GROUP BY week
    ORDER BY week ASC`,
    args,
  });

  // Cross-query for driver-vehicle breakdown
  const crossResult = await db.execute({
    sql: `SELECT t.driverId, u.email AS driverEmail, u.name AS driverName, t.vehicleId, COUNT(*) as cnt
    FROM Trip t
    JOIN "User" u ON u.id = t.driverId
    LEFT JOIN Vehicle v ON v.id = t.vehicleId
    WHERE ${whereSql}
    GROUP BY t.vehicleId, t.driverId`,
    args,
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

  // Build per-driver vehicle breakdown (keyed by driverId)
  const driverVehicleMap: Record<string, Array<{
    vehicleId: string;
    vehicleName: string;
    tripCount: number;
    percentOfVehicleTotal: number;
  }>> = {};
  crossResult.rows.forEach((r) => {
    const driverId = String(r.driverId);
    const vehicleId = String(r.vehicleId);
    const cnt = Number(r.cnt);
    const vehicleTotal = vehicleTripCounts[vehicleId] ?? 1;
    if (!driverVehicleMap[driverId]) driverVehicleMap[driverId] = [];
    driverVehicleMap[driverId].push({
      vehicleId,
      vehicleName: vehicleNameMap[vehicleId] ?? vehicleId,
      tripCount: cnt,
      percentOfVehicleTotal: Math.round((cnt / vehicleTotal) * 100),
    });
  });

  const byDriver = driverResult.rows.map((r) => {
    const driverTripCount = Number(r.tripCount);
    const driverKm = Number(r.totalKm ?? 0);
    const driverId = String(r.driverId);
    return {
      driverId,
      driverName: String(r.driverName),
      driverEmail: String(r.driverEmail),
      tripCount: driverTripCount,
      totalKm: driverKm,
      percentOfTotal: totalTrips > 0 ? Math.round((driverTripCount / totalTrips) * 100) : 0,
      incidents: Number(r.incidents ?? 0),
      avgFuelAtReturn: r.avgFuelAtReturn != null ? Math.round(Number(r.avgFuelAtReturn)) : 0,
      avgLPer100km: r.avgLPer100km != null ? Number(r.avgLPer100km) : 0,
      avgKwhPer100km: r.avgKwhPer100km != null ? Number(r.avgKwhPer100km) : 0,
      byVehicle: driverVehicleMap[driverId] ?? [],
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
      avgLPer100km: r.avgLPer100km != null ? Number(r.avgLPer100km) : 0,
      avgKwhPer100km: r.avgKwhPer100km != null ? Number(r.avgKwhPer100km) : 0,
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
      avgLPer100km,
      totalFuelLiters,
      avgFuelAtReturn,
      fleetUtilizationRate,
      incidentRate,
      avgKwhPer100km,
      totalKwhConsumed,
    },
    byDriver,
    byVehicle,
    byMissionType,
    kmOverTime,
  };
}

export interface ExpenseStatsFilters {
  ulId?: string;
  imputation?: string;
}

export interface ExpenseStatsDataResult {
  period: { from: string; to: string };
  global: {
    totalExpensesAmount: number;
    totalRefundedAmount: number;
    totalPendingAmount: number;
    reportsCount: number;
    avgReportAmount: number;
  };
  byMonth: Array<{
    month: string;
    label: string;
    amount: number;
    count: number;
  }>;
  byUser: Array<{
    userId: string;
    userName: string;
    userEmail: string;
    totalAmount: number;
    paidAmount: number;
    reportCount: number;
  }>;
  byImputation: Array<{
    imputation: string;
    amount: number;
    count: number;
    percentOfTotal: number;
  }>;
  byStatus: Array<{
    status: string;
    label: string;
    amount: number;
    count: number;
  }>;
}

export async function fetchExpenseStatsData(
  dateFrom: string,
  dateTo: string,
  filters?: ExpenseStatsFilters
): Promise<ExpenseStatsDataResult> {
  const args: (string | null)[] = [];
  let whereSql = `1=1`;

  if (filters?.ulId) {
    whereSql += ` AND er.ulId = ?`;
    args.push(filters.ulId);
  }

  whereSql += ` AND DATE(COALESCE(er.submittedAt, er.createdAt)) >= DATE(?) AND DATE(COALESCE(er.submittedAt, er.createdAt)) <= DATE(?)`;
  args.push(dateFrom, dateTo);

  if (filters?.imputation) {
    whereSql += ` AND (er.imputation = ? OR er.customImputation = ?)`;
    args.push(filters.imputation, filters.imputation);
  }

  const reportsResult = await db.execute({
    sql: `
      SELECT er.*, u.name as userName, u.email as userEmail
      FROM "ExpenseReport" er
      JOIN "User" u ON u.id = er.userId
      WHERE ${whereSql}
      ORDER BY COALESCE(er.submittedAt, er.createdAt) DESC
    `,
    args,
  });

  const rows = reportsResult.rows;

  let totalExpensesAmount = 0;
  let totalRefundedAmount = 0;
  let totalPendingAmount = 0;
  const reportsCount = rows.length;

  const monthMap: Record<string, { amount: number; count: number }> = {};
  const userMap: Record<string, { userId: string; userName: string; userEmail: string; totalAmount: number; paidAmount: number; reportCount: number }> = {};
  const imputationMap: Record<string, { amount: number; count: number }> = {};
  const statusMap: Record<string, { amount: number; count: number }> = {
    brouillon: { amount: 0, count: 0 },
    soumis: { amount: 0, count: 0 },
    en_attente_paiement: { amount: 0, count: 0 },
    traité: { amount: 0, count: 0 },
    refusé: { amount: 0, count: 0 },
  };

  rows.forEach((row) => {
    const total = Number(row.total ?? 0);
    const status = String(row.status ?? 'brouillon');
    const dateStr = String(row.submittedAt || row.createdAt || dateFrom);
    const monthKey = dateStr.slice(0, 7); // "YYYY-MM"
    const userId = String(row.userId);
    const userName = String(row.userName || 'Inconnu');
    const userEmail = String(row.userEmail || '');
    const imputation = String(row.customImputation || row.imputation || 'DLUS');

    totalExpensesAmount += total;
    if (status === 'traité') {
      totalRefundedAmount += total;
    } else if (status === 'soumis' || status === 'en_attente_paiement') {
      totalPendingAmount += total;
    }

    // Month stats
    if (!monthMap[monthKey]) {
      monthMap[monthKey] = { amount: 0, count: 0 };
    }
    monthMap[monthKey].amount += total;
    monthMap[monthKey].count += 1;

    // User stats
    if (!userMap[userId]) {
      userMap[userId] = { userId, userName, userEmail, totalAmount: 0, paidAmount: 0, reportCount: 0 };
    }
    userMap[userId].totalAmount += total;
    if (status === 'traité') {
      userMap[userId].paidAmount += total;
    }
    userMap[userId].reportCount += 1;

    // Imputation stats
    if (!imputationMap[imputation]) {
      imputationMap[imputation] = { amount: 0, count: 0 };
    }
    imputationMap[imputation].amount += total;
    imputationMap[imputation].count += 1;

    // Status stats
    if (!statusMap[status]) {
      statusMap[status] = { amount: 0, count: 0 };
    }
    statusMap[status].amount += total;
    statusMap[status].count += 1;
  });

  const avgReportAmount = reportsCount > 0 ? totalExpensesAmount / reportsCount : 0;

  // Month list formatted
  const monthNames = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc'];
  const byMonth = Object.keys(monthMap)
    .sort()
    .map((m) => {
      const [year, monthNum] = m.split('-');
      const monthIdx = parseInt(monthNum, 10) - 1;
      const label = `${monthNames[monthIdx] || monthNum} ${year}`;
      return {
        month: m,
        label,
        amount: Math.round(monthMap[m].amount * 100) / 100,
        count: monthMap[m].count,
      };
    });

  // User list
  const byUser = Object.values(userMap)
    .sort((a, b) => b.totalAmount - a.totalAmount)
    .map((u) => ({
      ...u,
      totalAmount: Math.round(u.totalAmount * 100) / 100,
      paidAmount: Math.round(u.paidAmount * 100) / 100,
    }));

  // Imputation list
  const byImputation = Object.keys(imputationMap)
    .map((imp) => {
      const amt = imputationMap[imp].amount;
      return {
        imputation: imp,
        amount: Math.round(amt * 100) / 100,
        count: imputationMap[imp].count,
        percentOfTotal: totalExpensesAmount > 0 ? Math.round((amt / totalExpensesAmount) * 100) : 0,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  // Status list
  const statusLabels: Record<string, string> = {
    brouillon: 'Brouillon',
    soumis: 'Soumis',
    en_attente_paiement: 'En attente de paiement',
    traité: 'Traitée / Payée',
    refusé: 'Refusée',
  };

  const byStatus = Object.keys(statusMap).map((st) => ({
    status: st,
    label: statusLabels[st] || st,
    amount: Math.round(statusMap[st].amount * 100) / 100,
    count: statusMap[st].count,
  }));

  return {
    period: { from: dateFrom, to: dateTo },
    global: {
      totalExpensesAmount: Math.round(totalExpensesAmount * 100) / 100,
      totalRefundedAmount: Math.round(totalRefundedAmount * 100) / 100,
      totalPendingAmount: Math.round(totalPendingAmount * 100) / 100,
      reportsCount,
      avgReportAmount: Math.round(avgReportAmount * 100) / 100,
    },
    byMonth,
    byUser,
    byImputation,
    byStatus,
  };
}

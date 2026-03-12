export interface StatsData {
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
    driverId: string;
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

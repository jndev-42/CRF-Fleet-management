import { DemoDB } from './DemoDB';
import { IS_DEMO_MODE_KEY } from '../contexts/DemoContext';

export function setupFetchInterceptor() {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;

    window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
        const isDemo = localStorage.getItem(IS_DEMO_MODE_KEY) === 'true';
        const url = input.toString();

        // Only intercept /api/ calls if demo mode is active
        if (isDemo && url.includes('/api/')) {
            // Exceptions: Essential auth routes must hit the real server
            if (url.includes('/api/auth/')) {
                return originalFetch(input, init);
            }

            console.log(`[DemoMode] Intercepting ${url}`, init);

            try {
                // --- LICENSE CHECK ---
                if (url.includes('/api/me/license-check')) {
                    return mockResponse({ validated: true, daysLeft: null, blocked: false });
                }

                // --- VEHICLES ---
                // Matches /api/vehicles or /api/vehicles?params... but NOT /api/vehicles/[id]
                if (url.match(/\/api\/vehicles(\?.*)?$/)) {
                    if (!init || init.method === 'GET') {
                        const vehicles = DemoDB.getVehicles();
                        return mockResponse(vehicles);
                    }
                }

                // Match /api/vehicles/[id] but NOT /api/vehicles/[id]/...
                const vehicleDetailMatch = url.match(/\/api\/vehicles\/([^\/?]+)(\?.*)?$/);
                if (vehicleDetailMatch && !url.includes('/trips') && !url.includes('/maintenance') && !url.includes('/reservations')) {
                    const id = vehicleDetailMatch[1];
                    if (!init || init.method === 'GET') {
                        const vehicle = DemoDB.getVehicle(id);
                        return vehicle ? mockResponse(vehicle) : mockResponse({ error: 'Not found' }, 404);
                    }
                    if (init.method === 'PATCH') {
                        const body = JSON.parse(init.body as string);
                        const vehicle = DemoDB.updateVehicle(id, body);
                        return mockResponse(vehicle);
                    }
                }

                // --- TRIPS ---
                if (url.match(/\/api\/trips(\?.*)?$/) && init?.method === 'POST') {
                    const body = JSON.parse(init.body as string);
                    const trip = DemoDB.createTrip(body);
                    return mockResponse(trip);
                }

                const checkinMatch = url.match(/\/api\/trips\/([^\/]+)\/checkin$/);
                if (checkinMatch && init?.method === 'PATCH') {
                    const body = JSON.parse(init.body as string);
                    const trip = DemoDB.checkInTrip(checkinMatch[1], body);
                    return mockResponse(trip);
                }

                const secondDriverMatch = url.match(/\/api\/trips\/([^\/]+)\/second-driver$/);
                if (secondDriverMatch && init?.method === 'PATCH') {
                    const body = JSON.parse(init.body as string);
                    const trip = DemoDB.patchTrip(secondDriverMatch[1], body);
                    return mockResponse(trip);
                }

                const refreshRenaultMatch = url.match(/\/api\/trips\/([^\/]+)\/refresh-renault$/);
                if (refreshRenaultMatch && init?.method === 'PATCH') {
                    return mockResponse({ validated: true });
                }

                const tripDeleteMatch = url.match(/\/api\/trips\/([^\/]+)$/);
                if (tripDeleteMatch && init?.method === 'DELETE') {
                    DemoDB.deleteTrip(tripDeleteMatch[1]);
                    return mockResponse({ success: true });
                }

                const vehicleTripsDeleteMatch = url.match(/\/api\/vehicles\/([^\/]+)\/trips$/);
                if (vehicleTripsDeleteMatch && init?.method === 'DELETE') {
                    DemoDB.deleteVehicleTrips(vehicleTripsDeleteMatch[1]);
                    return mockResponse({ success: true });
                }

                // --- MISSIONS ---
                if (url.match(/\/api\/missions(\?.*)?$/)) {
                    if (!init || init.method === 'GET') {
                        const missions = DemoDB.getMissions();
                        return mockResponse({ 
                            reports: missions, 
                            total: missions.length, 
                            page: 1, 
                            limit: 50 
                        });
                    }
                    if (init.method === 'POST') {
                        const body = JSON.parse(init.body as string);
                        const mission = DemoDB.createMission(body);
                        return mockResponse({ success: true, id: mission.id }, 201);
                    }
                }

                const missionDetailMatch = url.match(/\/api\/missions\/([^\/?]+)(\?.*)?$/);
                if (missionDetailMatch) {
                    const id = missionDetailMatch[1];
                    if (!init || init.method === 'GET') {
                        const mission = DemoDB.getMission(id);
                        return mission ? mockResponse(mission) : mockResponse({ error: 'Not found' }, 404);
                    }
                    if (init.method === 'DELETE') {
                        DemoDB.deleteMission(id);
                        return mockResponse({ success: true });
                    }
                }

                // --- MAINTENANCE ---
                const maintenanceMatch = url.match(/\/api\/vehicles\/([^\/]+)\/maintenance/);
                if (maintenanceMatch) {
                    const id = maintenanceMatch[1];
                    if (!init || init.method === 'GET') {
                        const records = DemoDB.getMaintenanceRecords(id);
                        return mockResponse({ records, totalPages: 1, totalCount: records.length });
                    }
                    if (init.method === 'POST') {
                        const body = JSON.parse(init.body as string);
                        const record = DemoDB.createMaintenanceRecord({ ...body, vehicleId: id });
                        return mockResponse(record);
                    }
                }

                const maintenanceDeleteMatch = url.match(/\/api\/maintenance\/([^\/]+)$/);
                if (maintenanceDeleteMatch && init?.method === 'DELETE') {
                    DemoDB.deleteMaintenanceRecord(maintenanceDeleteMatch[1]);
                    return mockResponse({ success: true });
                }

                // --- RENAULT TELEMETRY ---
                const renaultMatch = url.match(/\/api\/renault\/([^\/]+)$/);
                if (renaultMatch && (!init || init.method === 'GET')) {
                    const id = decodeURIComponent(renaultMatch[1]);
                    return mockResponse({
                        vin: id,
                        totalMileage: 45200 + Math.floor(Math.random() * 100),
                        fuelQuantity: 60,
                        batteryLevel: 85,
                        lastUpdate: new Date().toISOString(),
                        isElectric: !id.includes('Diesel')
                    });
                }

                // --- USERS ---
                if (url.match(/\/api\/users(\?.*)?$/) && (!init || init.method === 'GET')) {
                    const users = DemoDB.getUsers();
                    return mockResponse({ 
                        users, 
                        availableRoles: ['ADMIN', 'RESPO', 'CHVL', 'CHVPSP', 'SECOURISTE', 'CI/RPAPS', 'GUEST', 'INACTIF'] 
                    });
                }

                // --- RESERVATIONS ---
                const reservationsMatch = url.match(/\/api\/vehicles\/([^\/]+)\/reservations/);
                if (reservationsMatch && (!init || init.method === 'GET')) {
                    return mockResponse([]);
                }

                // --- STATS ---
                if (url.match(/\/api\/stats(\?.*)?$/) && (!init || init.method === 'GET')) {
                    return mockResponse({
                        success: true,
                        data: {
                            period: { from: '2026-01-01', to: '2026-12-31' },
                            global: { 
                                totalTrips: 0, 
                                completedTrips: 0, 
                                totalKm: 0, 
                                avgKmPerTrip: 0, 
                                totalIncidents: 0,
                                avgFuelConsumption: 0,
                                avgLPer100km: 0,
                                totalFuelLiters: 0,
                                avgFuelAtReturn: 0,
                                fleetUtilizationRate: 0,
                                incidentRate: 0,
                                avgKwhPer100km: 0,
                                totalKwhConsumed: 0
                            },
                            byDriver: [],
                            byVehicle: [],
                            kmOverTime: [],
                            byMissionType: []
                        }
                    });
                }

                // --- DRIVE UPLOAD ---
                if (url.match(/\/api\/drive\/upload$/) && init?.method === 'POST') {
                    return mockResponse({ folderId: 'demo-folder-' + Date.now() });
                }

                // --- INVENTORY ---
                if (url.match(/\/api\/inventory\/vehicle\/([^\/]+)$/) && (!init || init.method === 'GET')) {
                    return mockResponse({ categories: [] });
                }

                // Default mock for other /api/ routes to prevent data leakage
                if (init?.method === 'POST' || init?.method === 'PATCH' || init?.method === 'PUT' || init?.method === 'DELETE') {
                    console.warn(`[DemoMode] Unhandled mutation route: ${url}. Mocking success to prevent real API call.`);
                    return mockResponse({ success: true, message: 'Mocked successful mutation' });
                }
            } catch (err: unknown) {
                console.error('[DemoMode] Interceptor error:', err);
                const message = err instanceof Error ? err.message : 'Unknown error';
                return mockResponse({ error: message }, 500);
            }
        }

        return originalFetch(input, init);
    };
}

function mockResponse(data: unknown, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { 'Content-Type': 'application/json' }
    });
}

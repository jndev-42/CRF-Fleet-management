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
            // Exceptions: Auth and essential system routes must hit the real server
            if (url.includes('/api/auth/') || url.includes('/api/me/license-check')) {
                return originalFetch(input, init);
            }

            console.log(`[DemoMode] Intercepting ${url}`, init);

            try {
                // GET Vehicles
                if (url.match(/\/api\/vehicles$/) && (!init || init.method === 'GET')) {
                    const vehicles = DemoDB.getVehicles();
                    return mockResponse({ vehicles });
                }

                // GET Vehicle Detail
                const vehicleDetailMatch = url.match(/\/api\/vehicles\/([^\/?]+)$/);
                if (vehicleDetailMatch && (!init || init.method === 'GET')) {
                    const vehicle = DemoDB.getVehicle(vehicleDetailMatch[1]);
                    return vehicle ? mockResponse(vehicle) : mockResponse({ error: 'Not found' }, 404);
                }

                // GET Users
                if (url.match(/\/api\/users/) && (!init || init.method === 'GET')) {
                    const users = DemoDB.getUsers();
                    return mockResponse({ users });
                }

                // GET Reservations
                if (url.match(/\/api\/vehicles\/([^\/]+)\/reservations/) && (!init || init.method === 'GET')) {
                    return mockResponse([]);
                }

                // POST Trips (Check-out)
                if (url.match(/\/api\/trips$/) && init?.method === 'POST') {
                    const body = JSON.parse(init.body as string);
                    const trip = DemoDB.createTrip(body);
                    return mockResponse(trip);
                }

                // PATCH Trip (Check-in)
                const checkinMatch = url.match(/\/api\/trips\/([^\/]+)\/checkin$/);
                if (checkinMatch && init?.method === 'PATCH') {
                    const body = JSON.parse(init.body as string);
                    const trip = DemoDB.checkInTrip(checkinMatch[1], body);
                    return mockResponse(trip);
                }

                // POST Drive Upload
                if (url.match(/\/api\/drive\/upload$/) && init?.method === 'POST') {
                    return mockResponse({ folderId: 'demo-folder-' + Date.now() });
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

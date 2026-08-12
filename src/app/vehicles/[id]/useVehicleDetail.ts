import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RenaultVehicleData } from '@/lib/renault';
import { MaintenanceRecord, Vehicle } from './types';

/**
 * Owns all data-fetching for the vehicle detail page: the vehicle entity itself,
 * session/role info, Renault Connect telemetry, and maintenance history.
 */
export function useVehicleDetail(id: string) {
    const router = useRouter();

    const [vehicle, setVehicle] = useState<Vehicle | null>(null);
    const [renaultData, setRenaultData] = useState<RenaultVehicleData | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingRenault, setLoadingRenault] = useState(false);
    const [userRoles, setUserRoles] = useState<string[]>([]);
    const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
    const [currentUserUlId, setCurrentUserUlId] = useState<string | null>(null);
    const [licenseBlocked, setLicenseBlocked] = useState(false);
    const [users, setUsers] = useState<{ id: string, name: string, email: string }[]>([]);
    const [maintenanceRecords, setMaintenanceRecords] = useState<MaintenanceRecord[]>([]);
    const [maintenanceRefreshKey, setMaintenanceRefreshKey] = useState(0);

    useEffect(() => {
        // Fetch the current session to determine if the user has specific roles (e.g., ADMIN)
        fetch('/api/auth/session')
            .then(res => res.json())
            .then(session => {
                if (session?.user?.roles) {
                    setUserRoles(session.user.roles);
                }
                if (session?.user?.email) {
                    setCurrentUserEmail(session.user.email);
                }
                if (session?.user?.ulId) {
                    setCurrentUserUlId(session.user.ulId);
                }
            })
            .catch(console.error);

        // Check license validity for drivers
        fetch('/api/me/license-check')
            .then(res => res.json())
            .then(data => { if (data.blocked) setLicenseBlocked(true); })
            .catch(console.error);
    }, []);

    /**
     * Fetches the detailed vehicle data from the database.
     * Re-runs whenever the page is refreshed or immediately after modifying a trip.
     */
    const fetchVehicleAbortRef = useRef<AbortController | null>(null);

    const fetchVehicle = useCallback(async () => {
        fetchVehicleAbortRef.current?.abort();
        const controller = new AbortController();
        fetchVehicleAbortRef.current = controller;
        try {
            const res = await fetch(`/api/vehicles/${id}?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
            const data = await res.json();
            if (!res.ok) {
                if (res.status === 401) {
                    router.push(`/login?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
                    return;
                }
                throw new Error(data.error || 'Erreur lors de la récupération');
            }
            setVehicle(data);
        } catch (error) {
            if (error instanceof Error && error.name === 'AbortError') return;
            console.error('Erreur:', error);
        } finally {
            if (fetchVehicleAbortRef.current === controller) setLoading(false);
        }
    }, [id, router]);

    useEffect(() => {
        fetchVehicle();
        return () => fetchVehicleAbortRef.current?.abort();
    }, [fetchVehicle]);

    useEffect(() => {
        if (!vehicle?.type) return;
        fetch(`/api/users?vehicleType=${encodeURIComponent(vehicle.type)}`)
            .then(res => res.json())
            .then(data => { if (data.users) setUsers(data.users); })
            .catch(console.error);
    }, [vehicle?.type]);

    // Fetch all maintenance records for the vehicle (used for CT/revision calculations)
    const fetchAllMaintenanceRecords = useCallback(async () => {
        const allRecords: MaintenanceRecord[] = [];
        const fetchPage = async (p: number): Promise<void> => {
            const res = await fetch(`/api/vehicles/${id}/maintenance?page=${p}`);
            if (!res.ok) return;
            const data = await res.json();
            allRecords.push(...data.records);
            if (p < data.totalPages) {
                await fetchPage(p + 1);
            }
        };
        await fetchPage(1);
        setMaintenanceRecords(allRecords);
    }, [id]);

    useEffect(() => {
        if (!vehicle?.firstRegistrationDate) return;
        fetchAllMaintenanceRecords().catch(console.error);
    }, [fetchAllMaintenanceRecords, vehicle?.firstRegistrationDate, maintenanceRefreshKey]);

    // Fetch Renault Connect telemetry for connected vehicles (those with a VIN)
    useEffect(() => {
        if (vehicle?.vin && !renaultData) {
            setLoadingRenault(true);
            fetch(`/api/renault/${encodeURIComponent(vehicle.vin)}`)
                .then(r => r.json())
                .then(rData => {
                    if (!rData.error) setRenaultData(rData);
                })
                .catch(e => console.error('Failed to get Renault data:', e))
                .finally(() => setLoadingRenault(false));
        }
    }, [vehicle?.vin, renaultData]);

    // Trigger refresh of unvalidated Renault data for completed trips
    useEffect(() => {
        if (!vehicle) return;
        const unvalidatedTrip = vehicle.trips.find(t => t.checkInAt && t.renaultDataValidated === 0);
        if (!unvalidatedTrip) return;

        fetch(`/api/trips/${unvalidatedTrip.id}/refresh-renault`, { method: 'PATCH' })
            .then(r => r.json())
            .then(result => {
                if (result.validated) {
                    fetchVehicle();
                }
            })
            .catch(console.error);
    }, [vehicle, fetchVehicle]);

    return {
        vehicle,
        setVehicle,
        renaultData,
        loading,
        loadingRenault,
        userRoles,
        currentUserEmail,
        currentUserUlId,
        licenseBlocked,
        users,
        maintenanceRecords,
        fetchVehicle,
        bumpMaintenanceRefresh: () => setMaintenanceRefreshKey(k => k + 1),
    };
}

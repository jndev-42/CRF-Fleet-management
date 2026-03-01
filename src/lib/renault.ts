import { GigyaApi, KamereonApi } from '@remscodes/renault-api';

// VIN mapping for known vehicles
export const VEHICLE_VINS: Record<string, string> = {
    VL186: process.env.RENAULT_VIN_VL186 || 'VYSP01H0876365199',
    VL188: process.env.RENAULT_VIN_VL188 || 'VF1RHN00472485396',
};

// Map vehicle names to VINs (case-insensitive partial match)
export function getVinFromName(vehicleName: string): string | null {
    const upper = vehicleName.toUpperCase();
    for (const [key, vin] of Object.entries(VEHICLE_VINS)) {
        if (upper.includes(key)) return vin;
    }
    return null;
}

// Session cache to avoid re-authenticating on every request
let cachedSession: {
    idToken: string;
    accountId: string;
    expiresAt: number;
} | null = null;

async function authenticate(): Promise<{ idToken: string; accountId: string }> {
    // Return cached session if still valid (with 60s margin)
    if (cachedSession && Date.now() < cachedSession.expiresAt - 60_000) {
        return { idToken: cachedSession.idToken, accountId: cachedSession.accountId };
    }

    const mail = process.env.RENAULT_MAIL;
    const pass = process.env.RENAULT_PASS;
    if (!mail || !pass) throw new Error('RENAULT_MAIL and RENAULT_PASS must be set');

    // Step 1: Login to Gigya
    const loginUrl = new URL(GigyaApi.LOGIN_URL);
    loginUrl.searchParams.set('apikey', GigyaApi.KEY);
    loginUrl.searchParams.set('loginID', mail);
    loginUrl.searchParams.set('password', pass);
    const loginRes = await fetch(loginUrl, { method: 'POST' }).then(r => r.json());
    if (loginRes.errorCode !== 0) throw new Error(`Gigya login failed: ${loginRes.errorMessage}`);
    const loginToken = loginRes.sessionInfo.cookieValue;

    // Step 2: Get account info (personId)
    const accountUrl = new URL(GigyaApi.GET_ACCOUNT_INFO_URL);
    accountUrl.searchParams.set('apikey', GigyaApi.KEY);
    accountUrl.searchParams.set('login_token', loginToken);
    const accountRes = await fetch(accountUrl, { method: 'POST' }).then(r => r.json());
    const personId = accountRes.data?.personId;
    if (!personId) throw new Error('Could not get personId');

    // Step 3: Get JWT (15min expiry)
    const jwtUrl = new URL(GigyaApi.GET_JWT_URL);
    jwtUrl.searchParams.set('apikey', GigyaApi.KEY);
    jwtUrl.searchParams.set('login_token', loginToken);
    jwtUrl.searchParams.set('fields', 'data.personId,data.gigyaDataCenter');
    jwtUrl.searchParams.set('expiration', '900');
    const jwtRes = await fetch(jwtUrl, { method: 'POST' }).then(r => r.json());
    const idToken = jwtRes.id_token;
    if (!idToken) throw new Error('Could not get JWT');

    const headers = {
        apikey: KamereonApi.KEY,
        'x-gigya-id_token': idToken,
    };

    // Step 4: Get accountId
    const personUrl = new URL(KamereonApi.PERSON_URL(personId));
    personUrl.searchParams.set('country', 'FR');
    const personRes = await fetch(personUrl, { headers }).then(r => r.json());
    const myAccount = personRes.accounts?.find((a: { accountType: string }) => a.accountType === 'MYRENAULT');
    if (!myAccount) throw new Error('No MYRENAULT account found');
    const accountId = myAccount.accountId;

    // Cache for 14 minutes
    cachedSession = { idToken, accountId, expiresAt: Date.now() + 14 * 60_000 };

    return { idToken, accountId };
}

export interface RenaultVehicleData {
    vin: string;
    // Cockpit data (v1)
    totalMileage: number | null;
    fuelQuantity: number | null;
    fuelAutonomy: number | null;
    // Battery data (electric only)
    batteryLevel: number | null;
    batteryAutonomy: number | null;
    chargingStatus: number | null;
    plugStatus: number | null;
    // Meta
    cockpitTimestamp: string | null;
    batteryTimestamp: string | null;
    isElectric: boolean;
}

export async function getRenaultVehicleData(vin: string): Promise<RenaultVehicleData> {
    const { idToken, accountId } = await authenticate();

    const headers = {
        apikey: KamereonApi.KEY,
        'x-gigya-id_token': idToken,
    };

    const result: RenaultVehicleData = {
        vin,
        totalMileage: null,
        fuelQuantity: null,
        fuelAutonomy: null,
        batteryLevel: null,
        batteryAutonomy: null,
        chargingStatus: null,
        plugStatus: null,
        cockpitTimestamp: null,
        batteryTimestamp: null,
        isElectric: false,
    };

    // Cockpit v1 (works for all vehicles)
    try {
        const cockpitUrl = `https://api-wired-prod-1-euw1.wrd-aws.com/commerce/v1/accounts/${accountId}/kamereon/kca/car-adapter/v1/cars/${vin}/cockpit?country=FR`;
        const cockpitRes = await fetch(cockpitUrl, { headers });
        if (cockpitRes.ok) {
            const cockpitData = await cockpitRes.json();
            const attrs = cockpitData.data?.attributes;
            if (attrs) {
                result.totalMileage = attrs.totalMileage ?? null;
                result.fuelQuantity = attrs.fuelQuantity ?? null;
                result.fuelAutonomy = attrs.fuelAutonomy ?? null;
                result.cockpitTimestamp = attrs.timestamp ?? null;
            }
        }
    } catch (e) {
        console.error('Renault cockpit error:', e);
    }

    // Battery status (electric vehicles)
    try {
        const battUrl = new URL(KamereonApi.READ_BATTERY_STATUS_URL(accountId, vin));
        battUrl.searchParams.set('country', 'FR');
        const battRes = await fetch(battUrl, { headers });
        if (battRes.ok) {
            const battData = await battRes.json();
            const attrs = battData.data?.attributes;
            if (attrs && attrs.batteryLevel !== undefined) {
                result.isElectric = true;
                result.batteryLevel = attrs.batteryLevel ?? null;
                result.batteryAutonomy = attrs.batteryAutonomy ?? null;
                result.chargingStatus = attrs.chargingStatus ?? null;
                result.plugStatus = attrs.plugStatus ?? null;
                result.batteryTimestamp = attrs.timestamp ?? null;
            }
        }
    } catch (e) {
        console.error('Renault battery error:', e);
    }

    return result;
}

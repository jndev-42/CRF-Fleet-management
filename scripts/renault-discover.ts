// Full raw Renault API flow using @remscodes/renault-api for URLs and types
import { GigyaApi, KamereonApi } from '@remscodes/renault-api';

async function discover() {
    const mail = process.env.RENAULT_MAIL!;
    const pass = process.env.RENAULT_PASS!;

    // Step 1: Login
    console.log('🔐 Logging in...');
    const loginUrl = new URL(GigyaApi.LOGIN_URL);
    loginUrl.searchParams.set('apikey', GigyaApi.KEY);
    loginUrl.searchParams.set('loginID', mail);
    loginUrl.searchParams.set('password', pass);
    const loginRes = await fetch(loginUrl, { method: 'POST' }).then(r => r.json());
    const loginToken = loginRes.sessionInfo.cookieValue;
    console.log('✅ Login OK');

    // Step 2: Get account info (personId)
    console.log('👤 Getting account info...');
    const accountUrl = new URL(GigyaApi.GET_ACCOUNT_INFO_URL);
    accountUrl.searchParams.set('apikey', GigyaApi.KEY);
    accountUrl.searchParams.set('login_token', loginToken);
    const accountRes = await fetch(accountUrl, { method: 'POST' }).then(r => r.json());
    const personId = accountRes.data.personId;
    console.log('✅ Person ID:', personId);

    // Step 3: Get JWT
    console.log('🔑 Getting JWT...');
    const jwtUrl = new URL(GigyaApi.GET_JWT_URL);
    jwtUrl.searchParams.set('apikey', GigyaApi.KEY);
    jwtUrl.searchParams.set('login_token', loginToken);
    jwtUrl.searchParams.set('fields', 'data.personId,data.gigyaDataCenter');
    jwtUrl.searchParams.set('expiration', '900');
    const jwtRes = await fetch(jwtUrl, { method: 'POST' }).then(r => r.json());
    const idToken = jwtRes.id_token;
    console.log('✅ JWT obtained (length:', idToken.length, ')');

    const headers = {
        'apikey': KamereonApi.KEY,
        'x-gigya-id_token': idToken,
    };

    // Step 4: Get person (to find accountId)
    console.log('👤 Getting person...');
    const personUrl = new URL(KamereonApi.PERSON_URL(personId));
    personUrl.searchParams.set('country', 'FR');
    const personRes = await fetch(personUrl, { headers }).then(r => r.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Renault API response shape
    const myAccount = personRes.accounts.find((a: any) => a.accountType === 'MYRENAULT');
    if (!myAccount) {
        console.error('No MYRENAULT account found');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Renault API response shape
        console.log('Accounts:', personRes.accounts?.map((a: any) => ({ type: a.accountType, id: a.accountId })));
        return;
    }
    const accountId = myAccount.accountId;
    console.log('✅ Account ID:', accountId);

    // Step 5: Get vehicles
    console.log('\n🚗 Getting vehicles...');
    const vehiclesUrl = new URL(KamereonApi.ACCOUNT_VEHICLES_URL(accountId));
    vehiclesUrl.searchParams.set('country', 'FR');
    const vehiclesRes = await fetch(vehiclesUrl, { headers }).then(r => r.json());
    const vehicles = vehiclesRes.vehicleLinks || [];
    console.log(`Found ${vehicles.length} vehicle(s):\n`);

    for (const link of vehicles) {
        console.log('===========================');
        console.log('VIN:', link.vin);
        console.log('Brand:', link.brand);
        console.log('Status:', link.status);
        console.log('Registration:', link.vehicleDetails?.registrationNumber);
        console.log('Model:', link.vehicleDetails?.model?.label);
        console.log('Energy:', link.vehicleDetails?.energy?.label);
        console.log('Engine Type:', link.vehicleDetails?.engineType);
        console.log('Electrical:', link.vehicleDetails?.electrical);

        // Battery status (electric vehicles)
        if (link.vehicleDetails?.electrical) {
            try {
                const battUrl = new URL(KamereonApi.READ_BATTERY_STATUS_URL(accountId, link.vin));
                battUrl.searchParams.set('country', 'FR');
                const battRes = await fetch(battUrl, { headers }).then(r => r.json());
                console.log('🔋 Battery Level:', battRes.data?.attributes?.batteryLevel, '%');
                console.log('🔋 Battery Autonomy:', battRes.data?.attributes?.batteryAutonomy, 'km');
                console.log('🔌 Plug Status:', battRes.data?.attributes?.plugStatus);
                console.log('⚡ Charging Status:', battRes.data?.attributes?.chargingStatus);
                console.log('🔋 Remaining Time:', battRes.data?.attributes?.chargingRemainingTime, 'min');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
            } catch (e: any) {
                console.log('Battery error:', e.message);
            }
        }

        // Cockpit (mileage, fuel)
        try {
            const cockUrl = new URL(KamereonApi.READ_COCKPIT_URL(accountId, link.vin));
            cockUrl.searchParams.set('country', 'FR');
            const cockRes = await fetch(cockUrl, { headers }).then(r => r.json());
            console.log('📊 Total Mileage:', cockRes.data?.attributes?.totalMileage, 'km');
            console.log('⛽ Fuel Quantity:', cockRes.data?.attributes?.fuelQuantity, 'L');
            console.log('⛽ Fuel Autonomy:', cockRes.data?.attributes?.fuelAutonomy, 'km');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) {
            console.log('Cockpit error:', e.message);
        }

        // Lock status
        try {
            const lockUrl = new URL(KamereonApi.READ_LOCK_STATUS_URL(accountId, link.vin));
            lockUrl.searchParams.set('country', 'FR');
            const lockRes = await fetch(lockUrl, { headers }).then(r => r.json());
            console.log('🔒 Lock Status:', lockRes.data?.attributes?.lockStatus);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) {
            console.log('Lock error:', e.message);
        }

        console.log('');
    }
}

discover().catch(console.error);

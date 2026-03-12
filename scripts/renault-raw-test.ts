// Deep investigation of cockpit/mileage endpoints with different versions
import { GigyaApi, KamereonApi } from '@remscodes/renault-api';

async function test() {
    const mail = process.env.RENAULT_MAIL!;
    const pass = process.env.RENAULT_PASS!;

    // Auth
    const loginUrl = new URL(GigyaApi.LOGIN_URL);
    loginUrl.searchParams.set('apikey', GigyaApi.KEY);
    loginUrl.searchParams.set('loginID', mail);
    loginUrl.searchParams.set('password', pass);
    const loginRes = await fetch(loginUrl, { method: 'POST' }).then(r => r.json());
    const loginToken = loginRes.sessionInfo.cookieValue;

    const accountUrl = new URL(GigyaApi.GET_ACCOUNT_INFO_URL);
    accountUrl.searchParams.set('apikey', GigyaApi.KEY);
    accountUrl.searchParams.set('login_token', loginToken);
    const accountRes = await fetch(accountUrl, { method: 'POST' }).then(r => r.json());
    const personId = accountRes.data.personId;

    const jwtUrl = new URL(GigyaApi.GET_JWT_URL);
    jwtUrl.searchParams.set('apikey', GigyaApi.KEY);
    jwtUrl.searchParams.set('login_token', loginToken);
    jwtUrl.searchParams.set('fields', 'data.personId,data.gigyaDataCenter');
    jwtUrl.searchParams.set('expiration', '900');
    const jwtRes = await fetch(jwtUrl, { method: 'POST' }).then(r => r.json());
    const idToken = jwtRes.id_token;

    const headers = {
        'apikey': KamereonApi.KEY,
        'x-gigya-id_token': idToken,
    };

    const personUrl = new URL(KamereonApi.PERSON_URL(personId));
    personUrl.searchParams.set('country', 'FR');
    const personRes = await fetch(personUrl, { headers }).then(r => r.json());
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Renault API response shape
    const accountId = personRes.accounts.find((a: any) => a.accountType === 'MYRENAULT').accountId;

    const baseUrl = 'https://api-wired-prod-1-euw1.wrd-aws.com/commerce/v1/accounts';

    const vins = [
        { name: 'VL188 (Espace)', vin: 'VF1RHN00472485396' },
        { name: 'VL186 (R4 E-Tech)', vin: 'VYSP01H0876365199' },
    ];

    for (const { name, vin } of vins) {
        console.log(`\n========== ${name} (${vin}) ==========\n`);

        // Try cockpit v1
        try {
            const url = `${baseUrl}/${accountId}/kamereon/kca/car-adapter/v1/cars/${vin}/cockpit?country=FR`;
            const res = await fetch(url, { headers });
            console.log(`Cockpit v1 [${res.status}]:`, JSON.stringify(await res.json(), null, 2));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) { console.log('Cockpit v1 error:', e.message); }

        // Try cockpit v2 (default)
        try {
            const url = `${baseUrl}/${accountId}/kamereon/kca/car-adapter/v2/cars/${vin}/cockpit?country=FR`;
            const res = await fetch(url, { headers });
            console.log(`Cockpit v2 [${res.status}]:`, JSON.stringify(await res.json(), null, 2));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) { console.log('Cockpit v2 error:', e.message); }

        // Try adapter (shows which endpoints are available)
        try {
            const url = KamereonApi.READ_ADAPTER_URL(accountId, vin) + '?country=FR';
            const res = await fetch(url, { headers });
            console.log(`Adapter [${res.status}]:`, JSON.stringify(await res.json(), null, 2));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) { console.log('Adapter error:', e.message); }

        // Try res-state
        try {
            const url = `${baseUrl}/${accountId}/kamereon/kca/car-adapter/v1/cars/${vin}/res-state?country=FR`;
            const res = await fetch(url, { headers });
            console.log(`Res-state [${res.status}]:`, JSON.stringify(await res.json(), null, 2));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) { console.log('Res-state error:', e.message); }

        // Try pressure
        try {
            const url = `${baseUrl}/${accountId}/kamereon/kca/car-adapter/v1/cars/${vin}/pressure?country=FR`;
            const res = await fetch(url, { headers });
            console.log(`Pressure [${res.status}]:`, JSON.stringify(await res.json(), null, 2));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- script error shape
        } catch (e: any) { console.log('Pressure error:', e.message); }
    }
}

test().catch(console.error);

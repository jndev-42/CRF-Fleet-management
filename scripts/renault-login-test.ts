// Raw Gigya login test - bypasses the client library
import { GigyaApi } from '@remscodes/renault-api';

async function testLogin() {
    const mail = process.env.RENAULT_MAIL!;
    const pass = process.env.RENAULT_PASS!;
    console.log('Testing raw Gigya login with:', mail);

    const url = new URL(GigyaApi.LOGIN_URL);
    url.searchParams.set('apikey', GigyaApi.KEY);
    url.searchParams.set('loginID', mail);
    url.searchParams.set('password', pass);

    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();

    console.log('Response status:', response.status);
    console.log('Response data:', JSON.stringify(data, null, 2));
}

testLogin().catch(console.error);

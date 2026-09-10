/**
 * Spike local — la porte bloquante avant tout déploiement.
 *
 * Même discipline qu'au round 5 de l'interview, qui a limité le coût de la
 * première erreur d'architecture à un script : on prouve d'abord que le
 * navigateur franchit le captcha et que `<scheme>://` est interceptable, **puis**
 * seulement on provisionne un hébergement.
 *
 * Usage :
 *   cd worker && npm install && npx playwright install chromium
 *   PSA_MAIL=… PSA_PASS=… PEUGEOT_CLIENT_SECRET=… HEADED=1 npm run spike -- --brand PEUGEOT
 *
 * `HEADED=1` ouvre un navigateur visible : c'est le mode à privilégier au premier
 * essai, pour voir où le parcours s'arrête si un sélecteur a bougé.
 */
import { acquireTokens } from './acquire.js';
import { WorkerError } from './errors.js';
import { BRAND_CONFIG, readBrandEnv } from './brands.js';

const brand = (process.argv[process.argv.indexOf('--brand') + 1] ?? 'PEUGEOT').toUpperCase();
const login = process.env.PSA_MAIL;
const password = process.env.PSA_PASS;

if (!login || !password) {
    console.error('PSA_MAIL et PSA_PASS sont requis.');
    process.exit(1);
}

const redact = (v: string | null) => (v ? `${v.slice(0, 8)}…(${v.length} car.)` : '(absent)');

/**
 * Sonde de télémétrie — **diagnostic uniquement**.
 *
 * En production cette lecture vit côté Vercel : le worker n'est pas sur le chemin
 * des relevés quotidiens, et le cron ne doit pas dépendre de lui. Elle n'est ici
 * que pour relever la forme réelle de la réponse, à mapper sur
 * `RenaultVehicleData` dans `src/lib/stellantis.ts`.
 */
async function probeTelemetry(accessToken: string): Promise<void> {
    const cfg = BRAND_CONFIG[brand];
    const clientId = readBrandEnv(brand).clientId ?? cfg?.clientId;
    if (!cfg || !clientId) return;

    const headers = {
        Authorization: `Bearer ${accessToken}`,
        'x-introspect-realm': cfg.realm,
        Accept: 'application/hal+json',
    };
    const res = await fetch(`https://api.groupe-psa.com/connectedcar/v4/user/vehicles?client_id=${clientId}`, { headers });
    const text = await res.text();
    console.log(`\n── Télémétrie — GET /user/vehicles → ${res.status} ──────────────`);
    console.log(text.slice(0, 2500));

    const vin = process.env.PSA_VIN;
    if (!res.ok || !vin) return;

    const parsed = JSON.parse(text) as { _embedded?: { vehicles?: { id: string; vin: string }[] } };
    const found = parsed._embedded?.vehicles?.find((v) => v.vin === vin);
    if (!found) {
        console.log(`\n   ⚠️ VIN ${vin} absent du compte — équivalent PSA de VinNotOnAccountError.`);
        return;
    }
    const statusRes = await fetch(
        `https://api.groupe-psa.com/connectedcar/v4/user/vehicles/${found.id}/status?client_id=${clientId}`,
        { headers }
    );
    console.log(`\n── status du VIN ${vin} → ${statusRes.status} ──────────────`);
    console.log((await statusRes.text()).slice(0, 3500));
}

acquireTokens({ brand, login, password, country: process.env.PSA_COUNTRY })
    .then(async (r) => {
        console.log('\n✅ Spike réussi — le navigateur franchit le captcha.');
        for (const line of r.trace) console.log(`   · ${line}`);
        console.log(`\n   access_token  : ${redact(r.accessToken)}`);
        console.log(`   refresh_token : ${redact(r.refreshToken)}`);
        console.log(`   expires_in    : ${r.expiresIn}s`);
        await probeTelemetry(r.accessToken).catch((e: unknown) =>
            console.error(`\n   ⚠️ Sonde de télémétrie en échec : ${e instanceof Error ? e.message : String(e)}`)
        );
    })
    .catch((e: unknown) => {
        console.error('\n❌ Spike en échec :', e instanceof Error ? e.message : String(e));
        // La trace dit ce qui a réussi avant l'échec — sans elle, un blocage à la
        // dernière étape a l'air d'un échec total.
        if (e instanceof WorkerError && e.trace.length > 0) {
            console.error('\n   Étapes franchies :');
            for (const line of e.trace) console.error(`   · ${line}`);
        }
        console.error('\n   → Relancer avec HEADED=1 SLOWMO=250 pour observer le parcours.');
        process.exitCode = 1;
    });

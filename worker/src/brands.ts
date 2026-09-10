/**
 * Configuration des marques PSA — **duplication assumée** de `src/lib/brands.ts`.
 *
 * Le worker est un déployable distinct (Render), l'application en est un autre
 * (Vercel) : il n'y a pas de module partagé entre les deux. Dupliquer une table
 * de quatre champs coûte moins qu'un paquet interne à publier et à versionner.
 *
 * `realm` : relevé sur `GET https://<idpHost>/am/json/serverinfo/*`.
 * `clientId` : relevé dans les journaux publics de `psa_car_controller`, et
 * vérifié en sonde pour Peugeot et Vauxhall (`GET /am/oauth2/authorize` répond
 * `301` et non `invalid_client`). `null` ailleurs : mieux vaut un refus explicite
 * qu'un `redirect_uri_mismatch` opaque.
 */
export interface BrandConfig {
    idpHost: string;
    realm: string;
    /** Scheme de l'application mobile — seul `redirect_uri` accepté par le client. */
    scheme: string;
    clientId: string | null;
    /**
     * Secret du client OAuth.
     *
     * Obligatoire : la découverte OIDC de l'IdP annonce
     * `token_endpoint_auth_methods_supported: [client_secret_post,
     * private_key_jwt, client_secret_basic]` — **`none` en est absent**, donc
     * PKCE seul ne suffit pas à l'échange, quoi qu'en laisse croire l'acceptation
     * de `code_challenge` à l'étape d'autorisation.
     *
     * Ce n'est pas un secret d'utilisateur mais une constante d'application
     * mobile, publiée dans `psa_car_controller`. Elle reste hors du dépôt : à
     * fournir par `PSA_CLIENT_SECRET` en local, et par variable d'environnement
     * du service en production.
     */
    clientSecret: string | null;
}

export const BRAND_CONFIG: Record<string, BrandConfig> = {
    PEUGEOT: { idpHost: 'idpcvs.peugeot.com', realm: 'clientsB2CPeugeot', scheme: 'mymap', clientId: '1eebc2d5-5df3-459b-a624-20abfcf82530', clientSecret: null },
    CITROEN: { idpHost: 'idpcvs.citroen.com', realm: 'clientsB2CCitroen', scheme: 'mymacsdk', clientId: null, clientSecret: null },
    DS: { idpHost: 'idpcvs.driveds.com', realm: 'clientsB2CDS', scheme: 'mymdssdk', clientId: null, clientSecret: null },
    OPEL: { idpHost: 'idpcvs.opel.com', realm: 'clientsB2COpel', scheme: 'mymopsdk', clientId: null, clientSecret: null },
    VAUXHALL: { idpHost: 'idpcvs.vauxhall.co.uk', realm: 'clientsB2CVauxhall', scheme: 'mymvxsdk', clientId: '122f3511-4f74-4a0c-bcda-af2f3b2e3a65', clientSecret: null },
};

export function isSupportedBrand(value: unknown): value is string {
    return typeof value === 'string' && value in BRAND_CONFIG;
}

/**
 * Registre des marques constructeur prises en charge par le flux de connexion.
 *
 * Module **sans aucun import** : il est lu aussi bien par les routes serveur
 * (schémas Zod) que par les composants client (`<select>` Marque), et doit le
 * rester — y importer `@/lib/db` tirerait `@libsql/client` dans le bundle
 * navigateur.
 *
 * Ajouter une marque = une entrée ici + un client de fetch `src/lib/brands/<marque>.ts`
 * + une entrée `BRAND_FORMS` côté UI. Aucune migration de schéma n'est requise
 * (`BrandCredential.brand` et `VehicleConnection.brand` sont des colonnes TEXT).
 */

/** Marques supportées. L'ordre fixe celui du `<select>`. */
export const BRANDS = ['RENAULT'] as const;

export type Brand = (typeof BRANDS)[number];

/** Libellés affichés à l'utilisateur. */
export const BRAND_LABELS: Record<Brand, string> = {
    RENAULT: 'Renault',
};

/** Nom du compte constructeur, pour les messages d'erreur et les libellés de formulaire. */
export const BRAND_ACCOUNT_LABELS: Record<Brand, string> = {
    RENAULT: 'MyRenault',
};

/** Garde de type — utilisable sur une valeur lue en base ou reçue d'un client. */
export function isBrand(value: unknown): value is Brand {
    return typeof value === 'string' && (BRANDS as readonly string[]).includes(value);
}

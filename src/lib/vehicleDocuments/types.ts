/**
 * Métadonnées d'un document lié à un véhicule, telles que les routes les exposent.
 * Module SANS dépendance serveur : importable par les Client Components. La clé R2
 * n'en fait jamais partie.
 */
export interface VehicleDocumentMeta {
    id: string;
    fileName: string;
    size: number;
    createdAt: string;
}

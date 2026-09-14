/** Lot d'un article, tel que renvoyé par `GET /api/qr-stock/[token]/stock`. */
export interface QRStockBatch {
    expiryDate: string | null;
    quantity: number;
}

export interface QRStockItem {
    id: string;
    name: string;
    category: string | null;
    quantity: number;
    minStock: number | null;
    /** Uniquement les lots non vides, en ordre FEFO. */
    batches: QRStockBatch[];
}

export interface QRStock {
    stock: { id: string; name: string };
    items: QRStockItem[];
}

/**
 * Mouvement en attente dans le panier.
 *
 * ⚠️ `key` et `itemName` sont PUREMENT CLIENT — `key` identifie la ligne dans la
 * liste, `itemName` sert à l'afficher sans relire le stock. Le schéma Zod de
 * `POST /api/qr-stock/[token]/adjust` est `.strict()` : il REJETTE les clés
 * inconnues au lieu de les dépouiller. Poster un `PendingMovement` tel quel
 * renverrait donc 400 à chaque validation. La projection obligatoire vit dans
 * `CartSummary.tsx` — ne pas la contourner.
 */
export interface PendingMovement {
    key: string;
    itemId: string;
    itemName: string;
    change: number;
    expiryDate: string | null;
    note?: string | null;
}

/** Borne serveur du panier, reprise ici pour le miroir client. */
export const MAX_MOVEMENTS = 25;

export type LocationType = 'STOCK_CENTRAL' | 'PHARMA_TAMPON' | 'VEHICLE' | 'SAC';
export type StockStatus = 'OK' | 'HORS_SERVICE' | 'MANQUANT';

export interface InvItem {
    id: string;
    name: string;
    sku: string | null;
    category: string | null;
    unit: string;
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface InvLocation {
    id: string;
    type: LocationType;
    name: string;
    vehicleId: string | null;
    parentId: string | null;
    isSealed: boolean;
    templateId: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface InvStock {
    id: string;
    locationId: string;
    locationName: string;
    locationType: LocationType;
    vehicleId: string | null;
    vehicleName: string | null;
    parentId: string | null;
    itemId: string;
    itemName: string;
    sku: string | null;
    category: string | null;
    unit: string;
    quantity: number;
    expiryDate: string | null;
    status: StockStatus;
    criticalThreshold: number | null;
    createdAt: string;
    updatedAt: string;
}

export interface InvTemplate {
    id: string;
    locationId: string;
    itemId: string;
    itemName: string;
    unit: string;
    targetQty: number;
}

export interface InvBagTemplate {
    id: string;
    name: string;
    itemCount: number;
    createdAt: string;
}

export interface InvBagTemplateDetail extends InvBagTemplate {
    entries: InvBagTemplateEntry[];
}

export interface InvBagTemplateEntry {
    id: string;
    itemId: string;
    itemName: string;
    unit: string;
    targetQty: number;
}

export interface InvGroupe {
    id: string;
    name: string;
    description: string | null;
    sacs?: InvLocation[];
    createdAt: string;
    updatedAt: string;
}

export interface InventoryKPIs {
    expiringSoon: number;
    horsService: number;
    pharmaAlerts: number;
    fleetCompleteness: number;
}

// Aliases de migration — à supprimer après la bascule complète
export type InventoryItem = InvStock;
export type InventoryLot = InvLocation & { items?: InvStock[]; itemCount?: number; stockLocation?: string | null; vehicleName?: string | null };

// Payload de transfert (ancienne API — conservé pour compatibilité UI)
export interface InventoryTransferPayload {
    itemId?: string;
    locationId?: string;
    toLocationId?: string;
}

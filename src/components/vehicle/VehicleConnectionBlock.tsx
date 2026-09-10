import React from 'react';
import { AlertTriangle, Link2, Pencil, RefreshCw, Unlink } from 'lucide-react';
import type { RenaultVehicleData } from '@/lib/renault';
import type { Vehicle } from '@/app/vehicles/[id]/types';
import { isSuperAdmin } from '@/lib/roles';
import RenaultConnectBlock from './RenaultConnectBlock';

interface VehicleConnectionBlockProps {
    vehicle: Vehicle;
    renaultData: RenaultVehicleData | null;
    loadingRenault: boolean;
    userRoles: string[];
    currentUserUlId: string | null;
    /** Ouvre `ConnectVehicleModal` — monté par la page, pas par ce bloc. */
    onConnect: (mode: 'connect' | 'edit') => void;
    onDisconnect: () => void;
}

/**
 * Trois états de la connexion marque d'un véhicule : absente, en erreur, active.
 *
 * Le statut est écrit au grain du credential : un `BrandAuthError` fait basculer en
 * « Erreur » tous les véhicules de l'UL partageant le même compte constructeur, et le
 * premier succès les remet tous en `CONNECTED`. Reconnecter un véhicule répare donc
 * visiblement toute l'UL.
 */
export default function VehicleConnectionBlock({
    vehicle,
    renaultData,
    loadingRenault,
    userRoles,
    currentUserUlId,
    onConnect,
    onDisconnect,
}: VehicleConnectionBlockProps) {
    // Jamais dérivé de la présence de `connection` : la vue DT traverse plusieurs ULs et
    // renvoie `connection` pour des véhicules que l'appelant n'administre pas.
    const canManage = isSuperAdmin(userRoles)
        || (userRoles.includes('ADMIN') && currentUserUlId === vehicle.ulId);

    const connection = vehicle.connection;

    if (connection == null) {
        if (!canManage) return null;
        return (
            <div style={{ marginBottom: 24 }}>
                <button className="btn btn-secondary" onClick={() => onConnect('connect')}>
                    <Link2 size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                    Connecter le véhicule
                </button>
            </div>
        );
    }

    if (connection.status === 'ERROR') {
        return (
            <div
                role="alert"
                style={{
                    marginBottom: 24,
                    padding: '14px 16px',
                    background: 'var(--status-maintenance-bg)',
                    border: '1px solid rgba(239,68,68,0.4)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--error-text)',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600 }}>
                    <AlertTriangle size={18} />
                    Connexion au compte constructeur interrompue
                </div>
                {connection.lastError && (
                    <div style={{ marginTop: 8, fontSize: 13 }}>{connection.lastError}</div>
                )}
                {canManage && (
                    <button
                        className="btn btn-secondary"
                        style={{ marginTop: 12 }}
                        onClick={() => onConnect('edit')}
                    >
                        <RefreshCw size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                        Reconnecter
                    </button>
                )}
            </div>
        );
    }

    return (
        <>
            <RenaultConnectBlock renaultData={renaultData} loadingRenault={loadingRenault} />
            {canManage && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
                    <button className="btn btn-secondary" onClick={() => onConnect('edit')}>
                        <Pencil size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                        Modifier
                    </button>
                    <button className="btn btn-secondary" onClick={onDisconnect}>
                        <Unlink size={16} style={{ verticalAlign: 'text-bottom', marginRight: 6 }} />
                        Déconnecter
                    </button>
                </div>
            )}
        </>
    );
}

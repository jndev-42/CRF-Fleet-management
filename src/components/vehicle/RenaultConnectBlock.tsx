import React from 'react';
import type { RenaultVehicleData } from '@/lib/renault';
import { getFuelClass, formatDate } from '@/app/vehicles/[id]/utils';
import DetailCard from './DetailCard';

interface RenaultConnectBlockProps {
    renaultData: RenaultVehicleData | null;
    loadingRenault: boolean;
}

/**
 * Renders telemetry and vehicle statuses directly from the Renault Connect API.
 */
export default function RenaultConnectBlock({ renaultData, loadingRenault }: RenaultConnectBlockProps) {
    if (!renaultData && !loadingRenault) return null;

    return (
        <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <h2 className="section-title" style={{ margin: 0 }}>Renault Connect</h2>
                {loadingRenault && <div className="loading-spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />}
                {!loadingRenault && renaultData && (
                    <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                        Actualisé le {formatDate(renaultData.batteryTimestamp || renaultData.cockpitTimestamp || new Date().toISOString())}
                    </span>
                )}
            </div>

            {!loadingRenault && renaultData && (
                <div className="detail-grid">
                    {(renaultData.totalMileage !== null) && (
                        <DetailCard
                            title="Kilométrage (réel)"
                            value={`${renaultData.totalMileage.toLocaleString('fr-FR')} km`}
                            subtitle="Remonte par la télématique"
                            backgroundColor="var(--bg-secondary)"
                        />
                    )}

                    {renaultData.isElectric ? (
                        <>
                            <DetailCard
                                title="Batterie (réelle)"
                                value={`${renaultData.batteryLevel}%`}
                                titleColor="#2563EB"
                                backgroundColor="rgba(59, 130, 246, 0.05)"
                                borderColor="rgba(59, 130, 246, 0.2)"
                            >
                                <div className="fuel-bar" style={{ marginTop: 8 }}>
                                    <div
                                        className={`fuel-bar-fill ${getFuelClass(renaultData.batteryLevel || 0)}`}
                                        style={{ width: `${renaultData.batteryLevel}%` }}
                                    />
                                </div>
                            </DetailCard>
                            <DetailCard
                                title="Autonomie estimée"
                                value={`${renaultData.batteryAutonomy} km`}
                                subtitle="Liée à la charge actuelle"
                                backgroundColor="var(--bg-secondary)"
                            />
                            <DetailCard
                                title="État de charge"
                                value={
                                    <>
                                        {renaultData.plugStatus === 1 ? '🔌 Branché' : '⚡ Non branché'}
                                        {renaultData.chargingStatus === 1 && ' (En charge)'}
                                    </>
                                }
                                valueStyle={{ fontSize: 16, marginTop: 4 }}
                                backgroundColor="var(--bg-secondary)"
                            />
                        </>
                    ) : (
                        <>
                            <DetailCard
                                title="Carburant estimé"
                                value={`${renaultData.fuelQuantity} L`}
                                titleColor="#EA580C"
                                backgroundColor="rgba(249, 115, 22, 0.05)"
                                borderColor="rgba(249, 115, 22, 0.2)"
                            />
                            <DetailCard
                                title="Autonomie estimée"
                                value={`${renaultData.fuelAutonomy} km`}
                                backgroundColor="var(--bg-secondary)"
                            />
                        </>
                    )}
                </div>
            )}
        </div>
    );
}

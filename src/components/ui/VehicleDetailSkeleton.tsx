import React from 'react';
import { Skeleton, VehicleCardSkeleton } from './Skeleton';

export function VehicleDetailSkeleton() {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', opacity: 0.8 }}>
            <Skeleton width={180} height={20} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <Skeleton width={200} height={40} />
                        <Skeleton variant="rounded" width={32} height={32} />
                    </div>
                    <Skeleton width={120} height={24} />
                    <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <Skeleton variant="rounded" width={80} height={24} />
                        <Skeleton variant="rounded" width={80} height={24} />
                    </div>
                </div>
            </div>

            <Skeleton variant="rounded" width="100%" height={80} style={{ margin: '12px 0' }} />

            <div className="detail-grid">
                <VehicleCardSkeleton />
                <VehicleCardSkeleton />
                <VehicleCardSkeleton />
            </div>

            <div style={{ marginTop: '24px' }}>
                <Skeleton width={150} height={28} style={{ marginBottom: '16px' }} />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <Skeleton variant="rounded" width="100%" height={64} />
                    <Skeleton variant="rounded" width="100%" height={64} />
                </div>
            </div>
        </div>
    );
}

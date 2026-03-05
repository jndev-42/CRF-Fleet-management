import React from 'react';
import styles from './Skeleton.module.css';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
    variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
    width?: string | number;
    height?: string | number;
    className?: string;
}

export function Skeleton({
    variant = 'text',
    width,
    height,
    className = '',
    style,
    ...props
}: SkeletonProps) {
    const classNames = [
        styles.skeleton,
        variant === 'circular' ? styles.circle : '',
        variant === 'rounded' ? styles.rounded : '',
        className
    ].filter(Boolean).join(' ');

    return (
        <div
            className={classNames}
            style={{
                width: width || (variant === 'text' ? '100%' : 'auto'),
                height: height || (variant === 'text' ? '1em' : 'auto'),
                ...style
            }}
            {...props}
        />
    );
}

export function VehicleCardSkeleton() {
    return (
        <div className={styles.vehicleCard}>
            <div className={styles.vehicleCardHeader}>
                <div>
                    <Skeleton width={120} height={24} style={{ marginBottom: 8 }} />
                    <Skeleton width={80} height={16} />
                </div>
                <Skeleton variant="circular" width={40} height={40} />
            </div>

            <div className={styles.details}>
                <div style={{ display: 'flex', gap: 12 }}>
                    <Skeleton width={60} height={20} variant="rounded" />
                    <Skeleton width={60} height={20} variant="rounded" />
                </div>

                <Skeleton height={60} variant="rounded" style={{ marginTop: 8 }} />

                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                    <Skeleton width="45%" height={36} variant="rounded" />
                    <Skeleton width="45%" height={36} variant="rounded" />
                </div>
            </div>
        </div>
    );
}

export function DashboardSkeletons({ count = 6 }: { count?: number }) {
    return (
        <div className="vehicles-grid">
            {Array.from({ length: count }).map((_, i) => (
                <VehicleCardSkeleton key={i} />
            ))}
        </div>
    );
}

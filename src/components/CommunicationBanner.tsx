'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useUL } from '@/lib/contexts/ULContext';
import styles from './CommunicationBanner.module.css';

export interface BannerItem {
    id: string;
    title: string | null;
    message: string;
    target_page: 'ALL' | 'VEHICLES' | 'MISSIONS' | 'INVENTORY';
    type: 'info' | 'warning' | 'danger' | 'success';
    ul_id: string | null;
    is_global: boolean;
    is_active: boolean;
    created_at?: string;
}

function matchesPath(targetPage: BannerItem['target_page'], pathname: string): boolean {
    if (targetPage === 'ALL') return true;
    if (targetPage === 'VEHICLES') return pathname === '/' || pathname.startsWith('/vehicles');
    if (targetPage === 'MISSIONS') return pathname.startsWith('/missions');
    if (targetPage === 'INVENTORY') return pathname.startsWith('/inventory');
    return false;
}

export default function CommunicationBanner() {
    const { data: session, status } = useSession();
    const { activeUL } = useUL();
    const pathname = usePathname();

    const [allBanners, setAllBanners] = useState<BannerItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        if (status !== 'authenticated') {
            return;
        }

        let isMounted = true;
        const activeUlId = activeUL?.id || session?.user?.ulId || '';
        fetch(`/api/banners?ulId=${encodeURIComponent(activeUlId)}`)
            .then(res => res.ok ? res.json() : null)
            .then(data => {
                if (isMounted && data?.banners) {
                    setAllBanners(data.banners);
                }
            })
            .catch(console.error);

        return () => {
            isMounted = false;
        };
    }, [status, activeUL?.id, session?.user?.ulId]);

    if (status !== 'authenticated' || allBanners.length === 0) {
        return null;
    }

    // Filter matching banners for current pathname
    const activeUlId = activeUL?.id || session?.user?.ulId || '';
    const matchingBanners = allBanners.filter(b => {
        if (!b.is_active) return false;
        // Scope check: global or user's active UL
        const scopeMatches = b.is_global || (b.ul_id && b.ul_id === activeUlId);
        if (!scopeMatches) return false;
        // Path check
        return matchesPath(b.target_page, pathname);
    });

    if (matchingBanners.length === 0) {
        return null;
    }

    // Ensure valid index within bounds
    const safeIndex = currentIndex >= matchingBanners.length ? 0 : currentIndex;
    const currentBanner = matchingBanners[safeIndex];

    const handlePrev = () => {
        setCurrentIndex(prev => (prev > 0 ? prev - 1 : matchingBanners.length - 1));
    };

    const handleNext = () => {
        setCurrentIndex(prev => (prev < matchingBanners.length - 1 ? prev + 1 : 0));
    };

    const getTypeClass = (type: BannerItem['type']) => {
        switch (type) {
            case 'info': return styles.typeInfo;
            case 'warning': return styles.typeWarning;
            case 'danger': return styles.typeDanger;
            case 'success': return styles.typeSuccess;
            default: return styles.typeInfo;
        }
    };

    const getTypeIcon = (type: BannerItem['type']) => {
        switch (type) {
            case 'info': return '📢';
            case 'warning': return '⚠️';
            case 'danger': return '🚨';
            case 'success': return '✅';
            default: return '📢';
        }
    };

    return (
        <div
            className={`${styles.banner} ${getTypeClass(currentBanner.type)}`}
            role="region"
            aria-label="Bandeau de communication"
        >
            <div className={styles.contentWrapper}>
                <span className={styles.icon} aria-hidden="true">
                    {getTypeIcon(currentBanner.type)}
                </span>
                <div className={styles.textGroup}>
                    {currentBanner.title && (
                        <span className={styles.title}>{currentBanner.title}</span>
                    )}
                    <span className={styles.message}>{currentBanner.message}</span>
                </div>
            </div>

            {/* Pagination s'il y a plusieurs bandeaux pour l'écran courant */}
            {matchingBanners.length > 1 && (
                <div className={styles.pagination} aria-label="Navigation des bandeaux">
                    <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={handlePrev}
                        aria-label="Bandeau précédent"
                        title="Bandeau précédent"
                    >
                        ‹
                    </button>
                    <span className={styles.pageIndicator}>
                        {safeIndex + 1} / {matchingBanners.length}
                    </span>
                    <button
                        type="button"
                        className={styles.pageBtn}
                        onClick={handleNext}
                        aria-label="Bandeau suivant"
                        title="Bandeau suivant"
                    >
                        ›
                    </button>
                </div>
            )}
        </div>
    );
}

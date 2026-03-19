'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import styles from './LicenseBanner.module.css';

interface LicenseStatus {
    validated: boolean;
    daysLeft: number | null;
    blocked: boolean;
}

const DRIVER_ROLES = ['CHVL', 'CHVPSP'];

export default function LicenseBanner() {
    const { data: session, status } = useSession();
    const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);

    const roles = (session?.user?.roles || []) as string[];
    const isDriver = roles.some(r => DRIVER_ROLES.includes(r));

    useEffect(() => {
        if (status !== 'authenticated' || !isDriver) return;

        const fetchStatus = () => {
            fetch('/api/me/license-check')
                .then(res => res.ok ? res.json() : null)
                .then((data: LicenseStatus | null) => { if (data) setLicenseStatus(data); })
                .catch(console.error);
        };

        // Immediately mark as validated when papers are validated in the same tab
        const onValidated = () => setLicenseStatus({ validated: true, daysLeft: null, blocked: false });

        // Re-fetch when tab becomes visible (handles cross-session validation by RESPO/ADMIN)
        const onVisibility = () => { if (!document.hidden) fetchStatus(); };

        fetchStatus();
        window.addEventListener('license-validated', onValidated);
        document.addEventListener('visibilitychange', onVisibility);
        return () => {
            window.removeEventListener('license-validated', onValidated);
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [status, isDriver]);

    if (!isDriver || !licenseStatus || licenseStatus.validated) return null;

    const { daysLeft, blocked } = licenseStatus;

    return (
        <div
            className={`${styles.banner} ${blocked ? styles.bannerBlocked : ''}`}
            role="alert"
            aria-live="assertive"
        >
            <span className={styles.icon} aria-hidden="true">
                {blocked ? '🚫' : '⚠️'}
            </span>
            <span className={styles.text}>
                {blocked ? (
                    <>
                        <span className={styles.strong}>Accès bloqué.</span>{' '}
                        Vos papiers n&apos;ont pas été validés dans les délais. Vous ne pouvez plus emprunter de
                        véhicules ni effectuer de réservations. Présentez vos papiers à votre DLUS/DLAS.
                    </>
                ) : (
                    <>
                        <span className={styles.strong}>Validation des papiers requise.</span>{' '}
                        Vos papiers (permis de conduire
                        {roles.includes('CHVPSP') ? ' + attestation préfectorale' : ''}) doivent être présentés à
                        votre DLUS/DLAS ou Bureau local.{' '}
                        {daysLeft !== null ? (
                            <>
                                Il vous reste{' '}
                                <span className={styles.strong}>
                                    {daysLeft} jour{daysLeft > 1 ? 's' : ''}
                                </span>{' '}
                                avant blocage.
                            </>
                        ) : null}
                    </>
                )}
            </span>
        </div>
    );
}

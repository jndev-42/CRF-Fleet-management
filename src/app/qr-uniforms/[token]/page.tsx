'use client';

import { useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import UniformCatalog from '@/components/uniforms/UniformCatalog';
import LaundryList from '@/components/uniforms/LaundryList';
import { useUniformCatalog } from '@/components/uniforms/useUniformCatalog';
import styles from './page.module.css';

/**
 * Page du QR « Uniformes » d'une UL — mobile d'abord, ouverte à tout compte
 * connecté non INACTIF, sans filtre de rôle ni d'UL.
 *
 * Périmètre fermé : emprunter dans le catalogue de l'UL du token et marquer
 * lavées ses pièces sales. Le rendu se fait depuis le bandeau global, au nom de
 * l'emprunteur.
 */
export default function QRUniformsPage() {
    const params = useParams();
    const token = params.token as string;
    const router = useRouter();

    // `encodeURIComponent` : `useParams()` rend le segment DÉCODÉ. Un token
    // forgé (`..%2F..%2F…`) deviendrait sinon une requête same-origin vers un
    // endpoint arbitraire, cookie de session compris (cf. `qr-stock`).
    const base = `/api/qr-uniforms/${encodeURIComponent(token)}`;

    const onUnauthorized = useCallback(() => {
        router.push(`/login?callbackUrl=${encodeURIComponent(`/qr-uniforms/${token}`)}`);
    }, [router, token]);
    const markUrl = useCallback((loanId: string) => `${base}/laundry/${encodeURIComponent(loanId)}`, [base]);

    const { data, loading, error, refresh } = useUniformCatalog(`${base}/catalog`, onUnauthorized);

    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <Image src="/crf-logo.svg" alt="Croix-Rouge française" width={56} height={56} />
                <div className={styles.headerLabel}>Uniformes — Accès QR Code</div>
            </div>

            <div className={styles.container}>
                {loading && <div className={styles.notice} role="status" aria-live="polite">Chargement…</div>}
                {error && <div className={styles.errorBox} role="alert">{error}</div>}

                {!loading && data?.ul && (
                    <>
                        <h1 className={styles.title}>UL {data.ul.name}</h1>
                        <div className={styles.notice}>
                            📲 Accès via QR Code — l&apos;emprunt est enregistré à votre nom. Rendez les pièces
                            depuis le bandeau « Vous détenez… » en haut de page.
                        </div>

                        <h2 className={styles.sectionTitle}>Emprunter</h2>
                        <UniformCatalog items={data.items} submitUrl={`${base}/loans`} onSubmitted={refresh} />

                        <h2 className={styles.sectionTitle}>À laver</h2>
                        <LaundryList listUrl={`${base}/laundry`} markUrl={markUrl} />
                    </>
                )}
            </div>
        </div>
    );
}

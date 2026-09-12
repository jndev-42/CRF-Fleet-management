'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import StockItemRow from './StockItemRow';
import BatchPicker from './BatchPicker';
import CartSummary from './CartSummary';
import type { PendingMovement, QRStock, QRStockItem } from './types';
import styles from './page.module.css';

/**
 * Page publique du QR stock — hors app shell, mobile d'abord.
 *
 * Périmètre volontairement fermé : consulter le stock et déclarer des
 * mouvements, rien d'autre. Aucun chemin de création, de renommage ou de
 * suppression d'article, aucune navigation sortante.
 *
 * Les erreurs s'affichent dans un encart inline, JAMAIS via `alert()` : la page
 * est utilisée debout devant une armoire, une boîte de dialogue native y est
 * hostile et fait perdre le panier de vue.
 */
export default function QRStockPage() {
    const params = useParams();
    const token = params.token as string;
    const router = useRouter();

    const [stock, setStock] = useState<QRStock | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [cart, setCart] = useState<PendingMovement[]>([]);
    const [picking, setPicking] = useState<QRStockItem | null>(null);
    const [done, setDone] = useState<PendingMovement[] | null>(null);

    const fetchAbortRef = useRef<AbortController | null>(null);

    const fetchStock = useCallback(async () => {
        fetchAbortRef.current?.abort();
        const controller = new AbortController();
        fetchAbortRef.current = controller;
        setLoading(true);
        try {
            // `encodeURIComponent` : `useParams()` rend le segment DÉCODÉ. Un lien
            // forgé `/qr-stock/..%2F..%2Finventory%2Fstocks%3F` donnerait un token
            // `../../inventory/stocks?`, que le navigateur normaliserait en une
            // requête same-origin vers un endpoint arbitraire, cookie de session
            // compris. Le `callbackUrl` ci-dessous l'encode déjà.
            const res = await fetch(`/api/qr-stock/${encodeURIComponent(token)}/stock`, { signal: controller.signal });
            if (res.status === 401) {
                router.push(`/login?callbackUrl=${encodeURIComponent(`/qr-stock/${token}`)}`);
                return;
            }
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                setError(data.error || 'Erreur de chargement');
                setStock(null);
                return;
            }
            setError(null);
            setStock(await res.json());
        } catch (e) {
            if (e instanceof Error && e.name === 'AbortError') return;
            setError('Erreur de connexion');
        } finally {
            if (fetchAbortRef.current === controller) setLoading(false);
        }
    }, [token, router]);

    useEffect(() => {
        fetchStock();
        return () => fetchAbortRef.current?.abort();
    }, [fetchStock]);

    function pushMovement(item: QRStockItem, change: number, expiryDate: string | null) {
        setCart(prev => [...prev, {
            key: `${item.id}-${prev.length}-${Date.now()}`,
            itemId: item.id,
            itemName: item.name,
            change,
            expiryDate,
            note: change > 0 ? `Scan QR — ajout (+${change})` : `Scan QR — retrait (${change})`,
        }]);
    }

    function handleAdd(item: QRStockItem) {
        setPicking(item);
    }

    function handlePick(expiryDate: string | null) {
        if (picking) pushMovement(picking, 1, expiryDate);
        setPicking(null);
    }

    function handleSubmitSuccess() {
        const applied = cart;
        setCart([]);
        setDone(applied);
    }

    // ── Écran de succès ──────────────────────────────────────────────────────
    if (done) {
        return (
            <div className={styles.page}>
                <div className={styles.container}>
                    <div className={styles.successBox}>
                        <div className={styles.successIcon}>✅</div>
                        <div className={styles.successTitle}>
                            {done.length} mouvement{done.length > 1 ? 's' : ''} enregistré{done.length > 1 ? 's' : ''}
                        </div>
                        <ul className={styles.successList}>
                            {done.map(m => (
                                <li key={m.key}>
                                    {m.itemName} : {m.change > 0 ? `+${m.change}` : m.change}
                                </li>
                            ))}
                        </ul>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => { setDone(null); fetchStock(); }}
                        >
                            Retour
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Écran principal ──────────────────────────────────────────────────────
    return (
        <div className={styles.page}>
            <div className={styles.header}>
                <Image src="/crf-logo.svg" alt="Croix-Rouge française" width={56} height={56} />
                <div className={styles.headerLabel}>Inventaire — Accès QR Code</div>
            </div>

            <div className={styles.container}>
                {loading && <div className={styles.loading}>Chargement…</div>}

                {error && <div className={styles.errorBox}>{error}</div>}

                {!loading && stock && (
                    <>
                        <h1 className={styles.stockName}>{stock.stock.name}</h1>

                        <div className={styles.scopeNotice}>
                            <span>📲</span>
                            <span>Accès via QR Code — limité à ce stock uniquement.</span>
                        </div>

                        <div className={styles.volatileNotice}>
                            Les mouvements ne sont enregistrés qu&apos;après avoir appuyé sur
                            « Valider ». Si vous quittez cette page avant, ils seront perdus.
                        </div>

                        {stock.items.length === 0 ? (
                            <div className={styles.emptyState}>Ce stock ne contient aucun article.</div>
                        ) : (
                            <div className={styles.itemList}>
                                {stock.items.map(item => (
                                    <StockItemRow
                                        key={item.id}
                                        item={item}
                                        onRemove={i => pushMovement(i, -1, null)}
                                        onAdd={handleAdd}
                                    />
                                ))}
                            </div>
                        )}

                        {cart.length > 0 && (
                            <CartSummary
                                cart={cart}
                                token={token}
                                onCancelOne={key => setCart(prev => prev.filter(m => m.key !== key))}
                                onSuccess={handleSubmitSuccess}
                                onError={setError}
                            />
                        )}

                        {picking && (
                            <BatchPicker
                                item={picking}
                                onClose={() => setPicking(null)}
                                onPick={handlePick}
                            />
                        )}
                    </>
                )}
            </div>
        </div>
    );
}

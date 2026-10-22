"use client"

import { useState, useEffect, useRef, useSyncExternalStore, useId, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, Trash2, X } from 'lucide-react';
import { useUL } from '@/lib/contexts/ULContext';
import { usePush } from '@/components/PushProvider';

type Notification = {
    id: string;
    title: string;
    message: string;
    url?: string;
    isRead: boolean;
    createdAt: string;
};

// Même point de rupture que le reste de l'appli : en dessous, la cloche est dans le menu hamburger.
const MOBILE_QUERY = '(max-width: 768px)';

function subscribeToViewport(onChange: () => void) {
    const media = window.matchMedia(MOBILE_QUERY);
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
}

/** `true` sur petit écran ; `false` au rendu serveur. */
function useIsMobile(): boolean {
    return useSyncExternalStore(
        subscribeToViewport,
        () => window.matchMedia(MOBILE_QUERY).matches,
        () => false,
    );
}

/**
 * @param onNavigate appelé quand un clic sur une notification ouvre une page
 *   (la Navbar s'en sert pour refermer le menu hamburger).
 */
export function NotificationBell({ onNavigate }: { onNavigate?: () => void } = {}) {
    return (
        <Suspense fallback={null}>
            <NotificationBellContent onNavigate={onNavigate} />
        </Suspense>
    );
}

// useSearchParams() below requires a Suspense boundary (Next.js App Router) — the wrapper above provides it.
function NotificationBellContent({ onNavigate }: { onNavigate?: () => void }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const { status: pushStatus, subscribe: pushSubscribe, unsubscribe: pushUnsubscribe, error: pushError, busy: pushBusy } = usePush();
    const [pushBlocked, setPushBlocked] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const isMobile = useIsMobile();
    const titleId = useId();
    const bellButtonRef = useRef<HTMLButtonElement>(null);
    const closeButtonRef = useRef<HTMLButtonElement>(null);
    const router = useRouter();
    const searchParams = useSearchParams();
    const { activeUL } = useUL();

    // Fetch Notifications
    const fetchNotifications = async () => {
        try {
            const res = await fetch('/api/notifications');
            if (res.ok) {
                const data = await res.json();
                setNotifications(data.notifications || []);
            }
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        } finally {
            setIsLoading(false);
        }
    };

    // Fetch on mount or when active UL changes
    useEffect(() => {
        setIsLoading(true);
        fetchNotifications();

        // Optional: Poll every 1 minute
        const intervalId = setInterval(fetchNotifications, 60000);
        return () => clearInterval(intervalId);
    }, [activeUL?.id]);

    // Detect if the user arrived from a push notification click (?fromPush=true)
    // If so, find and delete any in-app notifications matching the current page
    useEffect(() => {
        const fromPush = searchParams.get('fromPush');
        if (fromPush === 'true') {
            const currentPath = window.location.pathname;

            // Wait for notifications to be loaded, then find and delete matching ones
            const cleanup = async () => {
                try {
                    // Fetch fresh notifications to make sure we have the latest
                    const res = await fetch('/api/notifications');
                    if (res.ok) {
                        const data = await res.json();
                        const allNotifs: Notification[] = data.notifications || [];

                        // Find notifications whose URL contains the current page path
                        const matching = allNotifs.filter(n => {
                            if (!n.url) return false;
                            try {
                                const notifUrl = new URL(n.url, window.location.origin);
                                return notifUrl.pathname === currentPath;
                            } catch {
                                return n.url.includes(currentPath);
                            }
                        });

                        // Delete all matching notifications
                        await Promise.all(
                            matching.map(n => fetch(`/api/notifications/${n.id}`, { method: 'DELETE' }))
                        );

                        // Update local state
                        const matchingIds = new Set(matching.map(n => n.id));
                        setNotifications(prev => prev.filter(n => !matchingIds.has(n.id)));
                    }
                } catch (error) {
                    console.error("Failed to clean up push notifications:", error);
                }

                // Clean the URL by removing fromPush param
                const currentUrl = new URL(window.location.href);
                currentUrl.searchParams.delete('fromPush');
                window.history.replaceState({}, '', currentUrl.toString());
            };

            cleanup();
        }
    }, [searchParams]);

    // Interrupteur visible seulement si le navigateur gère le push et que l'état est connu
    const pushEnabled = pushStatus === 'enabled';
    const showPushToggle = pushStatus === 'enabled' || pushStatus === 'disabled' || pushStatus === 'denied';

    const handlePushToggle = async () => {
        if (pushEnabled) {
            await pushUnsubscribe();
            setPushBlocked(false);
            return;
        }
        if (pushStatus === 'denied') {
            setPushBlocked(true);
            return;
        }
        const ok = await pushSubscribe();
        setPushBlocked(!ok && typeof Notification !== 'undefined' && Notification.permission === 'denied');
    };

    // Handle closing dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            // Sur mobile, seul le fond de la modale ferme, au « click » : fermer dès le « mousedown »
            // laisserait le clic qui suit atterrir sur le menu hamburger situé dessous.
            if (isMobile) return;
            const target = event.target as Node;
            // La modale mobile est rendue hors du conteneur (portail) : un clic dedans n'est pas « dehors ».
            if (dropdownRef.current && !dropdownRef.current.contains(target)
                && !modalRef.current?.contains(target)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef, isMobile]);

    // Échap ferme la cloche ; en modale (mobile), la page derrière ne défile plus.
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setIsOpen(false);
        };
        document.addEventListener('keydown', handleKeyDown);
        let previousOverflow: string | undefined;
        const bellButton = bellButtonRef.current;
        if (isMobile) {
            previousOverflow = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
            // Le focus entre dans la modale, et revient sur la cloche à la fermeture.
            closeButtonRef.current?.focus();
        }
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (previousOverflow !== undefined) {
                document.body.style.overflow = previousOverflow;
                bellButton?.focus();
            }
        };
    }, [isOpen, isMobile]);

    const handleNotificationClick = async (notification: Notification) => {
        // Delete it from DB
        try {
            await fetch(`/api/notifications/${notification.id}`, { method: 'DELETE' });
            setNotifications(prev => prev.filter(n => n.id !== notification.id));
        } catch (error) {
            console.error("Failed to delete notification", error);
        }

        // Close dropdown & Navigate
        setIsOpen(false);
        if (notification.url) {
            onNavigate?.();
            try {
                const urlObj = new URL(notification.url, window.location.origin);
                router.push(urlObj.pathname);
            } catch {
                router.push(notification.url);
            }
        }
    };

    const handleClearAll = async (e: React.MouseEvent) => {
        e.stopPropagation(); // prevent closing if they just want to clear
        try {
            await fetch('/api/notifications', { method: 'DELETE' });
            setNotifications([]);
        } catch (error) {
            console.error("Failed to clear notifications", error);
        }
    };

    const hasUnread = notifications.length > 0;

    // Contenu commun au menu déroulant (desktop) et à la modale (mobile)
    const panel = (
        <>
            <div
                className="notification-header"
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 16px',
                    borderBottom: '1px solid var(--border-primary)',
                    position: 'sticky',
                    top: 0,
                    backgroundColor: 'var(--bg-card)',
                    zIndex: 10,
                    borderRadius: 'var(--radius-md) var(--radius-md) 0 0'
                }}
            >
                <h3 id={titleId} style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Notifications</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {notifications.length > 0 && (
                        <button
                            onClick={handleClearAll}
                            style={{
                                background: 'none',
                                border: 'none',
                                color: 'var(--text-secondary)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                fontSize: '12px'
                            }}
                            title="Tout effacer"
                        >
                            <Trash2 size={14} /> Effacer
                        </button>
                    )}
                    {isMobile && (
                        <button
                            ref={closeButtonRef}
                            onClick={() => setIsOpen(false)}
                            aria-label="Fermer les notifications"
                            style={{ background: 'none', border: 'none', color: 'var(--text-primary)', cursor: 'pointer', padding: 8, display: 'flex' }}
                        >
                            <X size={20} />
                        </button>
                    )}
                </div>
            </div>

            <div className="notification-list">
                {isLoading ? (
                    <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Chargement...
                    </div>
                ) : notifications.length === 0 ? (
                    <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
                        Aucune notification
                    </div>
                ) : (
                    notifications.map(notification => (
                        <div
                            key={notification.id}
                            className="notification-item"
                            onClick={() => handleNotificationClick(notification)}
                            style={{
                                padding: '12px 16px',
                                borderBottom: '1px solid var(--border-primary)',
                                cursor: 'pointer',
                                transition: 'background-color 0.2s',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '4px'
                            }}
                            onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-card-hover)'}
                            onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                            <div style={{ fontWeight: 600, fontSize: '14px' }}>{notification.title}</div>
                            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.4' }}>{notification.message}</div>
                            <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                                {new Date(notification.createdAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* Push notification toggle */}
            {showPushToggle && (
                <div style={{
                    borderTop: '1px solid var(--border-primary)',
                    padding: '10px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    position: 'sticky',
                    bottom: 0,
                    backgroundColor: 'var(--bg-card)',
                    borderRadius: '0 0 var(--radius-md) var(--radius-md)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Notifications push</span>
                        <button
                            onClick={handlePushToggle}
                            disabled={pushBusy}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                background: pushEnabled ? 'var(--crf-red)' : 'var(--bg-secondary)',
                                border: 'none',
                                borderRadius: 20,
                                padding: '4px 12px',
                                cursor: 'pointer',
                                fontSize: 12,
                                fontWeight: 600,
                                color: pushEnabled ? '#fff' : 'var(--text-secondary)',
                                transition: 'background 0.2s',
                            }}
                        >
                            <span style={{
                                width: 8, height: 8, borderRadius: '50%',
                                background: pushEnabled ? '#fff' : 'var(--text-muted)',
                                display: 'inline-block',
                            }} />
                            {pushEnabled ? 'Activées' : 'Désactivées'}
                        </button>
                    </div>
                    {pushBlocked && !pushError && (
                        <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                            Autorisez les notifications dans les paramètres de votre navigateur pour les réactiver.
                        </div>
                    )}
                    {pushError && (
                        <div role="alert" style={{ fontSize: 11, color: 'var(--crf-red)', lineHeight: 1.4 }}>
                            {pushError}
                        </div>
                    )}
                </div>
            )}
        </>
    );

    return (
        <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                ref={bellButtonRef}
                className="btn btn-icon notification-bell-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Notifications"
                aria-expanded={isOpen}
                aria-haspopup={isMobile ? 'dialog' : 'true'}
                style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', color: 'var(--text-primary)' }}
            >
                <Bell size={24} />
                {hasUnread && (
                    <span
                        className="notification-badge"
                        style={{
                            position: 'absolute',
                            top: '4px',
                            right: '6px',
                            backgroundColor: 'var(--crf-red)',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            border: '2px solid var(--bg-secondary)',
                        }}
                    />
                )}
            </button>

            {isOpen && !isMobile && (
                <div
                    className="notification-dropdown"
                    style={{
                        position: 'absolute',
                        top: '100%',
                        right: 0,
                        width: '320px',
                        backgroundColor: 'var(--bg-card)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: 'var(--radius-md)',
                        boxShadow: 'var(--shadow-lg)',
                        zIndex: 1000,
                        maxHeight: '400px',
                        overflowY: 'auto',
                        marginTop: '8px',
                        display: 'flex',
                        flexDirection: 'column'
                    }}
                >
                    {panel}
                </div>
            )}

            {/* Sur mobile, la cloche est dans le menu hamburger : le contenu s'ouvre en modale, hors du menu. */}
            {isOpen && isMobile && createPortal(
                <div
                    className="modal-overlay"
                    style={{ zIndex: 1100 }}
                    onClick={(e) => { if (e.target === e.currentTarget) setIsOpen(false); }}
                >
                    <div
                        ref={modalRef}
                        className="modal notification-modal"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        style={{
                            overflowY: 'auto',
                            // Même fond que l'en-tête et le pied collants du contenu
                            backgroundColor: 'var(--bg-card)',
                            // Hauteur réelle visible (barres du navigateur mobile) et zone de l'indicateur d'accueil iOS
                            maxHeight: '85dvh',
                            paddingBottom: 'env(safe-area-inset-bottom)',
                        }}
                    >
                        {panel}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}

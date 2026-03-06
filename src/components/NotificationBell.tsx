"use client"

import { useState, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bell, Trash2 } from 'lucide-react';

type Notification = {
    id: string;
    title: string;
    message: string;
    url?: string;
    isRead: boolean;
    createdAt: string;
};

export function NotificationBell() {
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [pushEnabled, setPushEnabled] = useState<boolean | null>(null);
    const [pushBlocked, setPushBlocked] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();
    const searchParams = useSearchParams();

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

    // Initial Fetch
    useEffect(() => {
        fetchNotifications();

        // Optional: Poll every 1 minute
        const intervalId = setInterval(fetchNotifications, 60000);
        return () => clearInterval(intervalId);
    }, []);

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

    // Sync push opt-in state when dropdown opens
    useEffect(() => {
        if (!isOpen) return;
        const os = (window as any).OneSignal;
        if (os?.User?.PushSubscription) {
            setPushEnabled(!!os.User.PushSubscription.optedIn);
        }
    }, [isOpen]);

    const handlePushToggle = async () => {
        const os = (window as any).OneSignal;
        if (!os?.User?.PushSubscription) return;

        if (pushEnabled) {
            await os.User.PushSubscription.optOut();
        } else {
            if (typeof Notification !== 'undefined' && Notification.permission === 'denied') {
                setPushBlocked(true);
                return;
            }
            await os.User.PushSubscription.optIn();
        }
        setPushBlocked(false);
        setPushEnabled(!!os.User.PushSubscription.optedIn);
    };

    // Handle closing dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, [dropdownRef]);

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

    return (
        <div className="notification-bell-container" ref={dropdownRef} style={{ position: 'relative' }}>
            <button
                className="btn btn-icon notification-bell-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Notifications"
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

            {isOpen && (
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
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Notifications</h3>
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
                    {pushEnabled !== null && (
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
                            {pushBlocked && (
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                                    Autorisez les notifications dans les paramètres de votre navigateur pour les réactiver.
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

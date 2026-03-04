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

    // Check for `notifyId` in URL parameters (push notification click)
    useEffect(() => {
        const notifyId = searchParams.get('notifyId');
        if (notifyId) {
            // Delete the notification from DB since user clicked the push
            fetch(`/api/notifications/${notifyId}`, { method: 'DELETE' })
                .then(() => {
                    // Remove from local state
                    setNotifications(prev => prev.filter(n => n.id !== notifyId));
                    // Remove from URL without reloading
                    const currentUrl = new URL(window.location.href);
                    currentUrl.searchParams.delete('notifyId');
                    window.history.replaceState({}, '', currentUrl.toString());
                })
                .catch(console.error);
        }
    }, [searchParams]);

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
            // Reconstruct URL without the notifyId parameter to keep it clean
            try {
                const urlObj = new URL(notification.url, window.location.origin);
                urlObj.searchParams.delete('notifyId');
                router.push(urlObj.pathname + urlObj.search);
            } catch (e) {
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
                style={{ position: 'relative', background: 'transparent', border: 'none', cursor: 'pointer', padding: '8px', color: 'var(--text-color)' }}
            >
                <Bell size={24} />
                {hasUnread && (
                    <span
                        className="notification-badge"
                        style={{
                            position: 'absolute',
                            top: '4px',
                            right: '6px',
                            backgroundColor: 'red',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            border: '2px solid var(--bg-color)',
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
                        backgroundColor: 'var(--bg-color)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
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
                            borderBottom: '1px solid var(--border-color)',
                            position: 'sticky',
                            top: 0,
                            backgroundColor: 'var(--bg-color)',
                            zIndex: 10
                        }}
                    >
                        <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>Notifications</h3>
                        {notifications.length > 0 && (
                            <button
                                onClick={handleClearAll}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    color: 'var(--text-color-muted)',
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
                            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-color-muted)' }}>
                                Chargement...
                            </div>
                        ) : notifications.length === 0 ? (
                            <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-color-muted)' }}>
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
                                        borderBottom: '1px solid var(--border-color)',
                                        cursor: 'pointer',
                                        transition: 'background-color 0.2s',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '4px'
                                    }}
                                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-hover)'}
                                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                                >
                                    <div style={{ fontWeight: 600, fontSize: '14px' }}>{notification.title}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-color-muted)', lineHeight: '1.4' }}>{notification.message}</div>
                                    <div style={{ fontSize: '11px', color: 'var(--text-color-muted)', marginTop: '4px' }}>
                                        {new Date(notification.createdAt).toLocaleString('fr-FR')}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

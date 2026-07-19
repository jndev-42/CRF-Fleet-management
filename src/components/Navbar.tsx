"use client"

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { User } from 'next-auth';
import { useMenuSettings, MenuVisibility } from '@/lib/contexts/MenuSettingsContext';
import { useUL } from '@/lib/contexts/ULContext';
import { isSuperAdmin, isAdminOrAbove, canAccessAdminPanel, isInactive } from '@/lib/roles';

const isPreview = process.env.NEXT_PUBLIC_APP_ENV === 'preview';

type NavbarProps = {
    user?: User & { roles?: string[] };
};

function canSeeMenu(key: string, visibility: MenuVisibility, userRoles: string[]): boolean {
    if (visibility === 'disabled') return false;
    if (visibility === 'admin_only') return isSuperAdmin(userRoles);
    return true;
}

export default function Navbar({ user }: NavbarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const { getVisibility } = useMenuSettings();
    const { activeUL, availableULs, switchUL, isMultiUL } = useUL();

    const userRoles = user?.roles ?? [];

    const ulLabel = activeUL ? `Unité Locale ${activeUL.name}` : 'Unité Locale';

    return (
        <header className="header" role="banner">
            <a href="#main-content" className="skip-link">Aller au contenu principal</a>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Link href="/" className="header-brand" style={{ gap: '8px' }}>
                    <Image src="/crf-logo.svg" alt="Croix-Rouge Française" className="header-logo" width={40} height={40} />
                    <div className="header-title">Martine</div>
                </Link>
                {/* Badge environnement Preview */}
                {isPreview && (
                    <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        padding: '2px 9px',
                        borderRadius: 99,
                        fontSize: 11,
                        fontWeight: 700,
                        letterSpacing: '0.07em',
                        textTransform: 'uppercase',
                        background: 'rgba(234, 179, 8, 0.18)',
                        color: '#ca8a04',
                        border: '1px solid rgba(234, 179, 8, 0.4)',
                        flexShrink: 0,
                        userSelect: 'none',
                    }}>
                        Preview
                    </span>
                )}
                {isMultiUL ? (
                    <div style={{ display: 'flex', alignItems: 'center', alignSelf: 'center', marginTop: '2px' }}>
                        <select
                            className="ul-switcher"
                            value={activeUL?.id ?? ''}
                            onChange={e => switchUL(e.target.value)}
                            aria-label="Changer d'Unité Locale"
                        >
                            {availableULs.map(ul => (
                                <option key={ul.id} value={ul.id}>
                                    UL {ul.name}
                                </option>
                            ))}
                        </select>
                    </div>
                ) : (
                    <div className="header-subtitle" style={{ alignSelf: 'center', marginTop: '2px', opacity: 0.85 }}>
                        {ulLabel}
                    </div>
                )}
            </div>

            {user && (
                <>
                    {/* Burger button */}
                    <button
                        className="burger-btn"
                        onClick={() => setIsOpen(!isOpen)}
                        aria-label="Ouvrir le menu de navigation"
                        aria-expanded={isOpen}
                        aria-controls="mobile-nav"
                    >
                        {isOpen ? (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h18M3 6h18M3 18h18" />
                            </svg>
                        )}
                    </button>

                    {/* Navigation overlay/menu */}
                    <div className={`nav-overlay ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(false)} aria-hidden="true" />
                    <nav
                        id="mobile-nav"
                        className={`header-nav ${isOpen ? 'open' : ''}`}
                        role="navigation"
                        aria-label="Navigation principale"
                        aria-hidden={!isOpen}
                    >
                        <div className="nav-header-mobile">
                            <span className="nav-header-title">Menu</span>
                            <button className="burger-close" onClick={() => setIsOpen(false)}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <Link href="/" className={`nav-link${pathname === '/' ? ' active' : ''}`} data-tour="nav-dashboard" onClick={() => setIsOpen(false)} aria-current={pathname === '/' ? 'page' : undefined}>Dashboard</Link>
                        <Link href="/vehicles" className={`nav-link${pathname === '/vehicles' ? ' active' : ''}`} data-tour="nav-vehicles" onClick={() => setIsOpen(false)} aria-current={pathname === '/vehicles' ? 'page' : undefined}>Véhicules</Link>
                        {!isInactive(userRoles) && canSeeMenu('stats', getVisibility('stats'), userRoles) && (
                            <Link href="/stats" className={`nav-link${pathname === '/stats' ? ' active' : ''}`} data-tour="nav-stats" onClick={() => setIsOpen(false)} aria-current={pathname === '/stats' ? 'page' : undefined}>Statistiques</Link>
                        )}
                        {(isAdminOrAbove(userRoles) || canAccessAdminPanel(userRoles)) && canSeeMenu('inventory', getVisibility('inventory'), userRoles) && (
                            <Link href="/inventory" className={`nav-link${pathname === '/inventory' ? ' active' : ''}`} data-tour="nav-inventory" onClick={() => setIsOpen(false)} aria-current={pathname === '/inventory' ? 'page' : undefined}>Inventaire</Link>
                        )}
                        {(isAdminOrAbove(userRoles) || canAccessAdminPanel(userRoles) || userRoles.includes('CI/RPAPS')) && canSeeMenu('missions', getVisibility('missions'), userRoles) && (
                            <Link href="/missions" className={`nav-link${pathname.startsWith('/missions') ? ' active' : ''}`} data-tour="nav-missions" onClick={() => setIsOpen(false)} aria-current={pathname.startsWith('/missions') ? 'page' : undefined}>Missions</Link>
                        )}
                        {canAccessAdminPanel(userRoles) && (
                            <Link href="/users" className={`nav-link${pathname === '/users' ? ' active' : ''}`} data-tour="nav-admin" onClick={() => setIsOpen(false)} aria-current={pathname === '/users' ? 'page' : undefined}>Administration</Link>
                        )}
                        <Link href="/aide" className={`nav-link${pathname === '/aide' ? ' active' : ''}`} data-tour="aide" onClick={() => setIsOpen(false)} aria-current={pathname === '/aide' ? 'page' : undefined}>Aide</Link>

                        <div className="nav-actions">
                            {isAdminOrAbove(userRoles) && (
                                <span data-tour="notifications"><NotificationBell /></span>
                            )}
                            <ThemeToggle />
                            <button
                                className="btn btn-danger nav-logout-btn"
                                title={user.email || ''}
                                aria-label="Se déconnecter"
                                onClick={() => signOut({ callbackUrl: '/login' })}
                            >
                                Déconnexion
                            </button>
                        </div>
                    </nav>
                </>
            )}

            {!user && <div className="nav-actions" style={{ marginLeft: 'auto' }}><ThemeToggle /></div>}
        </header>
    );
}

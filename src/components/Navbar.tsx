"use client"

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { User } from 'next-auth';
import { useModuleSettings } from '@/lib/contexts/ModuleSettingsContext';

type NavbarProps = {
    user?: User & { roles?: string[] };
};

export default function Navbar({ user }: NavbarProps) {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();
    const { canAccess } = useModuleSettings();

    const userRoles = user?.roles ?? [];

    return (
        <header className="header" role="banner">
            <a href="#main-content" className="skip-link">Aller au contenu principal</a>
            <Link href="/" className="header-brand">
                <Image src="/crf-logo.svg" alt="Croix-Rouge Française" className="header-logo" width={40} height={40} />
                <div>
                    <div className="header-title">Gestion de flotte</div>
                    <div className="header-subtitle">Unité Locale Paris 18</div>
                </div>
            </Link>

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
                        <Link href="/" className={`nav-link${pathname === '/' ? ' active' : ''}`} onClick={() => setIsOpen(false)} aria-current={pathname === '/' ? 'page' : undefined}>Dashboard</Link>
                        <Link href="/vehicles" className={`nav-link${pathname === '/vehicles' ? ' active' : ''}`} onClick={() => setIsOpen(false)} aria-current={pathname === '/vehicles' ? 'page' : undefined}>Véhicules</Link>
                        {!userRoles.includes('INACTIF') && canAccess('stats', userRoles) && (
                            <Link href="/stats" className={`nav-link${pathname === '/stats' ? ' active' : ''}`} onClick={() => setIsOpen(false)} aria-current={pathname === '/stats' ? 'page' : undefined}>Statistiques</Link>
                        )}
                        {canAccess('inventory', userRoles) && (
                            <Link href="/inventory" className={`nav-link${pathname === '/inventory' ? ' active' : ''}`} onClick={() => setIsOpen(false)} aria-current={pathname === '/inventory' ? 'page' : undefined}>Inventaire</Link>
                        )}
                        {canAccess('missions', userRoles) && (
                            <Link href="/missions" className={`nav-link${pathname.startsWith('/missions') ? ' active' : ''}`} onClick={() => setIsOpen(false)} aria-current={pathname.startsWith('/missions') ? 'page' : undefined}>Missions</Link>
                        )}
                        {(userRoles.includes('ADMIN') || userRoles.includes('RESPO')) && (
                            <Link href="/users" className={`nav-link${pathname === '/users' ? ' active' : ''}`} onClick={() => setIsOpen(false)} aria-current={pathname === '/users' ? 'page' : undefined}>Administration</Link>
                        )}
                        <Link href="/aide" className={`nav-link${pathname === '/aide' ? ' active' : ''}`} data-tour="aide" onClick={() => setIsOpen(false)} aria-current={pathname === '/aide' ? 'page' : undefined}>Aide</Link>

                        <div className="nav-actions">
                            {(userRoles.includes('ADMIN') || userRoles.includes('RESPO')) && (
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

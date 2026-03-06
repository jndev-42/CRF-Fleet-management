"use client"

import { useState } from 'react';
import { signOut } from 'next-auth/react';
import { ThemeToggle } from "@/components/ThemeToggle";
import { NotificationBell } from "@/components/NotificationBell";
import { User } from 'next-auth';

type NavbarProps = {
    user?: User & { roles?: string[] };
};

export default function Navbar({ user }: NavbarProps) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <header className="header">
            <a href="/" className="header-brand">
                <img src="/crf-logo.svg" alt="Croix-Rouge" className="header-logo" style={{ background: 'transparent', boxShadow: 'none', width: 32, height: 32 }} />
                <div>
                    <div className="header-title">Gestion de flotte</div>
                    <div className="header-subtitle">Unité Locale Paris 18</div>
                </div>
            </a>

            {user && (
                <>
                    {/* Burger button */}
                    <button
                        className="burger-btn"
                        onClick={() => setIsOpen(!isOpen)}
                        aria-label="Menu"
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
                    <div className={`nav-overlay ${isOpen ? 'open' : ''}`} onClick={() => setIsOpen(false)} />
                    <nav className={`header-nav ${isOpen ? 'open' : ''}`}>
                        <div className="nav-header-mobile">
                            <span className="nav-header-title">Menu</span>
                            <button className="burger-close" onClick={() => setIsOpen(false)}>
                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                </svg>
                            </button>
                        </div>
                        <a href="/" className="nav-link" onClick={() => setIsOpen(false)}>Dashboard</a>
                        <a href="/vehicles" className="nav-link" onClick={() => setIsOpen(false)}>Véhicules</a>
                        {user.roles?.includes('ADMIN') && (
                            <a href="/users" className="nav-link" onClick={() => setIsOpen(false)}>Utilisateurs</a>
                        )}
                        <a href="/aide" className="nav-link" data-tour="aide" onClick={() => setIsOpen(false)}>Aide</a>

                        <div className="nav-actions">
                            {(user.roles?.includes('ADMIN') || user.roles?.includes('RESPO')) && (
                                <span data-tour="notifications"><NotificationBell /></span>
                            )}
                            <ThemeToggle />
                            <button
                                className="btn btn-secondary nav-logout-btn"
                                title={user.email || ''}
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

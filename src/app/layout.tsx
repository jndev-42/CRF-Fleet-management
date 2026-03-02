import type { Metadata } from "next";
import "./globals.css";
import { auth, signOut } from "@/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SessionProvider } from "next-auth/react";

export const metadata: Metadata = {
  title: "Gestion de flotte | Croix-Rouge Paris 18",
  description: "Application de gestion de flotte de véhicules pour la Croix-Rouge Française, Unité Locale de Paris 18ème.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="fr">
      <body suppressHydrationWarning>
        <SessionProvider session={session}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <header className="header">
                <a href="/" className="header-brand">
                  <img src="/crf-logo.svg" alt="Croix-Rouge" className="header-logo" style={{ background: 'transparent', boxShadow: 'none', width: 32, height: 32 }} />
                  <div>
                    <div className="header-title">Gestion de flotte</div>
                    <div className="header-subtitle">Unité Locale Paris 18</div>
                  </div>
                </a>
                <nav className="header-nav" style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <a href="/" className="nav-link">Dashboard</a>
                  <a href="/vehicles" className="nav-link">Véhicules</a>
                  {session?.user?.roles?.includes('ADMIN') && (
                    <a href="/users" className="nav-link">Utilisateurs</a>
                  )}
                  <a href="/aide" className="nav-link">Aide</a>
                  {session?.user && (
                    <form action={async () => {
                      "use server";
                      await signOut({ redirectTo: '/login' });
                    }}>
                      <button type="submit" className="btn btn-secondary" style={{ padding: '6px 12px', fontSize: 13 }} title={session.user.email || ''}>
                        Déconnexion
                      </button>
                    </form>
                  )}
                  <ThemeToggle />
                </nav>
              </header>
              <main className="main-content" style={{ flexGrow: 1 }}>
                {children}
              </main>
              <footer style={{
                textAlign: 'center',
                padding: '24px 16px',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                borderTop: '1px solid var(--border-primary)',
                marginTop: 'auto'
              }}>
                © 2026 - Jean-Noël DURAND pour le compte de la Croix Rouge (unité locale de Paris 18). Tous droits réservés.
              </footer>
            </div>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

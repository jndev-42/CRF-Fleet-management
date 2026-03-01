import type { Metadata } from "next";
import "./globals.css";
import { auth, signOut } from "@/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";

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
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="app-container">
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
            <main className="main-content">
              {children}
            </main>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}

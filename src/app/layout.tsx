import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CR Chauffeur — Gestion de Flotte | Croix-Rouge Paris 18",
  description: "Application de gestion de flotte de véhicules pour la Croix-Rouge Française, Unité Locale de Paris 18ème.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <body>
        <div className="app-container">
          <header className="header">
            <a href="/" className="header-brand">
              <div className="header-logo">CRF</div>
              <div>
                <div className="header-title">CR Chauffeur</div>
                <div className="header-subtitle">Unité Locale Paris 18</div>
              </div>
            </a>
            <nav className="header-nav">
              <a href="/" className="nav-link">Dashboard</a>
              <a href="/vehicles" className="nav-link">Véhicules</a>
            </nav>
          </header>
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}

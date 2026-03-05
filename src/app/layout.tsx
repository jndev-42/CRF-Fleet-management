import type { Metadata } from "next";
import "./globals.css";
import { auth, signOut } from "@/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import FooterChangelog from "@/components/FooterChangelog";
import { OneSignalProvider } from "@/components/OneSignalProvider";
import Navbar from "@/components/Navbar";
import GuidedTour from "@/components/GuidedTour";
import KonamiEasterEgg from "@/components/KonamiEasterEgg";

export const metadata: Metadata = {
  title: "Gestion de flotte | Croix-Rouge Paris 18",
  description: "Application de gestion de flotte de véhicules pour la Croix-Rouge Française, Unité Locale de Paris 18ème.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "CR Chauffeur",
    statusBarStyle: "black-translucent",
  },
  themeColor: "#c70000",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();
  const onesignalId = process.env.ONESIGNAL_ID || '';
  const roles = session?.user?.roles || [];

  return (
    <html lang="fr">
      <body suppressHydrationWarning>
        {/*
          NOTE: We do NOT register a custom sw.js here because OneSignal already
          registers its own Service Worker (OneSignalSDKWorker.js) at the root scope.
          Two SWs at the same scope conflict — OneSignal's SW is sufficient for
          PWA install criteria (it has a fetch handler) + push notifications.
        */}
        <OneSignalProvider appId={onesignalId} roles={roles} />
        <SessionProvider session={session}>
          <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
            <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
              <Navbar user={session?.user} />
              <main className="main-content" style={{ flexGrow: 1 }}>
                {children}
              </main>
              {session?.user && <GuidedTour />}
              {session?.user && <KonamiEasterEgg />}
              <footer style={{
                textAlign: 'center',
                padding: '24px 16px',
                fontSize: '12px',
                color: 'var(--text-tertiary)',
                borderTop: '1px solid var(--border-primary)',
                marginTop: 'auto'
              }}>
                <div>© 2026 - Jean-Noël DURAND pour le compte de la Croix Rouge (unité locale de Paris 18). Tous droits réservés.</div>
                <FooterChangelog />
              </footer>
            </div>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}

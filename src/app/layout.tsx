import type { Metadata, Viewport } from "next";
import { Inter } from 'next/font/google';
import "./globals.css";

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-inter',
});
import { auth } from "@/auth";
import { ThemeProvider } from "@/components/ThemeProvider";
import { SessionProvider } from "next-auth/react";
import FooterChangelog from "@/components/FooterChangelog";
import { OneSignalProvider } from "@/components/OneSignalProvider";
import Navbar from "@/components/Navbar";
import DemoBanner from "@/components/DemoBanner";
import GuidedTour from "@/components/GuidedTour";
import KonamiEasterEgg from "@/components/KonamiEasterEgg";
import BugReportButton from "@/components/BugReportButton";
import LicenseBanner from "@/components/LicenseBanner";
import ImpersonationBanner from "@/components/admin/ImpersonationBanner";
import { MenuSettingsProvider } from "@/lib/contexts/MenuSettingsContext";
import { DemoProvider } from "@/lib/contexts/DemoContext";
import { ULProvider } from "@/lib/contexts/ULContext";

export const metadata: Metadata = {
  title: "Martine | Croix-Rouge Paris 18",
  description: "Martine - Application de compte rendus véhicules et missions pour la Croix-Rouge Française, Unité Locale de Paris 18.",
  manifest: "/manifest.json",
  icons: {
    icon: "/crf-logo.svg",
    shortcut: "/crf-logo.svg",
    apple: "/crf-logo.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Martine",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
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
    <html lang="fr" className={inter.variable} data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        <DemoProvider>
          <DemoBanner />
          {/*
            NOTE: We do NOT register a custom sw.js here because OneSignal already
            registers its own Service Worker (OneSignalSDKWorker.js) at the root scope.
            Two SWs at the same scope conflict — OneSignal's SW is sufficient for
            PWA install criteria (it has a fetch handler) + push notifications.
          */}
          <OneSignalProvider appId={onesignalId} availableULs={session?.user?.availableULs || []} globalRoles={roles} />
          <SessionProvider session={session}>
            <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
              <MenuSettingsProvider>
                <ULProvider>
                <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
                  <Navbar user={session?.user} />
                  {session?.user && <ImpersonationBanner />}
                  {session?.user && <LicenseBanner />}
                  <main id="main-content" className="main-content" role="main" style={{ flexGrow: 1 }}>
                    {children}
                  </main>
                  {session?.user && <GuidedTour roles={roles} />}
                  {session?.user && <KonamiEasterEgg />}
                  {session?.user && <BugReportButton />}
                  <footer role="contentinfo" style={{
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
                </ULProvider>
              </MenuSettingsProvider>
            </ThemeProvider>
          </SessionProvider>
        </DemoProvider>
      </body>
    </html>
  );
}

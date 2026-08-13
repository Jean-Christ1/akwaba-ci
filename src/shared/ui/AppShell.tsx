import { Outlet } from "react-router-dom";

import { InstallPrompt } from "@/shared/pwa/InstallPrompt";
import { OfflineBanner } from "@/shared/pwa/OfflineBanner";
import { DesktopHeader } from "./DesktopHeader";
import { SiteFooter } from "./SiteFooter";
import { MobileTabBar } from "./MobileTabBar";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Permet d'atteindre le contenu sans parcourir toute la navigation. */}
      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Aller au contenu
      </a>

      <OfflineBanner />
      <DesktopHeader />

      {/* La marge basse dégage la barre d'onglets et la zone de sécurité des
          téléphones à encoche. */}
      <main
        id="contenu"
        className="flex-1 pb-[calc(env(safe-area-inset-bottom)+5rem)] lg:pb-0"
      >
        <Outlet />
        <SiteFooter />
      </main>

      <MobileTabBar />
      <InstallPrompt />
    </div>
  );
}

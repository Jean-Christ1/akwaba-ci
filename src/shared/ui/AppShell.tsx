import { Outlet } from "react-router-dom";
import { DesktopHeader } from "./DesktopHeader";
import { MobileTabBar } from "./MobileTabBar";

export function AppShell() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <DesktopHeader />
      <main className="flex-1 pb-20 lg:pb-0">
        <Outlet />
      </main>
      <MobileTabBar />
    </div>
  );
}

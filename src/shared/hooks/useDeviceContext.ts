import { useEffect, useState } from "react";

// Hook adaptive : 3 contextes — mobile / tablet / desktop
// Utilisé pour adapter densité, navigation, layout (au-delà du simple responsive CSS)

export type DeviceContext = "mobile" | "tablet" | "desktop";

const TABLET = 768;
const DESKTOP = 1024;

function detect(width: number): DeviceContext {
  if (width >= DESKTOP) return "desktop";
  if (width >= TABLET) return "tablet";
  return "mobile";
}

export function useDeviceContext(): DeviceContext {
  const [ctx, setCtx] = useState<DeviceContext>(() =>
    typeof window === "undefined" ? "desktop" : detect(window.innerWidth)
  );

  useEffect(() => {
    const handler = () => setCtx(detect(window.innerWidth));
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  return ctx;
}

export function useIsMobile() {
  return useDeviceContext() === "mobile";
}

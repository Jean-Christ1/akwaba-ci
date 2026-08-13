import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

/**
 * Bandeau de perte de connexion.
 *
 * Sur un réseau intermittent, un utilisateur doit comprendre immédiatement que
 * l'application n'est pas en panne : c'est la connexion qui manque. Sans ce
 * signal, un échec de chargement se confond avec un écran vide.
 */
export function OfflineBanner() {
  const [horsLigne, setHorsLigne] = useState(
    typeof navigator !== "undefined" ? !navigator.onLine : false
  );

  useEffect(() => {
    const enLigne = () => setHorsLigne(false);
    const perdu = () => setHorsLigne(true);

    window.addEventListener("online", enLigne);
    window.addEventListener("offline", perdu);
    return () => {
      window.removeEventListener("online", enLigne);
      window.removeEventListener("offline", perdu);
    };
  }, []);

  if (!horsLigne) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-destructive px-4 py-2 text-center text-xs font-medium text-destructive-foreground"
    >
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Connexion perdue. Les données affichées peuvent ne plus être à jour.</span>
    </div>
  );
}

export default OfflineBanner;

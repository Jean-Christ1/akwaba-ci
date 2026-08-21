import { logger } from "@/lib/logger";

/**
 * Enregistre le service worker.
 *
 * Il n'est actif qu'en production : en développement, il masquerait les
 * modifications de code derrière son cache. L'échec d'enregistrement n'est
 * jamais bloquant, l'application reste pleinement utilisable sans lui.
 */
export function registerServiceWorker() {
  if (!import.meta.env.PROD) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        logger.debug("[pwa] service worker enregistré", registration.scope);
      })
      .catch((error) => {
        logger.debug("[pwa] enregistrement impossible", error);
      });
  });
}

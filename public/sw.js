/**
 * Service worker Akwaba.
 *
 * Cible : les réseaux mobiles ivoiriens, souvent lents et intermittents.
 *
 * Stratégies retenues :
 *   - la coquille applicative et les ressources versionnées sont servies depuis
 *     le cache en priorité, car leur nom contient une empreinte : elles ne
 *     changent jamais sous un même nom ;
 *   - la navigation tente le réseau puis retombe sur la coquille en cache, ce
 *     qui évite l'écran d'erreur du navigateur hors ligne ;
 *   - les appels de données ne sont jamais mis en cache : afficher un solde ou
 *     l'état d'une course périmés serait pire que d'afficher une erreur.
 */

const VERSION = "akwaba-v1";
const COQUILLE = `${VERSION}-coquille`;
const RESSOURCES = `${VERSION}-ressources`;

// Le strict nécessaire pour afficher quelque chose hors ligne.
const PRECHARGE = ["/", "/manifest.webmanifest", "/icons/icon-192.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(COQUILLE)
      .then((cache) => cache.addAll(PRECHARGE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((noms) =>
        Promise.all(
          noms.filter((n) => !n.startsWith(VERSION)).map((n) => caches.delete(n))
        )
      )
      .then(() => self.clients.claim())
  );
});

/** Une requête de données ne doit jamais être servie depuis le cache. */
function estAppelDeDonnees(url) {
  return (
    url.pathname.startsWith("/rest/v1") ||
    url.pathname.startsWith("/auth/v1") ||
    url.pathname.startsWith("/functions/v1") ||
    url.pathname.startsWith("/storage/v1") ||
    url.pathname.startsWith("/realtime")
  );
}

/** Les ressources produites par le build portent une empreinte dans leur nom. */
function estRessourceVersionnee(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/"))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Supabase et tout appel de données : réseau uniquement.
  if (url.origin !== self.location.origin || estAppelDeDonnees(url)) return;

  // Navigation : réseau d'abord, coquille en secours.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((reponse) => {
          const copie = reponse.clone();
          caches.open(COQUILLE).then((cache) => cache.put("/", copie));
          return reponse;
        })
        .catch(async () => {
          const cache = await caches.open(COQUILLE);
          const secours = await cache.match("/");
          return (
            secours ??
            new Response(
              "<!doctype html><meta charset=utf-8><title>Hors ligne</title>" +
                "<body style=\"font-family:system-ui;padding:2rem;text-align:center\">" +
                "<h1>Vous êtes hors ligne</h1>" +
                "<p>Reconnectez-vous pour retrouver Akwaba.</p></body>",
              { headers: { "Content-Type": "text/html; charset=utf-8" } }
            )
          );
        })
    );
    return;
  }

  // Ressources versionnées : cache d'abord, ce qui rend les visites suivantes
  // quasi instantanées même sur un réseau dégradé.
  if (estRessourceVersionnee(url)) {
    event.respondWith(
      caches.match(request).then(
        (enCache) =>
          enCache ??
          fetch(request).then((reponse) => {
            if (reponse.ok) {
              const copie = reponse.clone();
              caches.open(RESSOURCES).then((cache) => cache.put(request, copie));
            }
            return reponse;
          })
      )
    );
  }
});

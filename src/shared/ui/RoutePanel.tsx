import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { Car, Footprints, Bike, Loader2, ExternalLink, Navigation, RotateCcw, LocateFixed } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OSM_STYLE = {
  version: 8,
  sources: {
    osm: {
      type: "raster",
      tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
      tileSize: 256,
      attribution: "© OpenStreetMap",
    },
  },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
} as never;

type Profile = "driving" | "cycling" | "foot";

const PROFILES: { value: Profile; label: string; icon: typeof Car }[] = [
  { value: "driving", label: "Voiture", icon: Car },
  { value: "cycling", label: "Moto / vélo", icon: Bike },
  { value: "foot", label: "À pied", icon: Footprints },
];

/** Position de l'utilisateur : chaque état appelle un message et une action différents. */
type PositionState = "pending" | "ready" | "refused" | "unsupported";

/** Calcul de l'itinéraire : distinguer l'attente de l'échec évite un écran figé. */
type RouteState = "idle" | "loading" | "ready" | "error";

interface Step {
  instruction: string;
  distance: number;
}

export interface RoutePanelProps {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  /** Hauteur de la carte : la vue intégrée est plus courte que la page dédiée. */
  mapClassName?: string;
  className?: string;
}

/**
 * Itinéraire calculé et affiché à l'intérieur de l'application.
 * Les applications externes (Google Maps, Waze…) restent en secours.
 */
export function RoutePanel({ lat, lng, name, address, mapClassName, className }: RoutePanelProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const originMarkerRef = useRef<Marker | null>(null);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [profile, setProfile] = useState<Profile>("driving");
  const [summary, setSummary] = useState<{ km: number; min: number } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [positionState, setPositionState] = useState<PositionState>("pending");
  const [routeState, setRouteState] = useState<RouteState>("idle");
  // Compteur d'essais : le relancer suffit à rejouer le calcul sans remonter la carte.
  const [attempt, setAttempt] = useState(0);

  const valid = Number.isFinite(lat) && Number.isFinite(lng);

  useEffect(() => {
    if (!containerRef.current || mapRef.current || !valid) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: OSM_STYLE,
      center: [lng, lat],
      zoom: 13,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    new Marker({ color: "#1d6b53" }).setLngLat([lng, lat]).addTo(map);
    // La carte doit se redimensionner quand elle apparaît dans une boîte de dialogue.
    const t = window.setTimeout(() => map.resize(), 120);
    return () => {
      window.clearTimeout(t);
      map.remove();
      mapRef.current = null;
      originMarkerRef.current = null;
    };
  }, [lat, lng, valid]);

  const demanderPosition = useCallback(() => {
    if (!navigator.geolocation) {
      setPositionState("unsupported");
      return;
    }
    setPositionState("pending");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setOrigin([pos.coords.longitude, pos.coords.latitude]);
        setPositionState("ready");
      },
      () => setPositionState("refused"),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    demanderPosition();
  }, [demanderPosition]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin || !valid) return;
    let cancelled = false;
    setRouteState("loading");
    (async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/${profile}/${origin[0]},${origin[1]};${lng},${lat}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`routage indisponible (${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        if (!json.routes?.length) throw new Error("aucun trajet renvoyé");
        const route = json.routes[0];
        setSummary({ km: route.distance / 1000, min: Math.round(route.duration / 60) });
        setSteps(
          (route.legs?.[0]?.steps ?? [])
            .slice(0, 25)
            .map((s: { maneuver: { type: string; modifier?: string }; name: string; distance: number }) => ({
              instruction: `${
                s.maneuver.type === "depart"
                  ? "Départ"
                  : s.maneuver.type === "arrive"
                    ? "Arrivée"
                    : (s.maneuver.modifier ?? "Continuer")
              } ${s.name ? `sur ${s.name}` : ""}`.trim(),
              distance: s.distance,
            }))
        );

        const apply = () => {
          const data = { type: "Feature", properties: {}, geometry: route.geometry } as never;
          const src = map.getSource("route") as maplibregl.GeoJSONSource | undefined;
          if (src) src.setData(data);
          else {
            map.addSource("route", { type: "geojson", data });
            map.addLayer({
              id: "route-line",
              type: "line",
              source: "route",
              paint: { "line-color": "#1d6b53", "line-width": 5, "line-opacity": 0.9 },
              layout: { "line-cap": "round", "line-join": "round" },
            });
          }
          // Un seul repère de départ : le recalcul ne doit pas empiler les marqueurs.
          if (originMarkerRef.current) originMarkerRef.current.setLngLat(origin);
          else originMarkerRef.current = new Marker({ color: "#c08b3e" }).setLngLat(origin).addTo(map);
          const coords: [number, number][] = route.geometry.coordinates;
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 50, duration: 700 });
        };
        if (map.isStyleLoaded()) apply();
        else map.once("load", apply);
        setRouteState("ready");
      } catch {
        if (!cancelled) {
          setSteps([]);
          setSummary(null);
          setRouteState("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, profile, lat, lng, valid, attempt]);

  const externalLinks = useMemo(
    () => [
      { label: "Google Maps", href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
      { label: "Waze", href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` },
      { label: "Apple Plans", href: `https://maps.apple.com/?daddr=${lat},${lng}` },
    ],
    [lat, lng]
  );

  // Phrase unique lue par les lecteurs d'écran : la carte, elle, n'est pas descriptible.
  const annonce = useMemo(() => {
    if (routeState === "ready" && summary) {
      return `Itinéraire vers ${name} : ${summary.min} minutes, ${summary.km.toFixed(1)} kilomètres.`;
    }
    if (routeState === "error") return `Le calcul de l'itinéraire vers ${name} a échoué.`;
    if (positionState === "refused") return "Localisation refusée : la carte montre la destination seule.";
    if (positionState === "unsupported") return "Géolocalisation indisponible sur cet appareil.";
    if (routeState === "loading") return "Calcul de l'itinéraire en cours.";
    return "Recherche de votre position en cours.";
  }, [routeState, positionState, summary, name]);

  if (!valid) {
    return (
      <p className="px-4 py-8 text-center text-sm text-muted-foreground">
        Coordonnées indisponibles pour cette destination.
      </p>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div
        ref={containerRef}
        role="application"
        aria-label={`Carte de l'itinéraire vers ${name}`}
        className={cn(
          "w-full overflow-hidden rounded-xl border border-border",
          // Sur téléphone la carte reste bornée : la distance, la durée et les
          // étapes doivent rester visibles sans faire défiler l'écran.
          mapClassName ?? "h-[34vh] min-h-[190px] max-h-[300px] sm:h-[45vh] sm:max-h-none"
        )}
      />

      <div className="flex items-center gap-2">
        {PROFILES.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => setProfile(value)}
            aria-pressed={profile === value}
            className={cn(
              "flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-medium transition-colors",
              profile === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" /> {label}
          </button>
        ))}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sr-only" role="status" aria-live="polite">
            {annonce}
          </p>
          <div aria-hidden="true">
            {routeState === "ready" && summary ? (
              <p className="text-sm">
                <strong className="font-display text-lg">{summary.min} min</strong>{" "}
                <span className="text-muted-foreground">· {summary.km.toFixed(1)} km</span>
              </p>
            ) : routeState === "error" ? (
              <p className="text-sm text-destructive">Itinéraire indisponible pour le moment.</p>
            ) : positionState === "refused" ? (
              <p className="text-sm text-muted-foreground">
                Sans votre position, seule la destination est affichée.
              </p>
            ) : positionState === "unsupported" ? (
              <p className="text-sm text-muted-foreground">Géolocalisation indisponible sur cet appareil.</p>
            ) : (
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {routeState === "loading" ? "Calcul de l'itinéraire…" : "Localisation en cours…"}
              </p>
            )}
          </div>
          {address && <p className="truncate text-xs text-muted-foreground">{address}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {routeState === "error" && (
            <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
              <RotateCcw className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Réessayer
            </Button>
          )}
          {(positionState === "refused" || positionState === "unsupported") && (
            <Button size="sm" variant="outline" onClick={demanderPosition}>
              <LocateFixed className="mr-1.5 h-4 w-4" aria-hidden="true" />
              Me localiser
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowSteps((v) => !v)}
            aria-expanded={showSteps}
            disabled={steps.length === 0}
          >
            <Navigation className="mr-1.5 h-4 w-4" aria-hidden="true" />
            {showSteps ? "Masquer" : "Étapes"}
          </Button>
        </div>
      </div>

      {showSteps && (
        <ol className="max-h-52 overflow-y-auto rounded-xl border border-border/60 p-3">
          {steps.map((s, i) => (
            <li key={i} className="flex justify-between gap-3 border-b border-border/50 py-1.5 text-sm last:border-0">
              <span>{s.instruction}</span>
              <span className="shrink-0 text-muted-foreground">{Math.round(s.distance)} m</span>
            </li>
          ))}
        </ol>
      )}

      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Ouvrir dans une autre application
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {externalLinks.map((l) => (
            <a
              key={l.label}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              aria-label={`${l.label}, ouverture dans une application externe`}
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
            >
              {l.label} <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

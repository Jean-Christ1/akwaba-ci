import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { Car, Footprints, Bike, Loader2, ExternalLink, Navigation } from "lucide-react";
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
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [profile, setProfile] = useState<Profile>("driving");
  const [summary, setSummary] = useState<{ km: number; min: number } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [loading, setLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

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
    };
  }, [lat, lng, valid]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setGeoError("Géolocalisation indisponible sur cet appareil.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => setOrigin([pos.coords.longitude, pos.coords.latitude]),
      () => setGeoError("Activez la localisation pour calculer l'itinéraire depuis votre position."),
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !origin || !valid) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const url = `https://router.project-osrm.org/route/v1/${profile}/${origin[0]},${origin[1]};${lng},${lat}?overview=full&geometries=geojson&steps=true`;
        const res = await fetch(url);
        const json = await res.json();
        if (cancelled || !json.routes?.length) return;
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
          new Marker({ color: "#c08b3e" }).setLngLat(origin).addTo(map);
          const coords: [number, number][] = route.geometry.coordinates;
          const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
          );
          map.fitBounds(bounds, { padding: 50, duration: 700 });
        };
        if (map.isStyleLoaded()) apply();
        else map.once("load", apply);
      } catch {
        if (!cancelled) setGeoError("Impossible de calculer l'itinéraire pour le moment.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [origin, profile, lat, lng, valid]);

  const externalLinks = useMemo(
    () => [
      { label: "Google Maps", href: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
      { label: "Waze", href: `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` },
      { label: "Apple Plans", href: `https://maps.apple.com/?daddr=${lat},${lng}` },
    ],
    [lat, lng]
  );

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
        className={cn("w-full overflow-hidden rounded-xl border border-border", mapClassName ?? "h-[45vh] min-h-[240px]")}
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

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {loading ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Calcul de l'itinéraire…
            </p>
          ) : summary ? (
            <p className="text-sm">
              <strong className="font-display text-lg">{summary.min} min</strong>{" "}
              <span className="text-muted-foreground">· {summary.km.toFixed(1)} km</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">{geoError ?? "Localisation en cours…"}</p>
          )}
          {address && <p className="truncate text-xs text-muted-foreground">{address}</p>}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => setShowSteps((v) => !v)}
          aria-expanded={showSteps}
          disabled={steps.length === 0}
        >
          <Navigation className="mr-1.5 h-4 w-4" aria-hidden="true" />
          {showSteps ? "Masquer" : "Étapes"}
        </Button>
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

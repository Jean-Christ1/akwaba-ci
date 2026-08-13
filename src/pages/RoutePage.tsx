import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { ArrowLeft, Car, Footprints, Bike, Loader2, ExternalLink, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

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

export default function RoutePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const name = params.get("name") ?? "Destination";
  const address = params.get("addr") ?? "";

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [origin, setOrigin] = useState<[number, number] | null>(null);
  const [profile, setProfile] = useState<Profile>("driving");
  const [summary, setSummary] = useState<{ km: number; min: number } | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
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
    return () => {
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
          (route.legs?.[0]?.steps ?? []).slice(0, 25).map((s: { maneuver: { type: string; modifier?: string }; name: string; distance: number }) => ({
            instruction: `${s.maneuver.type === "depart" ? "Départ" : s.maneuver.type === "arrive" ? "Arrivée" : s.maneuver.modifier ?? "Continuer"} ${s.name ? `sur ${s.name}` : ""}`.trim(),
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
          map.fitBounds(bounds, { padding: 60, duration: 700 });
        };
        if (map.isStyleLoaded()) apply();
        else map.once("load", apply);
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
      { label: "OpenStreetMap", href: `https://www.openstreetmap.org/directions?to=${lat},${lng}` },
    ],
    [lat, lng]
  );

  if (!valid) {
    return (
      <div className="akw-container py-12 text-center">
        <h1 className="font-display text-xl font-semibold">Destination introuvable</h1>
        <Button className="mt-4" onClick={() => navigate(-1)}>Retour</Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <div ref={containerRef} className="h-[calc(100vh-9rem)] w-full lg:h-[calc(100vh-4rem)]" />

      {/* Barre haute */}
      <div className="absolute inset-x-0 top-0 p-3">
        <div className="akw-container flex items-center gap-2">
          <Button size="icon" variant="secondary" onClick={() => navigate(-1)} aria-label="Retour">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1 rounded-full bg-background/95 px-4 py-2 shadow-elevation-1 backdrop-blur">
            <p className="truncate text-sm font-semibold">{name}</p>
            {address && <p className="truncate text-xs text-muted-foreground">{address}</p>}
          </div>
        </div>
      </div>

      {/* Panneau bas */}
      <div className="absolute inset-x-0 bottom-0 p-3">
        <div className="akw-container">
          <div className="rounded-2xl border border-border bg-background/97 p-3 shadow-elevation-2 backdrop-blur">
            <div className="flex items-center gap-2">
              {PROFILES.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => setProfile(value)}
                  className={`flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-xs font-medium transition-colors ${
                    profile === value ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" /> {label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-3">
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
              </div>
              <Sheet>
                <SheetTrigger asChild>
                  <Button size="sm" variant="outline" className="shrink-0">
                    <Navigation className="mr-1.5 h-4 w-4" /> Étapes
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="max-h-[70vh] overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle>Itinéraire vers {name}</SheetTitle>
                  </SheetHeader>
                  <ol className="mt-3 space-y-2">
                    {steps.map((s, i) => (
                      <li key={i} className="flex justify-between gap-3 border-b border-border/60 pb-2 text-sm">
                        <span>{s.instruction}</span>
                        <span className="shrink-0 text-muted-foreground">{Math.round(s.distance)} m</span>
                      </li>
                    ))}
                    {steps.length === 0 && (
                      <li className="text-sm text-muted-foreground">Aucune étape disponible.</li>
                    )}
                  </ol>
                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Ouvrir dans une autre application
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {externalLinks.map((l) => (
                        <a
                          key={l.label}
                          href={l.href}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium"
                        >
                          {l.label} <ExternalLink className="h-3 w-3" />
                        </a>
                      ))}
                    </div>
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

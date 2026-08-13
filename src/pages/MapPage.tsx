import { useEffect, useRef, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
import maplibregl, { Map as MLMap, Marker } from "maplibre-gl";
import { Link } from "react-router-dom";
import { Locate, X, MapPin } from "lucide-react";
import { usePlaces } from "@/modules/places/application/usePlaces";
import type { Place } from "@/modules/places/domain/types";
import { PlaceCard } from "@/modules/places/ui/PlaceCard";

// Adapter MapLibre, substituable (Mapbox, MapTiler, Google) sans toucher la page.
// Fond de carte ouvert, sans clé : aucune dépendance à un service tiers payant.
const FALLBACK_STYLE = {
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
} as unknown as StyleSpecification;

export default function MapPage() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const [selected, setSelected] = useState<Place | null>(null);

  const { data: places, loading } = usePlaces();

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    if (loading) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: FALLBACK_STYLE, // résilient : pas de dépendance à une clé
      center: [-4.0083, 5.348],
      zoom: 11,
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

    places.forEach((p) => {
      const el = document.createElement("button");
      el.className =
        "akw-map-marker flex items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-110";
      el.style.width = "32px";
      el.style.height = "32px";
      el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>`;
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        setSelected(p);
        map.flyTo({ center: [p.coords.lng, p.coords.lat], zoom: 14, duration: 800 });
      });
      new Marker({ element: el }).setLngLat([p.coords.lng, p.coords.lat]).addTo(map);
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [places, loading]);

  const locate = () => {
    if (!navigator.geolocation || !mapRef.current) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapRef.current!.flyTo({
          center: [pos.coords.longitude, pos.coords.latitude],
          zoom: 14,
        });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  return (
    <div className="relative h-[calc(100vh-4rem)] lg:h-[calc(100vh-4rem)]">
      <div ref={containerRef} className="absolute inset-0" />

      {/* Search flottante */}
      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
        <div className="pointer-events-auto akw-card flex w-full max-w-md items-center gap-2 px-4 py-2.5">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <Link to="/explorer" className="flex-1 text-sm text-muted-foreground">
            Chercher sur la carte…
          </Link>
        </div>
      </div>

      {/* FAB localisation */}
      <button
        onClick={locate}
        className="absolute right-4 bottom-32 lg:bottom-6 z-10 flex h-12 w-12 items-center justify-center rounded-full bg-background shadow-elevation-2"
        aria-label="Ma position"
      >
        <Locate className="h-5 w-5 text-primary" />
      </button>

      {/* Bottom sheet sélection */}
      {selected && (
        <div className="absolute inset-x-0 bottom-16 lg:bottom-0 z-20 animate-slide-up px-3 pb-3 lg:px-6 lg:pb-6">
          <div className="akw-card relative mx-auto max-w-2xl p-3">
            <button
              onClick={() => setSelected(null)}
              className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-background/90 backdrop-blur"
              aria-label="Fermer"
            >
              <X className="h-4 w-4" />
            </button>
            <PlaceCard place={selected} variant="compact" />
            <Link
              to={`/lieu/${selected.slug}`}
              className="mt-2 flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Voir la fiche complète
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

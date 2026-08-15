import { useSearchParams, useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RoutePanel } from "@/shared/ui/RoutePanel";

export default function RoutePage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const lat = Number(params.get("lat"));
  const lng = Number(params.get("lng"));
  const name = params.get("name") ?? "Destination";
  const address = params.get("addr") ?? "";

  const valid = Number.isFinite(lat) && Number.isFinite(lng);

  if (!valid) {
    return (
      <div className="akw-container py-12 text-center">
        <h1 className="font-display text-xl font-semibold">Destination introuvable</h1>
        <Button className="mt-4" onClick={() => navigate(-1)}>
          Retour
        </Button>
      </div>
    );
  }

  return (
    <div className="akw-container py-4">
      <div className="mb-3 flex items-center gap-2">
        <Button size="icon" variant="secondary" onClick={() => navigate(-1)} aria-label="Retour">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate font-display text-lg font-semibold">Itinéraire vers {name}</h1>
          {address && <p className="truncate text-xs text-muted-foreground">{address}</p>}
        </div>
      </div>
      <RoutePanel
        lat={lat}
        lng={lng}
        name={name}
        address={address}
        mapClassName="h-[55vh] min-h-[300px]"
      />
    </div>
  );
}

import { useState, type ReactNode } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RoutePanel } from "./RoutePanel";

interface RouteDialogProps {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  children: ReactNode;
}

/**
 * Ouvre l'itinéraire dans une vue intégrée : l'utilisateur reste dans Akwaba,
 * les applications externes ne sont proposées qu'en secours.
 */
export function RouteDialog({ lat, lng, name, address, children }: RouteDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Itinéraire vers {name}</DialogTitle>
        </DialogHeader>
        {/* La carte n'est montée qu'à l'ouverture pour éviter un rendu invisible. */}
        {open && <RoutePanel lat={lat} lng={lng} name={name} address={address} />}
      </DialogContent>
    </Dialog>
  );
}

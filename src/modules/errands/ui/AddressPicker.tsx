import { useEffect, useRef, useState } from "react";
import { Check, Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { rechercherAdresse, type Adresse } from "../infrastructure/geocoding";

interface AddressPickerProps {
  value: string;
  onChange: (value: string) => void;
  /** Appelé lorsqu'une adresse est réellement localisée. */
  onLocated: (adresse: Adresse | null) => void;
  placeholder?: string;
  id?: string;
}

/**
 * Saisie d'adresse avec localisation.
 *
 * La saisie libre reste toujours possible : beaucoup d'adresses ivoiriennes se
 * décrivent par un repère plutôt que par une voie numérotée. Choisir une
 * suggestion ancre simplement la course sur des coordonnées, ce qui rend la
 * distance, et donc le prix, vérifiables.
 */
export function AddressPicker({
  value,
  onChange,
  onLocated,
  placeholder,
  id,
}: AddressPickerProps) {
  const [suggestions, setSuggestions] = useState<Adresse[]>([]);
  const [chargement, setChargement] = useState(false);
  const [ouvert, setOuvert] = useState(false);
  const [localisee, setLocalisee] = useState(false);
  // Le service d'adresses est hébergé chez un tiers sans engagement : sa panne
  // doit être dite, pas déguisée en absence de résultat.
  const [serviceIndisponible, setServiceIndisponible] = useState(false);
  const controleur = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!ouvert || value.trim().length < 3) {
      setSuggestions([]);
      return;
    }

    // Temporisation : on n'interroge pas le service à chaque frappe.
    const minuteur = window.setTimeout(async () => {
      controleur.current?.abort();
      const ctrl = new AbortController();
      controleur.current = ctrl;

      setChargement(true);
      const resultat = await rechercherAdresse(value, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setChargement(false);
      setSuggestions(resultat.adresses);
      setServiceIndisponible(resultat.indisponible);
    }, 500);

    return () => window.clearTimeout(minuteur);
  }, [value, ouvert]);

  const choisir = (adresse: Adresse) => {
    onChange(adresse.label);
    onLocated(adresse);
    setLocalisee(true);
    setSuggestions([]);
    setServiceIndisponible(false);
    setOuvert(false);
  };

  return (
    <div className="relative">
      <div className="relative">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          onChange={(e) => {
            onChange(e.target.value);
            setOuvert(true);
            if (localisee) {
              // L'adresse a été modifiée : les coordonnées ne valent plus.
              setLocalisee(false);
              onLocated(null);
            }
          }}
          onFocus={() => setOuvert(true)}
          className={cn(localisee && "pr-9")}
        />
        {chargement && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
        {localisee && !chargement && (
          <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary" />
        )}
      </div>

      {localisee && (
        <p className="mt-1 text-[11px] text-primary">
          Adresse localisée, le prix est calculé sur la distance réelle.
        </p>
      )}

      {!localisee && serviceIndisponible && !chargement && (
        <p className="mt-1 text-[11px] text-muted-foreground">
          La recherche d'adresses ne répond pas. Décrivez votre adresse librement : la course
          reste publiable, la distance sera simplement celle que vous indiquez.
        </p>
      )}

      {ouvert && suggestions.length > 0 && (
        <ul className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-border bg-card shadow-lg">
          {suggestions.map((s, i) => (
            <li key={`${s.lat}-${s.lng}-${i}`}>
              <button
                type="button"
                onClick={() => choisir(s)}
                className="flex w-full items-start gap-2 px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{s.label}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default AddressPicker;

import { ShoppingBasket, Compass } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Univers } from "./univers";

interface UniverseSwitchProps {
  valeur: Univers;
  onChange: (u: Univers) => void;
  className?: string;
}

/**
 * Bascule entre les deux univers d'Akwaba.
 *
 * L'accueil empilait tout : le service de courses, puis six blocs de
 * découverte à la suite. Le visiteur devait faire défiler longtemps, et les
 * deux métiers se diluaient l'un dans l'autre au lieu de se distinguer.
 *
 * Ils ne s'adressent pourtant pas au même besoin au même moment. On vient soit
 * pour faire faire une course, soit pour chercher où sortir. La bascule rend ce
 * choix explicite et raccourcit chaque page à ce que l'on est venu y chercher.
 *
 * Les courses restent la position par défaut : c'est le service principal, et
 * un visiteur qui ne choisit rien doit tomber dessus.
 */
export function UniverseSwitch({ valeur, onChange, className }: UniverseSwitchProps) {
  const options: { valeur: Univers; label: string; icone: typeof ShoppingBasket }[] = [
    { valeur: "courses", label: "Mes courses", icone: ShoppingBasket },
    { valeur: "decouverte", label: "Découvrir", icone: Compass },
  ];

  return (
    <div
      role="tablist"
      aria-label="Choisir un univers Akwaba"
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-card p-1",
        className
      )}
    >
      {options.map((o) => {
        const actif = valeur === o.valeur;
        const Icone = o.icone;
        return (
          <button
            key={o.valeur}
            type="button"
            role="tab"
            aria-selected={actif}
            onClick={() => onChange(o.valeur)}
            className={cn(
              // Quarante-quatre pixels de haut : en dessous, la cible devient
              // difficile à atteindre au pouce sur un téléphone.
              "inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-medium transition-colors",
              actif
                ? "bg-primary text-primary-foreground shadow-elevation-1"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icone className="h-4 w-4" aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

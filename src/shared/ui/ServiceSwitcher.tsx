import { Link, useLocation } from "react-router-dom";
import { Compass, ShoppingBasket } from "lucide-react";
import { cn } from "@/lib/utils";

const MODES = [
  { key: "discover", to: "/", label: "Découvrir", icon: Compass, match: ["/", "/explorer", "/carte", "/parcours", "/lieu", "/favoris"] },
  { key: "services", to: "/services", label: "Services & Courses", icon: ShoppingBasket, match: ["/services", "/courses"] },
];

export function ServiceSwitcher({ className }: { className?: string }) {
  const { pathname } = useLocation();
  const activeKey =
    MODES.find((m) => m.key !== "discover" && m.match.some((p) => pathname.startsWith(p)))?.key ??
    "discover";

  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-muted/60 p-1", className)}
      role="tablist"
      aria-label="Basculer entre Découvrir et Services"
    >
      {MODES.map(({ key, to, label, icon: Icon }) => {
        const active = activeKey === key;
        return (
          <Link
            key={key}
            to={to}
            role="tab"
            aria-selected={active}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors sm:text-sm",
              active ? "bg-background text-foreground shadow-elevation-1" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
    </div>
  );
}

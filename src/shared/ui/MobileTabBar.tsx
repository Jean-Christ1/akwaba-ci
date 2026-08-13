import { Link, useLocation } from "react-router-dom";
import { Compass, Home, ShoppingBasket, Bike, User } from "lucide-react";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/explorer", label: "Explorer", icon: Compass },
  { to: "/courses/nouvelle", label: "Courses", icon: ShoppingBasket, highlight: true },
  { to: "/services", label: "Services", icon: Bike },
  { to: "/profil", label: "Profil", icon: User },
] as const;

export function MobileTabBar() {
  const { pathname } = useLocation();
  return (
    <nav
      aria-label="Navigation principale"
      className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="flex items-stretch justify-around px-1 pt-1.5">
        {TABS.map((tab) => {
          const { to, label, icon: Icon } = tab;
          const highlight = "highlight" in tab && tab.highlight;
          const active = pathname === to || (to !== "/" && pathname.startsWith(to));
          return (
            <li key={to} className="flex-1">
              <Link
                to={to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Hauteur minimale de 44 px : c'est le seuil en deçà duquel
                  // une cible devient difficile à atteindre au pouce.
                  "flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {highlight ? (
                  <span
                    className={cn(
                      "-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-elevation-2 transition-transform",
                      active && "scale-105"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
                  </span>
                ) : (
                  <Icon
                    className={cn("h-5 w-5 transition-transform", active && "scale-110")}
                    strokeWidth={active ? 2.4 : 1.8}
                    aria-hidden="true"
                  />
                )}
                <span className={cn(highlight && "font-semibold text-primary")}>{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

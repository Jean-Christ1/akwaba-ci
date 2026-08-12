import { Link, NavLink } from "react-router-dom";
import { Search } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Accueil", end: true },
  { to: "/explorer", label: "Explorer" },
  { to: "/carte", label: "Carte" },
  { to: "/parcours", label: "Parcours" },
  { to: "/services", label: "Services" },
  { to: "/favoris", label: "Favoris" },
];

export function DesktopHeader() {
  return (
    <header className="sticky top-0 z-40 hidden border-b border-border/60 bg-background/85 backdrop-blur-xl lg:block">
      <div className="akw-container flex h-16 items-center justify-between gap-8">
        <Link to="/" aria-label="Akwaba — accueil">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                cn(
                  "rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            to="/explorer"
            className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span>Rechercher un lieu, un hôtel…</span>
          </Link>
          <Link
            to="/profil"
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
          >
            Connexion
          </Link>
        </div>
      </div>
    </header>
  );
}

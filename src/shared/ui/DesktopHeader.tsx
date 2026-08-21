import { Link, NavLink } from "react-router-dom";
import { Search, User, ShoppingBasket, Wallet, Bike, Shield, LogOut } from "lucide-react";
import { Logo } from "./Logo";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV = [
  { to: "/", label: "Accueil", end: true },
  { to: "/explorer", label: "Explorer" },
  { to: "/carte", label: "Carte" },
  { to: "/parcours", label: "Parcours" },
  { to: "/services", label: "Services" },
  { to: "/favoris", label: "Favoris" },
];

export function DesktopHeader() {
  const { user, isAdmin, isModerator, signOut } = useAuth();
  const staff = isAdmin || isModerator;

  return (
    <header className="sticky top-0 z-40 hidden border-b border-border/60 bg-background/85 backdrop-blur-xl lg:block">
      <div className="akw-container flex h-16 items-center justify-between gap-8">
        <Link to="/" aria-label="Akwaba, accueil">
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

          {/* Sur poste fixe, il n'existait aucun chemin vers le compte : ni les
              courses, ni le portefeuille, ni le back-office n'étaient
              atteignables une fois connecté. Ce menu est ce chemin. */}
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                className="flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:border-primary/40"
                aria-label="Mon compte"
              >
                <User className="h-4 w-4" aria-hidden="true" />
                <span className="max-w-[12ch] truncate">
                  {user.email?.split("@")[0] ?? "Mon compte"}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
                  {user.email}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/courses" className="flex items-center gap-2">
                    <ShoppingBasket className="h-4 w-4" aria-hidden="true" />
                    Mes courses
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/courses/portefeuille" className="flex items-center gap-2">
                    <Wallet className="h-4 w-4" aria-hidden="true" />
                    Mon portefeuille
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/courses/shopper" className="flex items-center gap-2">
                    <Bike className="h-4 w-4" aria-hidden="true" />
                    Espace shopper
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/profil" className="flex items-center gap-2">
                    <User className="h-4 w-4" aria-hidden="true" />
                    Mon profil
                  </Link>
                </DropdownMenuItem>
                {staff && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex items-center gap-2">
                        <Shield className="h-4 w-4" aria-hidden="true" />
                        Back-office
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => void signOut()} className="flex items-center gap-2">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Link
              to="/auth"
              className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90"
            >
              Connexion
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

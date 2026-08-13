import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Store,
  Users,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { AdminSearch } from "@/modules/admin/AdminSearch";
import { DashboardTab } from "@/modules/admin/DashboardTab";
import { LeadsTab } from "@/modules/admin/LeadsTab";
import { MessagesTab } from "@/modules/admin/MessagesTab";
import { ModerationTab } from "@/modules/admin/ModerationTab";
import { PlacesTab } from "@/modules/admin/PlacesTab";
import { UsersTab } from "@/modules/admin/UsersTab";
import { useAdminData } from "@/modules/admin/useAdminData";

import type { LucideIcon } from "lucide-react";

type View = "dashboard" | "search" | "places" | "leads" | "messages" | "moderation" | "users";

const NAV: { key: View; label: string; icon: LucideIcon; role: "any" | "moderator" | "admin" }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, role: "any" },
  { key: "search", label: "Recherche", icon: Search, role: "moderator" },
  { key: "places", label: "Mes fiches", icon: Store, role: "any" },
  { key: "leads", label: "Demandes", icon: Inbox, role: "any" },
  { key: "messages", label: "Messages", icon: MessageSquare, role: "any" },
  { key: "moderation", label: "Modération", icon: ShieldCheck, role: "moderator" },
  { key: "users", label: "Utilisateurs", icon: Users, role: "admin" },
];

const LIENS_ESPACES: { to: string; label: string; icon: LucideIcon; role: "moderator" | "admin" }[] = [
  { to: "/admin/shoppers", label: "Shoppers", icon: Users, role: "moderator" },
  { to: "/admin/pilotage", label: "Pilotage", icon: LayoutDashboard, role: "moderator" },
  { to: "/admin/litiges", label: "Litiges", icon: ShieldCheck, role: "moderator" },
  { to: "/admin/payouts", label: "Retraits", icon: Inbox, role: "admin" },
  { to: "/admin/parametres", label: "Paramètres", icon: Store, role: "admin" },
];

/**
 * Coquille du back-office.
 *
 * Cet écran ne fait plus que trois choses : garder la porte, présenter la
 * navigation et donner à chaque onglet les données qu'il consomme. Le contenu
 * de chaque onglet vit dans son propre composant, ce qui permet de le lire et
 * de le corriger sans traverser les six autres.
 */
export default function AdminPage() {
  const { user, loading, isPartner, isAdmin, isModerator } = useAuth();
  const [view, setView] = useState<View>("dashboard");

  const data = useAdminData({ enabled: !!user, isAdmin, isModerator });

  if (loading) {
    return <div className="akw-container py-20 text-center text-muted-foreground">Chargement…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isPartner && !isModerator) {
    return (
      <div className="akw-container py-20 text-center">
        <h1 className="font-display text-2xl">Accès réservé</h1>
        <p className="mt-2 text-muted-foreground">Cette zone est réservée aux partenaires Akwaba.</p>
        <Link to="/partner/signup" className="mt-4 inline-block text-primary hover:underline">
          Devenir partenaire →
        </Link>
      </div>
    );
  }

  const autorise = (role: "any" | "moderator" | "admin") =>
    role === "any" || (role === "moderator" && isModerator) || (role === "admin" && isAdmin);

  // Un partenaire ne voit que les demandes de ses propres fiches ; l'équipe voit tout.
  const demandes =
    isAdmin || isModerator
      ? data.leads
      : data.leads.filter((l) => data.places.some((p) => p.id === l.place_id));

  return (
    <div className="akw-container py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit lg:sticky lg:top-20">
          <div className="space-y-1">
            {NAV.filter((n) => autorise(n.role)).map((n) => (
              <button
                key={n.key}
                onClick={() => setView(n.key)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  view === n.key
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-muted/50"
                }`}
              >
                <n.icon className="h-4 w-4" /> {n.label}
              </button>
            ))}

            {/* Espaces dédiés, hors des onglets internes. Ils étaient
                inatteignables : aucun lien n'y menait depuis le back-office. */}
            {(isModerator || isAdmin) && (
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                {LIENS_ESPACES.filter((l) => autorise(l.role)).map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted/50"
                  >
                    <l.icon className="h-4 w-4" /> {l.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </aside>

        <main className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="akw-eyebrow">Back-office</p>
              <h1 className="font-display text-2xl">{NAV.find((n) => n.key === view)?.label}</h1>
            </div>
            {view === "places" && (
              <Link to="/admin/places/new">
                <Button>
                  <Plus className="h-4 w-4" /> Nouvelle fiche
                </Button>
              </Link>
            )}
          </div>

          {view === "dashboard" && <DashboardTab places={data.places} leads={data.leads} />}

          {view === "search" && isModerator && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Retrouvez une course ou un compte dans l'ensemble de la base, à partir du peu qu'un
                appel apporte : un identifiant, un titre approximatif, une ville, une adresse de
                courriel.
              </p>
              <AdminSearch />
            </div>
          )}

          {view === "places" && <PlacesTab places={data.places} loadBusy={data.loadBusy} />}

          {view === "leads" && <LeadsTab leads={demandes} onReload={data.load} />}

          {view === "messages" && <MessagesTab leads={data.leads} />}

          {view === "moderation" && isModerator && (
            <ModerationTab
              pending={data.pending}
              loadBusy={data.loadBusy}
              lastLoadedAt={data.lastLoadedAt}
              onReload={data.load}
            />
          )}

          {view === "users" && isAdmin && <UsersTab users={data.users} onReload={data.load} />}
        </main>
      </div>
    </div>
  );
}

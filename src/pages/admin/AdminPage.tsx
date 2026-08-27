import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import {
  Inbox,
  KeyRound,
  LayoutDashboard,
  MessageSquare,
  Plus,
  Search,
  ShieldCheck,
  Store,
  ShoppingBasket,
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

/**
 * Chaque entree nomme le droit qui l'ouvre, et non le titre de celui qui la
 * regarde. La console se gardait avec deux roles herites : un responsable
 * financier, qui n'etait ni administrateur ni moderateur, n'y voyait rien,
 * alors que la matrice lui accordait les retraits et les baremes.
 *
 * « null » designe ce qui appartient au partenaire lui-meme : ses fiches, ses
 * demandes, ses messages. Ce n'est pas un droit d'exploitation, c'est sa
 * propre porte.
 */
const NAV: { key: View; label: string; icon: LucideIcon; droit: string | null }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, droit: null },
  { key: "search", label: "Recherche", icon: Search, droit: "utilisateurs.lire" },
  { key: "places", label: "Mes fiches", icon: Store, droit: null },
  { key: "leads", label: "Demandes", icon: Inbox, droit: null },
  { key: "messages", label: "Messages", icon: MessageSquare, droit: null },
  { key: "moderation", label: "Modération", icon: ShieldCheck, droit: "lieux.moderer" },
  { key: "users", label: "Utilisateurs", icon: Users, droit: "roles.attribuer" },
];

const LIENS_ESPACES: { to: string; label: string; icon: LucideIcon; droit: string }[] = [
  // Le suivi des courses vient en premier : c'est le seul écran qui dit s'il y
  // a quelque chose à faire maintenant, les autres attendent qu'on les ouvre.
  { to: "/admin/courses", label: "Courses", icon: ShoppingBasket, droit: "courses.lire" },
  { to: "/admin/shoppers", label: "Shoppers", icon: Users, droit: "shoppers.lire" },
  { to: "/admin/pilotage", label: "Pilotage", icon: LayoutDashboard, droit: "exploitation.sante" },
  { to: "/admin/litiges", label: "Litiges", icon: ShieldCheck, droit: "litiges.lire" },
  { to: "/admin/payouts", label: "Retraits", icon: Inbox, droit: "retraits.approuver" },
  { to: "/admin/parametres", label: "Paramètres", icon: Store, droit: "bareme.publier" },
  { to: "/admin/droits", label: "Droits d'accès", icon: KeyRound, droit: "roles.attribuer" },
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
  const { user, loading, isPartner, isAdmin, isModerator, peut, droits } = useAuth();
  // Porter au moins un droit d'exploitation, c'est etre du personnel. Un
  // partenaire n'en porte aucun ; le role herite admin les porte tous. La
  // deduction tient donc sans avoir a enumerer les roles, et un role cree
  // demain sera reconnu sans qu'on y revienne.
  const estPersonnel = droits.length > 0;
  const [view, setView] = useState<View>("dashboard");

  const data = useAdminData({ enabled: !!user, isAdmin, isModerator });

  if (loading) {
    return <div className="akw-container py-20 text-center text-muted-foreground">Chargement…</div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isPartner && !estPersonnel) {
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

  const autorise = (droit: string | null) =>
    droit === null || peut(droit);

  // Un partenaire ne voit que les demandes de ses propres fiches ; l'équipe voit tout.
  const demandes =
    estPersonnel
      ? data.leads
      : data.leads.filter((l) => data.places.some((p) => p.id === l.place_id));

  return (
    <div className="akw-container py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="h-fit lg:sticky lg:top-20">
          <div className="space-y-1">
            {NAV.filter((n) => autorise(n.droit)).map((n) => (
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
            {estPersonnel && (
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                {LIENS_ESPACES.filter((l) => autorise(l.droit)).map((l) => (
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

          {view === "search" && peut("utilisateurs.lire") && (
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

          {view === "moderation" && peut("lieux.moderer") && (
            <ModerationTab
              pending={data.pending}
              loadBusy={data.loadBusy}
              lastLoadedAt={data.lastLoadedAt}
              onReload={data.load}
            />
          )}

          {view === "users" && peut("roles.attribuer") && (
            <UsersTab users={data.users} onReload={data.load} />
          )}
        </main>
      </div>
    </div>
  );
}

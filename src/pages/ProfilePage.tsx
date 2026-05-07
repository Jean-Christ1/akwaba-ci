import { Link } from "react-router-dom";
import { Globe, HelpCircle, LogIn, Settings, Bell, LogOut, ShieldCheck, Inbox } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/shared/ui/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export default function ProfilePage() {
  const { user, signOut, isPartner, isModerator } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("leads")
      .select("*, places(name, slug)")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setLeads(data ?? []));
  }, [user]);

  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card">
        <div className="akw-container py-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="akw-eyebrow mb-2">Profil</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {user ? `Bonjour ${user.user_metadata?.display_name ?? user.email?.split("@")[0]}` : "Votre espace Akwaba"}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-muted-foreground">
              {user ? "Suivez vos demandes, vos favoris et vos préférences." : "Connectez-vous pour synchroniser vos favoris et demandes."}
            </p>
          </div>
          {user ? (
            <Button variant="outline" onClick={signOut}><LogOut className="h-4 w-4" /> Déconnexion</Button>
          ) : (
            <Link to="/auth"><Button><LogIn className="h-4 w-4" /> Se connecter</Button></Link>
          )}
        </div>
      </section>

      <section className="akw-container py-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {user && (
            <div className="space-y-3">
              <p className="akw-eyebrow flex items-center gap-2"><Inbox className="h-3.5 w-3.5" /> Mes demandes</p>
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground akw-card p-5">Aucune demande pour le moment.</p>
              ) : (
                <div className="space-y-2">
                  {leads.map((l) => (
                    <div key={l.id} className="akw-card p-4 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{l.places?.name ?? "Demande générale"}</p>
                        <p className="text-xs text-muted-foreground">{new Date(l.created_at).toLocaleDateString("fr-FR")} · {l.kind}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-primary-soft text-primary font-medium">{l.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(isPartner || isModerator) && (
            <Link to="/admin" className="akw-card-hover flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Espace partenaire</p>
                <p className="text-xs text-muted-foreground">Gérer mes fiches et les demandes</p>
              </div>
              <span className="text-primary text-sm">→</span>
            </Link>
          )}

          <div className="space-y-3">
            <Row icon={Globe} label="Langue" hint="Français" right="FR · EN" />
            <Row icon={Bell} label="Notifications" hint="Recevoir les recommandations contextuelles" />
            <Row icon={Settings} label="Préférences" hint="Standing, budget, ambiance" />
            <Row icon={HelpCircle} label="Aide & support" hint="FAQ, signaler une fiche" />
          </div>
        </div>

        <aside className="akw-card p-6 h-fit">
          <Logo />
          <p className="akw-prose mt-4 text-sm">
            Akwaba est votre compagnon de voyage en Côte d'Ivoire. Tous nos lieux sont sélectionnés
            et vérifiés par une équipe locale.
          </p>
          <Link to="/" className="mt-5 inline-block text-sm font-semibold text-primary hover:underline">
            En savoir plus →
          </Link>
        </aside>
      </section>
    </div>
  );
}

function Row({ icon: Icon, label, hint, right }: { icon: React.ComponentType<{ className?: string }>; label: string; hint: string; right?: string }) {
  return (
    <button className="akw-card-hover flex w-full items-center gap-4 px-5 py-4 text-left">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary"><Icon className="h-4 w-4" /></div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
      {right && <span className="text-xs font-medium text-muted-foreground">{right}</span>}
    </button>
  );
}

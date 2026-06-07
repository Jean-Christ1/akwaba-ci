import { Link } from "react-router-dom";
import { LogIn, LogOut, ShieldCheck, Inbox, Store, User as UserIcon, KeyRound, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Logo } from "@/shared/ui/Logo";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, roles, signOut, isPartner, isModerator, isAdmin } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({ display_name: "", phone: "", locale: "fr" });
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);
  const [myPlaces, setMyPlaces] = useState<any[]>([]);
  const [eventsByPlace, setEventsByPlace] = useState<Record<string, any[]>>({});
  const [openPlaceId, setOpenPlaceId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase.from("leads").select("*, places(name, slug)").eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setLeads(data ?? []));
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
      .then(({ data }) => data && setProfile(data));
    if (isPartner || isAdmin) {
      supabase.from("places").select("id, name, status, city")
        .eq("owner_id", user.id).order("created_at", { ascending: false })
        .then(async ({ data }) => {
          const list = data ?? [];
          setMyPlaces(list);
          if (list.length) {
            const { data: ev } = await supabase.from("place_moderation_events")
              .select("*").in("place_id", list.map((p) => p.id))
              .order("created_at", { ascending: false });
            const grouped: Record<string, any[]> = {};
            (ev ?? []).forEach((e) => {
              (grouped[e.place_id] ??= []).push(e);
            });
            setEventsByPlace(grouped);
          }
        });
    }
  }, [user, isPartner, isAdmin]);

  const saveProfile = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase.from("profiles").update({
      display_name: profile.display_name, phone: profile.phone, locale: profile.locale,
    }).eq("id", user.id);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Profil mis à jour");
  };

  const updatePassword = async () => {
    if (pwd.length < 6) return toast.error("Minimum 6 caractères");
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) return toast.error(error.message);
    setPwd("");
    toast.success("Mot de passe mis à jour");
  };

  if (!user) {
    return (
      <div className="akw-container py-16 text-center max-w-md">
        <h1 className="font-display text-3xl">Votre espace Akwaba</h1>
        <p className="mt-2 text-sm text-muted-foreground">Connectez-vous pour accéder à votre profil.</p>
        <Link to="/auth"><Button className="mt-5"><LogIn className="h-4 w-4" /> Se connecter</Button></Link>
      </div>
    );
  }

  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card">
        <div className="akw-container py-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="akw-eyebrow mb-2">Profil</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Bonjour {profile.display_name || user.email?.split("@")[0]}
            </h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {roles.length === 0 && <Badge variant="secondary">Visiteur</Badge>}
              {isAdmin && <Badge className="bg-primary text-primary-foreground">Administrateur</Badge>}
              {isModerator && !isAdmin && <Badge className="bg-accent text-accent-foreground">Modérateur</Badge>}
              {isPartner && !isAdmin && <Badge variant="outline">Partenaire</Badge>}
              <Badge variant="outline" className="font-mono text-[10px]">{user.id.slice(0, 8)}…</Badge>
            </div>
          </div>
          <Button variant="outline" onClick={signOut}><LogOut className="h-4 w-4" /> Déconnexion</Button>
        </div>
      </section>

      <section className="akw-container py-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Raccourcis rapides */}
          <div className="grid gap-2 sm:grid-cols-2">
            {(isPartner || isModerator) && (
              <Link to="/admin" className="akw-card-hover flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent-foreground">
                  <ShieldCheck className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">Back-office</p>
                  <p className="text-[11px] text-muted-foreground truncate">Fiches, demandes, messages</p>
                </div>
                <span className="text-primary text-sm">→</span>
              </Link>
            )}
            {!isPartner && (
              <Link to="/partner/signup" className="akw-card-hover flex items-center gap-3 px-4 py-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary">
                  <Store className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">Devenir partenaire</p>
                  <p className="text-[11px] text-muted-foreground truncate">Inscrire mon établissement</p>
                </div>
                <span className="text-primary text-sm">→</span>
              </Link>
            )}
          </div>

          {/* Tabs compacts : densité ↑, scroll ↓ */}
          <Tabs defaultValue="account" className="w-full">
            <TabsList className="h-9 w-full justify-start gap-1 overflow-x-auto bg-muted/60 p-1">
              <TabsTrigger value="account" className="h-7 px-3 text-xs"><UserIcon className="h-3.5 w-3.5 mr-1" /> Compte</TabsTrigger>
              <TabsTrigger value="security" className="h-7 px-3 text-xs"><KeyRound className="h-3.5 w-3.5 mr-1" /> Sécurité</TabsTrigger>
              <TabsTrigger value="leads" className="h-7 px-3 text-xs"><Inbox className="h-3.5 w-3.5 mr-1" /> Demandes {leads.length > 0 && <span className="ml-1 text-[10px] text-muted-foreground">({leads.length})</span>}</TabsTrigger>
              {(isPartner || isAdmin) && myPlaces.length > 0 && (
                <TabsTrigger value="moderation" className="h-7 px-3 text-xs"><ShieldCheck className="h-3.5 w-3.5 mr-1" /> Modération</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="account" className="mt-3">
              <Card className="p-5 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5"><Label>Nom d'affichage</Label><Input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} /></div>
                  <div className="space-y-1.5"><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
                  <div className="space-y-1.5 sm:col-span-2"><Label>Téléphone</Label><Input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
                </div>
                <Button onClick={saveProfile} disabled={saving} className="w-fit"><Save className="h-4 w-4" /> {saving ? "…" : "Enregistrer"}</Button>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="mt-3">
              <Card className="p-5 space-y-3">
                <div className="space-y-1.5"><Label>Nouveau mot de passe</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
                <Button variant="outline" onClick={updatePassword} className="w-fit">Mettre à jour le mot de passe</Button>
              </Card>
            </TabsContent>

            <TabsContent value="leads" className="mt-3">
              {leads.length === 0 ? (
                <p className="text-sm text-muted-foreground akw-card p-5">Aucune demande pour le moment.</p>
              ) : (
                <div className="space-y-2">
                  {leads.map((l) => (
                    <div key={l.id} className="akw-card p-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm truncate">{l.places?.name ?? "Demande générale"}</p>
                        <p className="text-[11px] text-muted-foreground">{new Date(l.created_at).toLocaleDateString("fr-FR")} · {l.kind}</p>
                      </div>
                      <span className="text-[11px] px-2 py-1 rounded-full bg-primary-soft text-primary font-medium">{l.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            {(isPartner || isAdmin) && myPlaces.length > 0 && (
              <TabsContent value="moderation" className="mt-3">
                <div className="space-y-2">
                  {myPlaces.map((p) => {
                    const events = eventsByPlace[p.id] ?? [];
                    const last = events[0];
                    const open = openPlaceId === p.id;
                    return (
                      <div key={p.id} className="akw-card p-3">
                        <button
                          onClick={() => setOpenPlaceId(open ? null : p.id)}
                          className="w-full flex items-center justify-between gap-3 text-left">
                          <div className="min-w-0">
                            <p className="font-medium text-sm truncate">{p.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              {p.city} · {p.status}
                              {last && <> · {last.action} ({new Date(last.created_at).toLocaleDateString("fr-FR")})</>}
                            </p>
                          </div>
                          <span className="text-[11px] text-primary">{open ? "Masquer" : `Voir (${events.length})`}</span>
                        </button>
                        {open && (
                          <div className="mt-3 space-y-2 border-t pt-3">
                            {events.length === 0 && <p className="text-xs text-muted-foreground">Aucun événement de modération.</p>}
                            {events.map((e) => (
                              <div key={e.id} className="rounded-md bg-muted/40 p-2">
                                <div className="flex items-center justify-between gap-2">
                                  <Badge variant={e.action === "approved" ? "default" : e.action === "rejected" ? "destructive" : "secondary"}>
                                    {e.action}
                                  </Badge>
                                  <span className="text-[11px] text-muted-foreground">{new Date(e.created_at).toLocaleString("fr-FR")}</span>
                                </div>
                                {e.note && <p className="text-xs mt-2 whitespace-pre-wrap">{e.note}</p>}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </TabsContent>
            )}
          </Tabs>
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

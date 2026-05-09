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
import { toast } from "sonner";

export default function ProfilePage() {
  const { user, roles, signOut, isPartner, isModerator, isAdmin } = useAuth();
  const [leads, setLeads] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>({ display_name: "", phone: "", locale: "fr" });
  const [pwd, setPwd] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from("leads").select("*, places(name, slug)").eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data }) => setLeads(data ?? []));
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
      .then(({ data }) => data && setProfile(data));
  }, [user]);

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

      <section className="akw-container py-10 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {(isPartner || isModerator) && (
            <Link to="/admin" className="akw-card-hover flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-accent-foreground">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Espace partenaire / back-office</p>
                <p className="text-xs text-muted-foreground">Gérer mes fiches, demandes et messages</p>
              </div>
              <span className="text-primary text-sm">→</span>
            </Link>
          )}

          {!isPartner && (
            <Link to="/partner/signup" className="akw-card-hover flex items-center gap-4 px-5 py-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Store className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <p className="font-medium">Devenir partenaire</p>
                <p className="text-xs text-muted-foreground">Inscrire mon établissement sur Akwaba</p>
              </div>
              <span className="text-primary text-sm">→</span>
            </Link>
          )}

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2"><UserIcon className="h-4 w-4 text-primary" /><h2 className="font-medium">Mon compte</h2></div>
            <div className="space-y-1.5"><Label>Nom d'affichage</Label><Input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input value={user.email ?? ""} disabled /></div>
            <div className="space-y-1.5"><Label>Téléphone</Label><Input value={profile.phone ?? ""} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></div>
            <Button onClick={saveProfile} disabled={saving}><Save className="h-4 w-4" /> {saving ? "…" : "Enregistrer"}</Button>
          </Card>

          <Card className="p-5 space-y-4">
            <div className="flex items-center gap-2"><KeyRound className="h-4 w-4 text-primary" /><h2 className="font-medium">Sécurité</h2></div>
            <div className="space-y-1.5"><Label>Nouveau mot de passe</Label><Input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} /></div>
            <Button variant="outline" onClick={updatePassword}>Mettre à jour le mot de passe</Button>
          </Card>

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

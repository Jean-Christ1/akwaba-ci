import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Pencil, Plus, Check, X, LayoutDashboard, Store, Inbox, MessageSquare,
  ShieldCheck, Users, MapPin, TrendingUp,
} from "lucide-react";

type View = "dashboard" | "places" | "leads" | "messages" | "moderation" | "users";

const NAV: { key: View; label: string; icon: any; role?: "any" | "moderator" | "admin" }[] = [
  { key: "dashboard", label: "Tableau de bord", icon: LayoutDashboard, role: "any" },
  { key: "places", label: "Mes fiches", icon: Store, role: "any" },
  { key: "leads", label: "Demandes", icon: Inbox, role: "any" },
  { key: "messages", label: "Messages", icon: MessageSquare, role: "any" },
  { key: "moderation", label: "Modération", icon: ShieldCheck, role: "moderator" },
  { key: "users", label: "Utilisateurs", icon: Users, role: "admin" },
];

export default function AdminPage() {
  const { user, loading, isPartner, isAdmin, isModerator } = useAuth();
  const [view, setView] = useState<View>("dashboard");
  const [places, setPlaces] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [partnerNote, setPartnerNote] = useState("");
  const [searchUid, setSearchUid] = useState("");
  const [modTarget, setModTarget] = useState<{ place: any; action: "approved" | "rejected" } | null>(null);
  const [modNote, setModNote] = useState("");
  const [modBusy, setModBusy] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyPlace, setHistoryPlace] = useState<any>(null);

  const load = async () => {
    const { data: p } = await supabase.from("places").select("*").order("created_at", { ascending: false });
    setPlaces(p ?? []);
    const { data: l } = await supabase.from("leads").select("*, places(name)").order("created_at", { ascending: false });
    setLeads(l ?? []);
    if (isModerator) {
      const { data: pend } = await supabase.from("places").select("*").eq("status", "pending");
      setPending(pend ?? []);
    }
    if (isAdmin) {
      const { data: ur } = await supabase.from("user_roles").select("*, profiles(display_name)").order("created_at", { ascending: false });
      setUsers(ur ?? []);
    }
  };

  useEffect(() => { if (user) load(); /* eslint-disable-next-line */ }, [user, isAdmin, isModerator]);

  const stats = useMemo(() => ({
    total: places.length,
    published: places.filter((p) => p.status === "published").length,
    pending: places.filter((p) => p.status === "pending").length,
    leadsNew: leads.filter((l) => l.status === "new").length,
  }), [places, leads]);

  if (loading) return <div className="akw-container py-20 text-center text-muted-foreground">Chargement…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isPartner && !isModerator) {
    return (
      <div className="akw-container py-20 text-center">
        <h1 className="font-display text-2xl">Accès réservé</h1>
        <p className="mt-2 text-muted-foreground">Cette zone est réservée aux partenaires Akwaba.</p>
        <Link to="/partner/signup" className="mt-4 inline-block text-primary hover:underline">Devenir partenaire →</Link>
      </div>
    );
  }

  const updatePlaceStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("places").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour"); load();
  };
  const submitModeration = async () => {
    if (!modTarget) return;
    setModBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("moderate-place", {
        body: { place_id: modTarget.place.id, action: modTarget.action, note: modNote.trim() || null },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(modTarget.action === "approved" ? "Fiche publiée et partenaire notifié" : "Fiche refusée et partenaire notifié");
      setModTarget(null); setModNote(""); load();
    } catch (e: any) {
      toast.error(e.message ?? "Erreur");
    } finally { setModBusy(false); }
  };
  const openHistory = async (place: any) => {
    setHistoryPlace(place);
    const { data } = await supabase
      .from("place_moderation_events")
      .select("*")
      .eq("place_id", place.id)
      .order("created_at", { ascending: false });
    setHistory(data ?? []);
  };
  const updateLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("leads").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lead mis à jour"); load();
  };
  const saveNote = async () => {
    if (!selectedLead) return;
    const { error } = await supabase.from("leads").update({ partner_note: partnerNote }).eq("id", selectedLead.id);
    if (error) return toast.error(error.message);
    toast.success("Note enregistrée"); load();
  };
  const promote = async (uid: string, role: "partner" | "moderator" | "admin") => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) return toast.error(error.message);
    toast.success("Rôle attribué"); load();
  };
  const revoke = async (id: string) => {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Rôle révoqué"); load();
  };

  const myLeads = isAdmin || isModerator ? leads : leads.filter((l) => places.some((p) => p.id === l.place_id));
  const messages = leads.filter((l) => l.partner_note);

  return (
    <div className="akw-container py-6">
      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <aside className="lg:sticky lg:top-20 h-fit">
          <div className="space-y-1">
            {NAV.filter((n) => n.role === "any" || (n.role === "moderator" && isModerator) || (n.role === "admin" && isAdmin)).map((n) => (
              <button key={n.key} onClick={() => setView(n.key)}
                className={`w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition ${
                  view === n.key ? "bg-primary text-primary-foreground" : "hover:bg-muted/50 text-foreground"
                }`}>
                <n.icon className="h-4 w-4" /> {n.label}
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-5 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="akw-eyebrow">Back-office</p>
              <h1 className="font-display text-2xl">{NAV.find((n) => n.key === view)?.label}</h1>
            </div>
            {view === "places" && (
              <Link to="/admin/places/new"><Button><Plus className="h-4 w-4" /> Nouvelle fiche</Button></Link>
            )}
          </div>

          {view === "dashboard" && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Kpi icon={Store} label="Mes fiches" value={stats.total} hint="toutes statuts" />
              <Kpi icon={Check} label="Publiées" value={stats.published} hint="visibles" />
              <Kpi icon={MapPin} label="En attente" value={stats.pending} hint="modération" />
              <Kpi icon={TrendingUp} label="Demandes nouvelles" value={stats.leadsNew} hint="à traiter" />
            </div>
          )}

          {view === "places" && (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Nom</TableHead><TableHead>Type</TableHead><TableHead>Ville</TableHead>
                  <TableHead>Statut</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {places.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell>{p.type}</TableCell>
                      <TableCell>{p.city}</TableCell>
                      <TableCell><StatusBadge status={p.status} /></TableCell>
                      <TableCell className="text-right">
                        <Link to={`/admin/places/${p.id}`}><Button variant="ghost" size="sm"><Pencil className="h-4 w-4" /></Button></Link>
                      </TableCell>
                    </TableRow>
                  ))}
                  {places.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aucune fiche.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          )}

          {view === "leads" && (
            <Card className="p-0 overflow-hidden">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>Date</TableHead><TableHead>Lieu</TableHead><TableHead>Contact</TableHead>
                  <TableHead>Type</TableHead><TableHead>Statut</TableHead><TableHead></TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {myLeads.map((l) => (
                    <TableRow key={l.id} className="cursor-pointer" onClick={() => { setSelectedLead(l); setPartnerNote(l.partner_note ?? ""); }}>
                      <TableCell className="text-xs">{new Date(l.created_at).toLocaleDateString("fr-FR")}</TableCell>
                      <TableCell>{l.places?.name ?? "—"}</TableCell>
                      <TableCell><div className="text-sm">{l.full_name}</div><div className="text-xs text-muted-foreground">{l.email}</div></TableCell>
                      <TableCell>{l.kind}</TableCell>
                      <TableCell><StatusBadge status={l.status} /></TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <select value={l.status} onChange={(e) => updateLeadStatus(l.id, e.target.value)} className="text-xs border rounded px-2 py-1 bg-background">
                          <option value="new">Nouveau</option><option value="in_review">En cours</option>
                          <option value="contacted">Contacté</option><option value="closed">Clôturé</option>
                        </select>
                      </TableCell>
                    </TableRow>
                  ))}
                  {myLeads.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucune demande.</TableCell></TableRow>}
                </TableBody>
              </Table>
            </Card>
          )}

          {view === "messages" && (
            <div className="space-y-3">
              {messages.length === 0 && <p className="text-center text-muted-foreground py-8">Aucun message.</p>}
              {messages.map((l) => (
                <Card key={l.id} className="p-4">
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>{l.full_name} · {l.places?.name}</span>
                    <span>{new Date(l.updated_at).toLocaleDateString("fr-FR")}</span>
                  </div>
                  <p className="text-sm">{l.partner_note}</p>
                </Card>
              ))}
            </div>
          )}

          {view === "moderation" && isModerator && (
            <div className="space-y-3">
              {pending.map((p) => (
                <Card key={p.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.city} · {p.type} · {p.address}</p>
                    <p className="text-xs mt-1 line-clamp-2">{p.description}</p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Link to={`/admin/places/${p.id}`}><Button size="sm" variant="ghost"><Pencil className="h-4 w-4" /></Button></Link>
                    <Button size="sm" variant="outline" onClick={() => updatePlaceStatus(p.id, "rejected")}><X className="h-4 w-4" /> Refuser</Button>
                    <Button size="sm" onClick={() => updatePlaceStatus(p.id, "published")}><Check className="h-4 w-4" /> Publier</Button>
                  </div>
                </Card>
              ))}
              {pending.length === 0 && <p className="text-center text-muted-foreground py-8">File vide.</p>}
            </div>
          )}

          {view === "users" && isAdmin && (
            <div className="space-y-4">
              <Card className="p-4 space-y-3">
                <p className="text-sm font-medium">Promouvoir un utilisateur</p>
                <div className="flex gap-2 flex-wrap">
                  <Input value={searchUid} onChange={(e) => setSearchUid(e.target.value)} placeholder="User ID (uuid)" className="flex-1 min-w-[240px]" />
                  <Button variant="outline" onClick={() => searchUid && promote(searchUid, "partner")}>+ Partner</Button>
                  <Button variant="outline" onClick={() => searchUid && promote(searchUid, "moderator")}>+ Moderator</Button>
                  <Button onClick={() => searchUid && promote(searchUid, "admin")}>+ Admin</Button>
                </div>
              </Card>
              <Card className="p-0 overflow-hidden">
                <Table>
                  <TableHeader><TableRow><TableHead>User ID</TableHead><TableHead>Nom</TableHead><TableHead>Rôle</TableHead><TableHead></TableHead></TableRow></TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="text-xs font-mono">{u.user_id.slice(0, 8)}…</TableCell>
                        <TableCell>{u.profiles?.display_name ?? "—"}</TableCell>
                        <TableCell><Badge>{u.role}</Badge></TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => revoke(u.id)}><X className="h-4 w-4" /> Révoquer</Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          )}
        </main>
      </div>

      <Sheet open={!!selectedLead} onOpenChange={(o) => !o && setSelectedLead(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {selectedLead && (
            <>
              <SheetHeader><SheetTitle>Demande #{selectedLead.id.slice(0, 8)}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3 text-sm">
                <Row k="Lieu" v={selectedLead.places?.name ?? "—"} />
                <Row k="Contact" v={`${selectedLead.full_name} · ${selectedLead.email}`} />
                {selectedLead.phone && <Row k="Téléphone" v={selectedLead.phone} />}
                <Row k="Type" v={selectedLead.kind} />
                {selectedLead.party_size && <Row k="Personnes" v={selectedLead.party_size} />}
                {selectedLead.date_from && <Row k="Dates" v={`${selectedLead.date_from} → ${selectedLead.date_to ?? "?"}`} />}
                {selectedLead.budget && <Row k="Budget" v={selectedLead.budget} />}
                <div>
                  <p className="text-muted-foreground">Message</p>
                  <p className="mt-1">{selectedLead.message}</p>
                </div>
                <div className="space-y-2 pt-3 border-t">
                  <p className="font-medium">Note partenaire</p>
                  <Textarea rows={4} value={partnerNote} onChange={(e) => setPartnerNote(e.target.value)} />
                  <Button onClick={saveNote} size="sm">Enregistrer</Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: any; label: string; value: number; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <p className="font-display text-3xl mt-2">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: any }) {
  return <div className="flex justify-between gap-3"><span className="text-muted-foreground">{k}</span><span className="font-medium text-right">{v}</span></div>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground", pending: "bg-accent-soft text-accent-foreground",
    published: "bg-success/15 text-success", rejected: "bg-destructive/15 text-destructive",
    new: "bg-primary-soft text-primary", in_review: "bg-accent-soft text-accent-foreground",
    contacted: "bg-success/15 text-success", closed: "bg-muted text-muted-foreground",
  };
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

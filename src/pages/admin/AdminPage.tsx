import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Pencil, Plus, Check, X } from "lucide-react";

type Place = any;
type Lead = any;

export default function AdminPage() {
  const { user, loading, isPartner, isAdmin, isModerator } = useAuth();
  const [places, setPlaces] = useState<Place[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [pending, setPending] = useState<Place[]>([]);
  const [users, setUsers] = useState<any[]>([]);

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

  useEffect(() => {
    if (user) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isAdmin, isModerator]);

  if (loading) return <div className="akw-container py-20 text-center text-muted-foreground">Chargement…</div>;
  if (!user) return <Navigate to="/auth" replace />;
  if (!isPartner && !isModerator) {
    return (
      <div className="akw-container py-20 text-center">
        <h1 className="font-display text-2xl">Accès réservé</h1>
        <p className="mt-2 text-muted-foreground">Cette zone est réservée aux partenaires Akwaba.</p>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">Retour à l'accueil</Link>
      </div>
    );
  }

  const updatePlaceStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("places").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Statut mis à jour");
    load();
  };

  const updateLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("leads").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Lead mis à jour");
    load();
  };

  const promote = async (uid: string, role: "partner" | "moderator" | "admin") => {
    const { error } = await supabase.from("user_roles").insert({ user_id: uid, role });
    if (error) return toast.error(error.message);
    toast.success("Rôle attribué");
    load();
  };

  return (
    <div className="akw-container py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="akw-eyebrow">Back-office</p>
          <h1 className="font-display text-3xl">Espace partenaire</h1>
        </div>
        <Link to="/admin/places/new"><Button><Plus className="h-4 w-4" /> Nouvelle fiche</Button></Link>
      </div>

      <Tabs defaultValue="places">
        <TabsList>
          <TabsTrigger value="places">Mes fiches</TabsTrigger>
          <TabsTrigger value="leads">Demandes</TabsTrigger>
          {isModerator && <TabsTrigger value="moderation">Modération ({pending.length})</TabsTrigger>}
          {isAdmin && <TabsTrigger value="users">Utilisateurs</TabsTrigger>}
        </TabsList>

        <TabsContent value="places">
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
                {places.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aucune fiche pour le moment.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="leads">
          <Card className="p-0 overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Lieu</TableHead><TableHead>Contact</TableHead>
                <TableHead>Type</TableHead><TableHead>Statut</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {leads.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-xs">{new Date(l.created_at).toLocaleDateString("fr-FR")}</TableCell>
                    <TableCell>{l.places?.name ?? "—"}</TableCell>
                    <TableCell><div className="text-sm">{l.full_name}</div><div className="text-xs text-muted-foreground">{l.email}</div></TableCell>
                    <TableCell>{l.kind}</TableCell>
                    <TableCell><StatusBadge status={l.status} /></TableCell>
                    <TableCell>
                      <select value={l.status} onChange={(e) => updateLeadStatus(l.id, e.target.value)} className="text-xs border rounded px-2 py-1">
                        <option value="new">Nouveau</option><option value="in_review">En cours</option>
                        <option value="contacted">Contacté</option><option value="closed">Clôturé</option>
                      </select>
                    </TableCell>
                  </TableRow>
                ))}
                {leads.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Aucune demande.</TableCell></TableRow>}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {isModerator && (
          <TabsContent value="moderation">
            <div className="space-y-3">
              {pending.map((p) => (
                <Card key={p.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">{p.city} · {p.type}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => updatePlaceStatus(p.id, "rejected")}><X className="h-4 w-4" /> Refuser</Button>
                    <Button size="sm" onClick={() => updatePlaceStatus(p.id, "published")}><Check className="h-4 w-4" /> Publier</Button>
                  </div>
                </Card>
              ))}
              {pending.length === 0 && <p className="text-center text-muted-foreground py-8">File vide.</p>}
            </div>
          </TabsContent>
        )}

        {isAdmin && (
          <TabsContent value="users">
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
                        <Button size="sm" variant="ghost" onClick={() => promote(u.user_id, "partner")}>+ Partner</Button>
                        <Button size="sm" variant="ghost" onClick={() => promote(u.user_id, "moderator")}>+ Mod</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending: "bg-accent-soft text-accent-foreground",
    published: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    new: "bg-primary-soft text-primary",
    in_review: "bg-accent-soft text-accent-foreground",
    contacted: "bg-success/15 text-success",
    closed: "bg-muted text-muted-foreground",
  };
  return <span className={`text-xs px-2 py-1 rounded-full font-medium ${map[status] ?? "bg-muted"}`}>{status}</span>;
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { logger } from "@/lib/logger";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RowSkeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Pencil, Plus, Check, X, LayoutDashboard, Store, Inbox, MessageSquare,
  ShieldCheck, Users, MapPin, TrendingUp, Radio, RefreshCw, AlertTriangle, ChevronDown,
} from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { buildModerationCsv, buildCsvFilename, type ModerationEvent } from "./moderation-utils";

import type { Database } from "@/integrations/supabase/types";
import type { LucideIcon } from "lucide-react";

type PlaceRow = Database["public"]["Tables"]["places"]["Row"];
type LeadRow = Database["public"]["Tables"]["leads"]["Row"] & {
  /** Jointure select("*, places(name)"). */
  places?: { name: string } | null;
};
type ModerationEventRow = Database["public"]["Tables"]["place_moderation_events"]["Row"];
type UserRoleRow = Database["public"]["Tables"]["user_roles"]["Row"] & {
  /** Jointure select("*, profiles(display_name)"). */
  profiles?: { display_name: string | null } | null;
};
type LeadStatus = Database["public"]["Enums"]["lead_status"];

type View = "dashboard" | "places" | "leads" | "messages" | "moderation" | "users";

const NAV: { key: View; label: string; icon: LucideIcon; role?: "any" | "moderator" | "admin" }[] = [
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
  const [places, setPlaces] = useState<PlaceRow[]>([]);
  const [leads, setLeads] = useState<LeadRow[]>([]);
  const [pending, setPending] = useState<PlaceRow[]>([]);
  const [users, setUsers] = useState<UserRoleRow[]>([]);
  const [selectedLead, setSelectedLead] = useState<LeadRow | null>(null);
  const [partnerNote, setPartnerNote] = useState("");
  const [searchUid, setSearchUid] = useState("");
  const [modTarget, setModTarget] = useState<{ place: PlaceRow; action: "approved" | "rejected" } | null>(null);
  const [modNote, setModNote] = useState("");
  const [modBusy, setModBusy] = useState(false);
  const [history, setHistory] = useState<ModerationEventRow[]>([]);
  const [historyPlace, setHistoryPlace] = useState<PlaceRow | null>(null);
  const [modPreviewId, setModPreviewId] = useState<string | null>(null);
  // Moderation queue filters
  const [modSearch, setModSearch] = useState("");
  const [modCity, setModCity] = useState("all");
  const [modType, setModType] = useState("all");
  const [modStatus, setModStatus] = useState<"pending" | "rejected" | "all">("pending");
  const [modSince, setModSince] = useState("");
  const [modSort, setModSort] = useState<"date_desc" | "date_asc" | "status" | "city">("date_desc");
  const [modPage, setModPage] = useState(1);
  const MOD_PAGE_SIZE = 10;
  // Email verification
  const [testEmail, setTestEmail] = useState("");
  const [testBusy, setTestBusy] = useState(false);
  const [testResult, setTestResult] = useState<{
    status?: string;
    recipient?: string;
    detail?: string;
    provider_id?: string;
  } | null>(null);
  // Realtime status
  const [rtStatus, setRtStatus] = useState<"idle" | "connecting" | "connected" | "error">("idle");
  const [rtAttempt, setRtAttempt] = useState(0);
  const [rtError, setRtError] = useState<string | null>(null);
  const [rtLastRetryAt, setRtLastRetryAt] = useState<Date | null>(null);
  const [rtNextRetryAt, setRtNextRetryAt] = useState<Date | null>(null);
  const [rtNextDelayMs, setRtNextDelayMs] = useState<number | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [loadBusy, setLoadBusy] = useState(false);
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvProgress, setCsvProgress] = useState<{ step: string; pct: number } | null>(null);

  const load = useCallback(async () => {
    setLoadBusy(true);
    try {
      const { data: p } = await supabase.from("places").select("*").order("created_at", { ascending: false });
      setPlaces(p ?? []);
      const { data: l } = await supabase.from("leads").select("*, places(name)").order("created_at", { ascending: false });
      setLeads(l ?? []);
      if (isModerator) {
        const { data: pend } = await supabase
          .from("places").select("*")
          .in("status", ["pending", "rejected"])
          .order("created_at", { ascending: false });
        setPending(pend ?? []);
      }
      if (isAdmin) {
        // user_roles et profiles pointent tous deux vers auth.users mais n'ont
        // aucune relation directe : PostgREST ne sait pas les joindre. On charge
        // donc les deux et on rapproche les noms côté client.
        const { data: ur } = await supabase
          .from("user_roles")
          .select("*")
          .order("created_at", { ascending: false });
        const roleRows = (ur ?? []) as UserRoleRow[];
        const uids = Array.from(new Set(roleRows.map((u) => u.user_id)));
        const nameByUser = new Map<string, string | null>();
        if (uids.length) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id,display_name")
            .in("id", uids);
          (profs ?? []).forEach((pr) => nameByUser.set(pr.id, pr.display_name));
        }
        setUsers(
          roleRows.map((u) => ({
            ...u,
            profiles: { display_name: nameByUser.get(u.user_id) ?? null },
          }))
        );
      }
      setLastLoadedAt(new Date());
    } finally { setLoadBusy(false); }
  }, [isAdmin, isModerator]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Realtime: refresh queue when places change. Includes retry/backoff + status surface.
  useEffect(() => {
    if (!user || !isModerator) return;
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let attempt = 0;

    const connect = () => {
      attempt += 1;
      setRtAttempt(attempt);
      setRtStatus("connecting");
      setRtError(null);
      channel = supabase
        .channel(`admin-places-rt-${attempt}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "places" },
          (payload) => {
            logger.debug("[realtime places]", payload.eventType);
            load();
          },
        )
        .subscribe((status, err) => {
          if (cancelled) return;
          if (status === "SUBSCRIBED") {
            setRtStatus("connected"); setRtError(null);
            setRtNextRetryAt(null); setRtNextDelayMs(null);
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            const raw = err?.message ?? status;
            const safe = String(raw)
              .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[token]")
              .replace(/https?:\/\/\S+/g, "[url]")
              .slice(0, 160);
            console.warn("[realtime] failed", status, err);
            setRtStatus("error"); setRtError(safe);
            setRtLastRetryAt(new Date());
            if (channel) supabase.removeChannel(channel);
            const delay = Math.min(30_000, 1000 * 2 ** Math.min(attempt - 1, 5));
            setRtNextDelayMs(delay);
            setRtNextRetryAt(new Date(Date.now() + delay));
            retryTimer = setTimeout(connect, delay);
          }
        });
    };
    connect();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (channel) supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isModerator]);

  const retryRealtime = () => {
    setRtAttempt((a) => a + 1);
    setRtStatus("connecting");
    setRtError(null);
    setRtLastRetryAt(new Date());
    setRtNextRetryAt(null); setRtNextDelayMs(null);
    supabase.realtime.connect();
    load();
  };

  const fmtTime = (d: Date | null) => d ? d.toLocaleTimeString("fr-FR") : "—";
  const fmtDelay = (ms: number | null) => ms == null ? "—" : ms >= 1000 ? `${Math.round(ms / 1000)}s` : `${ms}ms`;

  const exportModerationCsv = async (rows: PlaceRow[]) => {
    setCsvBusy(true);
    setCsvProgress({ step: "Préparation…", pct: 5 });
    const filtersLabel = [
      modCity !== "all" && `ville=${modCity}`,
      modStatus !== "all" && `statut=${modStatus}`,
      modType !== "all" && `type=${modType}`,
      modSince && `depuis=${modSince}`,
    ].filter(Boolean).join(", ") || "aucun filtre";
    try {
      const ids = rows.map((r) => r.id);
      const eventsByPlace: Record<string, ModerationEvent | undefined> = {};
      if (ids.length) {
        setCsvProgress({ step: "Chargement des événements…", pct: 35 });
        const { data: events, error } = await supabase
          .from("place_moderation_events")
          .select("id, place_id, action, note, created_at")
          .in("place_id", ids)
          .order("created_at", { ascending: false });
        if (error) throw error;
        for (const e of events ?? []) {
          if (!eventsByPlace[e.place_id]) eventsByPlace[e.place_id] = e as ModerationEvent;
        }
      }
      setCsvProgress({ step: "Génération du fichier…", pct: 75 });
      const csv = buildModerationCsv(rows, eventsByPlace);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = buildCsvFilename({ city: modCity, status: modStatus, type: modType, since: modSince });
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      setCsvProgress({ step: "Terminé", pct: 100 });
      toast.success(`Export CSV — ${rows.length} ligne(s) (${filtersLabel})`);
    } catch (e) {
      toast.error(`Export CSV échoué (${filtersLabel}) : ${e instanceof Error ? e.message : "Erreur inattendue"}`);
    } finally {
      setCsvBusy(false);
      setTimeout(() => setCsvProgress(null), 800);
    }
  };

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

  const submitModeration = async () => {
    if (!modTarget) return;
    setModBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("moderate-place", {
        body: { place_id: modTarget.place.id, action: modTarget.action, note: modNote.trim() || null },
      });
      if (error) throw error;
      const res = data as {
        error?: string;
        email?: { status?: string; recipient?: string; detail?: string };
      } | null;
      if (res?.error) throw new Error(res.error);
      const baseMsg = modTarget.action === "approved" ? "Fiche publiée" : "Fiche refusée";
      const em = res?.email;
      if (em?.status === "sent") {
        toast.success(`${baseMsg} — email envoyé à ${em.recipient}`);
      } else if (em?.status === "failed") {
        toast.error(`${baseMsg} mais l'email a échoué : ${em.detail ?? "?"}`);
      } else if (em?.status === "no_recipient") {
        toast.warning(`${baseMsg} — aucun email partenaire connu`);
      } else if (em?.status === "not_configured") {
        toast.warning(`${baseMsg} — connecteur Resend non configuré`);
      } else {
        toast.success(baseMsg);
      }
      logger.debug("[moderate-place] result", res);
      setModTarget(null); setModNote(""); load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur inattendue");
    } finally { setModBusy(false); }
  };
  const openHistory = async (place: PlaceRow) => {
    setHistoryPlace(place);
    const { data } = await supabase
      .from("place_moderation_events")
      .select("*")
      .eq("place_id", place.id)
      .order("created_at", { ascending: false });
    setHistory(data ?? []);
  };
  const updateLeadStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("leads").update({ status: status as LeadStatus }).eq("id", id);
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


  const sendTestEmail = async () => {
    if (!testEmail) return;
    setTestBusy(true); setTestResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-email", {
        body: { recipient: testEmail.trim() },
      });
      if (error) throw error;
      setTestResult(data);
      const emailResult = data as { status?: string; recipient?: string } | null;
      const s = emailResult?.status;
      if (s === "sent") toast.success(`Email envoyé à ${emailResult?.recipient ?? "destinataire"}`);
      else if (s === "failed") toast.error("Envoi échoué — voir les détails");
      else if (s === "no_recipient") toast.warning("Adresse invalide");
      else if (s === "not_configured") toast.warning("Connecteur Resend non configuré");
      else toast.info(`Statut : ${s ?? "?"}`);
    } catch (e) {
      setTestResult({ status: "failed", detail: e instanceof Error ? e.message : "Erreur inattendue" });
      toast.error(e instanceof Error ? e.message : "Erreur inattendue");
    } finally { setTestBusy(false); }
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

            {/* Espaces dédiés, hors des onglets internes. Ils étaient
                inatteignables : aucun lien n'y menait depuis le back-office. */}
            {(isModerator || isAdmin) && (
              <div className="mt-3 space-y-1 border-t border-border pt-3">
                {isModerator && (
                  <>
                    <Link
                      to="/admin/shoppers"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted/50"
                    >
                      <Users className="h-4 w-4" /> Shoppers
                    </Link>
                    <Link
                      to="/admin/litiges"
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted/50"
                    >
                      <ShieldCheck className="h-4 w-4" /> Litiges
                    </Link>
                  </>
                )}
                {isAdmin && (
                  <Link
                    to="/admin/payouts"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition hover:bg-muted/50"
                  >
                    <Inbox className="h-4 w-4" /> Retraits
                  </Link>
                )}
              </div>
            )}
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
                  {loadBusy && places.length === 0 && (
                    <TableRow><TableCell colSpan={5}><RowSkeleton lines={3} /></TableCell></TableRow>
                  )}
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
                  {!loadBusy && places.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Aucune fiche.</TableCell></TableRow>}
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

          {view === "moderation" && isModerator && (() => {
            const cities = Array.from(new Set(pending.map((p) => p.city).filter(Boolean))).sort();
            const types = Array.from(new Set(pending.map((p) => p.type).filter(Boolean))).sort();
            const q = modSearch.trim().toLowerCase();
            const sinceTs = modSince ? new Date(modSince).getTime() : 0;
            const filtered = pending.filter((p) =>
              (modStatus === "all" || p.status === modStatus) &&
              (modCity === "all" || p.city === modCity) &&
              (modType === "all" || p.type === modType) &&
              (!sinceTs || new Date(p.created_at).getTime() >= sinceTs) &&
              (!q || `${p.name} ${p.city} ${p.address} ${p.zone ?? ""}`.toLowerCase().includes(q))
            );
            const sorted = [...filtered].sort((a, b) => {
              if (modSort === "date_asc") return +new Date(a.created_at) - +new Date(b.created_at);
              if (modSort === "status") return String(a.status).localeCompare(String(b.status));
              if (modSort === "city") return String(a.city).localeCompare(String(b.city));
              return +new Date(b.created_at) - +new Date(a.created_at);
            });
            const totalPages = Math.max(1, Math.ceil(sorted.length / MOD_PAGE_SIZE));
            const page = Math.min(modPage, totalPages);
            const paged = sorted.slice((page - 1) * MOD_PAGE_SIZE, page * MOD_PAGE_SIZE);
            return (
              <div className="space-y-3">
                <div data-testid="rt-status" className={`rounded-md border px-3 py-2 text-xs space-y-1 ${
                  rtStatus === "connected" ? "bg-success/10 text-success border-success/30" :
                  rtStatus === "error" ? "bg-destructive/10 text-destructive border-destructive/30" :
                  "bg-muted/40 text-muted-foreground"
                }`}>
                  <div className="flex items-center gap-2 flex-wrap">
                    {rtStatus === "connected" && <><Radio className="h-3.5 w-3.5" /><span className="flex-1">Connecté — temps réel actif.</span></>}
                    {rtStatus === "connecting" && <><RefreshCw className="h-3.5 w-3.5 animate-spin" /><span className="flex-1">Connexion temps réel… (tentative {rtAttempt})</span></>}
                    {rtStatus === "error" && <><AlertTriangle className="h-3.5 w-3.5" /><span className="flex-1">Déconnecté — les mises à jour peuvent être retardées.</span></>}
                    {rtStatus === "idle" && <span className="flex-1">Temps réel en attente d'activation…</span>}
                    <span className="text-muted-foreground">Dernière maj : {fmtTime(lastLoadedAt)}</span>
                    <Button size="sm" variant="outline" className="h-7" onClick={load} disabled={loadBusy} data-testid="manual-refresh">
                      <RefreshCw className={`h-3.5 w-3.5 ${loadBusy ? "animate-spin" : ""}`} /> Rafraîchir
                    </Button>
                    {rtStatus === "error" && (
                      <Button size="sm" variant="outline" className="h-7" onClick={retryRealtime}>Réessayer temps réel</Button>
                    )}
                  </div>
                  {rtStatus === "error" && (
                    <Collapsible>
                      <CollapsibleTrigger className="flex items-center gap-1 text-[11px] underline opacity-80 hover:opacity-100 pl-5">
                        <ChevronDown className="h-3 w-3" /> Détails diagnostic
                      </CollapsibleTrigger>
                      <CollapsibleContent className="text-[11px] opacity-90 flex flex-wrap gap-x-4 gap-y-0.5 pl-5 pt-1" data-testid="rt-diagnostics">
                        <span>Tentatives : {rtAttempt}</span>
                        <span>Dernière tentative : {fmtTime(rtLastRetryAt)}</span>
                        <span>Prochaine : {fmtTime(rtNextRetryAt)} (dans {fmtDelay(rtNextDelayMs)})</span>
                        {rtError && <span className="break-all">Motif : {rtError}</span>}
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
                <Card className="p-3 grid gap-2 sm:grid-cols-6">
                  <Input placeholder="Recherche nom, adresse…" value={modSearch} onChange={(e) => { setModSearch(e.target.value); setModPage(1); }} className="sm:col-span-2" />
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={modCity} onChange={(e) => { setModCity(e.target.value); setModPage(1); }}>
                    <option value="all">Toutes villes</option>
                    {cities.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={modType} onChange={(e) => { setModType(e.target.value); setModPage(1); }}>
                    <option value="all">Tous types</option>
                    {types.map((t) => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={modStatus} onChange={(e) => { setModStatus(e.target.value as "pending" | "rejected" | "all"); setModPage(1); }}>
                    <option value="pending">En attente</option>
                    <option value="rejected">Refusées</option>
                    <option value="all">Toutes</option>
                  </select>
                  <select className="h-10 rounded-md border border-input bg-background px-2 text-sm" value={modSort} onChange={(e) => setModSort(e.target.value as "date_desc" | "date_asc" | "status" | "city")}>
                    <option value="date_desc">Tri : Date ↓</option>
                    <option value="date_asc">Tri : Date ↑</option>
                    <option value="status">Tri : Statut</option>
                    <option value="city">Tri : Ville</option>
                  </select>
                  <Input type="date" value={modSince} onChange={(e) => { setModSince(e.target.value); setModPage(1); }} className="sm:col-span-2" placeholder="Depuis" />
                  <div className="flex items-center justify-between sm:col-span-4 text-xs text-muted-foreground gap-2 flex-wrap">
                    <span>{sorted.length} fiche(s) — page {page}/{totalPages}</span>
                    <div className="flex items-center gap-3">
                      <Button size="sm" variant="outline" data-testid="csv-export" onClick={() => exportModerationCsv(sorted)} disabled={sorted.length === 0 || csvBusy}>
                        {csvBusy ? <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Export…</> : "Exporter CSV"}
                      </Button>
                      {(modSearch || modCity !== "all" || modType !== "all" || modStatus !== "pending" || modSince) && (
                        <button className="hover:text-foreground underline" onClick={() => { setModSearch(""); setModCity("all"); setModType("all"); setModStatus("pending"); setModSince(""); setModPage(1); }}>
                          Réinitialiser
                        </button>
                      )}
                    </div>
                  </div>
                </Card>

                {csvProgress && (
                  <div className="rounded-md border p-2 space-y-1" data-testid="csv-progress">
                    <div className="flex justify-between text-xs"><span>{csvProgress.step}</span><span>{csvProgress.pct}%</span></div>
                    <Progress value={csvProgress.pct} className="h-1.5" />
                  </div>
                )}

                <Collapsible>
                  <Card className="p-3">
                    <CollapsibleTrigger className="flex items-center justify-between w-full text-sm font-medium">
                      <span>Vérifier l'envoi d'email</span>
                      <ChevronDown className="h-4 w-4" />
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-3 space-y-2">
                      <p className="text-xs text-muted-foreground">Envoie un email de test via Resend et affiche le statut.</p>
                      <div className="flex gap-2 flex-wrap">
                        <Input type="email" placeholder="adresse@exemple.com" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} className="flex-1 min-w-[220px]" />
                        <Button onClick={sendTestEmail} disabled={testBusy || !testEmail}>{testBusy ? "Envoi…" : "Envoyer le test"}</Button>
                      </div>
                      {testResult && (
                        <div className="text-xs rounded-md border p-2 bg-muted/30">
                          <div className="flex items-center gap-2">
                            <Badge variant={testResult.status === "sent" ? "default" : testResult.status === "failed" ? "destructive" : "secondary"}>
                              {testResult.status}
                            </Badge>
                            {testResult.recipient && <span className="text-muted-foreground">→ {testResult.recipient}</span>}
                          </div>
                          {testResult.detail && <p className="mt-1 text-muted-foreground break-all">{testResult.detail}</p>}
                          {testResult.provider_id && <p className="mt-1 font-mono text-[10px]">id: {testResult.provider_id}</p>}
                        </div>
                      )}
                    </CollapsibleContent>
                  </Card>
                </Collapsible>

                {/* Master-detail desktop : liste à gauche, preview à droite (no extra scroll) */}
                <div className="grid gap-3 lg:grid-cols-[1fr_360px]">
                  <div className="space-y-2 min-w-0">
                    {paged.map((p) => {
                      const active = modPreviewId === p.id;
                      return (
                        <Card
                          key={p.id}
                          onClick={() => setModPreviewId(p.id)}
                          className={`p-3 flex items-center justify-between gap-3 flex-wrap cursor-pointer transition-colors ${
                            active ? "border-primary ring-1 ring-primary/30 bg-primary-soft/40" : "hover:border-primary/30"
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium truncate text-sm">{p.name}</p>
                              <StatusBadge status={p.status} />
                            </div>
                            <p className="text-[11px] text-muted-foreground truncate">{p.city} · {p.type} · {p.address}</p>
                          </div>
                          <div className="flex gap-1.5 shrink-0 flex-wrap" onClick={(e) => e.stopPropagation()}>
                            <Link to={`/admin/places/${p.id}`}><Button size="sm" variant="ghost" className="h-8 w-8 p-0"><Pencil className="h-4 w-4" /></Button></Link>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => { setModTarget({ place: p, action: "rejected" }); setModNote(""); }}>
                              <X className="h-4 w-4" />
                            </Button>
                            <Button size="sm" className="h-8" onClick={() => { setModTarget({ place: p, action: "approved" }); setModNote(""); }}>
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      );
                    })}
                    {sorted.length === 0 && <p className="text-center text-muted-foreground py-8">Aucune fiche ne correspond.</p>}
                  </div>

                  {/* Panneau preview sticky desktop */}
                  <aside className="hidden lg:block">
                    {(() => {
                      const sel = paged.find((p) => p.id === modPreviewId) ?? sorted.find((p) => p.id === modPreviewId);
                      if (!sel) {
                        return (
                          <Card className="p-6 text-center text-xs text-muted-foreground sticky top-20">
                            Sélectionnez une fiche pour prévisualiser ses détails ici.
                          </Card>
                        );
                      }
                      return (
                        <Card className="p-4 sticky top-20 space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-display text-lg leading-tight truncate">{sel.name}</p>
                              <p className="text-[11px] text-muted-foreground">{sel.city} · {sel.type}</p>
                            </div>
                            <StatusBadge status={sel.status} />
                          </div>
                          {sel.image && (
                            <img src={sel.image} alt={sel.name} className="aspect-video w-full rounded-md object-cover" loading="lazy" />
                          )}
                          <p className="text-xs text-muted-foreground line-clamp-6">{sel.description}</p>
                          <div className="flex gap-2 pt-1">
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => openHistory(sel)}>Historique</Button>
                            <Button size="sm" variant="outline" className="flex-1" onClick={() => { setModTarget({ place: sel, action: "rejected" }); setModNote(""); }}>
                              <X className="h-4 w-4" /> Refuser
                            </Button>
                            <Button size="sm" className="flex-1" onClick={() => { setModTarget({ place: sel, action: "approved" }); setModNote(""); }}>
                              <Check className="h-4 w-4" /> Valider
                            </Button>
                          </div>
                        </Card>
                      );
                    })()}
                  </aside>
                </div>
                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setModPage(page - 1)}>← Précédent</Button>
                    <span className="text-xs text-muted-foreground">Page {page} / {totalPages}</span>
                    <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setModPage(page + 1)}>Suivant →</Button>
                  </div>
                )}
              </div>
            );
          })()}

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

      <Dialog open={!!modTarget} onOpenChange={(o) => !o && setModTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {modTarget?.action === "approved" ? "Valider la fiche" : "Refuser la fiche"}
            </DialogTitle>
            <DialogDescription>
              {modTarget?.place?.name} — un email sera envoyé au partenaire avec le lien vers son profil.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm font-medium">Note pour le partenaire {modTarget?.action === "rejected" && <span className="text-destructive">*</span>}</p>
            <Textarea rows={5} value={modNote} onChange={(e) => setModNote(e.target.value)}
              placeholder={modTarget?.action === "approved" ? "Bienvenue sur Akwaba…" : "Expliquez ce qui doit être ajusté…"} />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setModTarget(null)}>Annuler</Button>
            <Button
              disabled={modBusy || (modTarget?.action === "rejected" && !modNote.trim())}
              onClick={submitModeration}
              variant={modTarget?.action === "rejected" ? "destructive" : "default"}>
              {modBusy ? "Envoi…" : modTarget?.action === "approved" ? "Publier et notifier" : "Refuser et notifier"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!historyPlace} onOpenChange={(o) => !o && setHistoryPlace(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {historyPlace && (
            <>
              <SheetHeader><SheetTitle>Historique — {historyPlace.name}</SheetTitle></SheetHeader>
              <div className="mt-4 space-y-3">
                {history.length === 0 && <p className="text-sm text-muted-foreground">Aucun événement.</p>}
                {history.map((h) => (
                  <Card key={h.id} className="p-3">
                    <div className="flex items-center justify-between">
                      <Badge variant={h.action === "approved" ? "default" : h.action === "rejected" ? "destructive" : "secondary"}>
                        {h.action}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString("fr-FR")}</span>
                    </div>
                    {h.note && <p className="text-sm mt-2 whitespace-pre-wrap">{h.note}</p>}
                  </Card>
                ))}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Kpi({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: number; hint: string }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-muted-foreground text-xs"><Icon className="h-3.5 w-3.5" /> {label}</div>
      <p className="font-display text-3xl mt-2">{value}</p>
      <p className="text-xs text-muted-foreground mt-1">{hint}</p>
    </Card>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
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

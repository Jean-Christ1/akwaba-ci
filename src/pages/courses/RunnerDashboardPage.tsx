import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  CATEGORIES, formatFcfa, STATUS_LABEL, statusTone, type ErrandStatus,
} from "@/modules/errands/domain";

interface Mission {
  id: string;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  delivery_address: string;
  budget_estimate: number;
  status: ErrandStatus;
  created_at: string;
  runner_id: string | null;
}

export default function RunnerDashboardPage() {
  const { user } = useAuth();
  const [approved, setApproved] = useState<boolean | null>(null);
  const [open, setOpen] = useState<Mission[]>([]);
  const [mine, setMine] = useState<Mission[]>([]);
  const [target, setTarget] = useState<Mission | null>(null);
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState("60");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: prof } = await supabase
      .from("runner_profiles").select("status").eq("user_id", user.id).maybeSingle();
    const ok = prof?.status === "approved";
    setApproved(ok);
    if (!ok) return;
    const [{ data: o }, { data: m }] = await Promise.all([
      supabase.from("errands").select("*").eq("status", "open").order("created_at", { ascending: false }),
      supabase.from("errands").select("*").eq("runner_id", user.id).order("created_at", { ascending: false }),
    ]);
    setOpen((o ?? []) as Mission[]);
    setMine((m ?? []) as Mission[]);
  }, [user]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!user || !approved) return;
    const channel = supabase
      .channel("runner-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "errands" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, approved, load]);

  const sendOffer = async () => {
    if (!target || !user) return;
    setSending(true);
    const { error } = await supabase.from("errand_offers").insert({
      errand_id: target.id,
      runner_id: user.id,
      price: Number(price) || 0,
      eta_minutes: Number(eta) || 60,
      message: msg.trim() || null,
    });
    setSending(false);
    if (error) return toast.error(error.message);
    toast.success("Offre envoyée");
    setTarget(null);
    setPrice(""); setMsg("");
  };

  if (!user)
    return (
      <div className="akw-container py-10 text-center text-sm">
        <Link className="text-primary" to="/auth?redirect=/courses/shopper">Connectez-vous</Link> pour accéder à l'espace shopper.
      </div>
    );

  if (approved === false)
    return (
      <div className="akw-container max-w-xl py-10 text-center">
        <h1 className="font-display text-2xl font-semibold">Espace shopper</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vous devez être un shopper validé pour voir les missions.
        </p>
        <Button asChild className="mt-4"><Link to="/courses/devenir-shopper">Candidater</Link></Button>
      </div>
    );

  const Card = ({ m, withOffer }: { m: Mission; withOffer?: boolean }) => (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{m.title}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORIES.find((c) => c.value === m.category)?.label} · {m.zone ? `${m.zone}, ` : ""}{m.city}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{m.delivery_address}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{formatFcfa(m.budget_estimate)}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${statusTone(m.status)}`}>
            {STATUS_LABEL[m.status]}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild variant="outline" size="sm"><Link to={`/courses/${m.id}`}>Ouvrir</Link></Button>
        {withOffer && (
          <Button size="sm" onClick={() => { setTarget(m); setPrice(""); setEta("60"); setMsg(""); }}>
            Proposer une offre
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <div className="akw-container max-w-4xl py-6">
      <p className="akw-eyebrow">Espace shopper</p>
      <h1 className="font-display text-2xl font-semibold">Missions</h1>

      <Tabs defaultValue="open" className="mt-4">
        <TabsList>
          <TabsTrigger value="open">Ouvertes ({open.length})</TabsTrigger>
          <TabsTrigger value="mine">Mes missions ({mine.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <ul className="mt-3 space-y-2">
            {open.length === 0 && <p className="text-sm text-muted-foreground">Aucune mission ouverte pour l'instant.</p>}
            {open.map((m) => <Card key={m.id} m={m} withOffer />)}
          </ul>
        </TabsContent>
        <TabsContent value="mine">
          <ul className="mt-3 space-y-2">
            {mine.length === 0 && <p className="text-sm text-muted-foreground">Pas encore de mission assignée.</p>}
            {mine.map((m) => <Card key={m.id} m={m} />)}
          </ul>
        </TabsContent>
      </Tabs>

      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Proposer une offre</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Votre prix de service (FCFA)</Label>
              <Input value={price} inputMode="numeric"
                onChange={(e) => setPrice(e.target.value.replace(/[^0-9]/g, ""))} placeholder="3000" />
            </div>
            <div>
              <Label>Délai estimé (minutes)</Label>
              <Input value={eta} inputMode="numeric"
                onChange={(e) => setEta(e.target.value.replace(/[^0-9]/g, ""))} />
            </div>
            <div>
              <Label>Message</Label>
              <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={3}
                placeholder="Je suis à Cocody, je peux partir tout de suite." />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={sendOffer} disabled={sending}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

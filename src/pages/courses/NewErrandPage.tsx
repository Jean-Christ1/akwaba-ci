import { useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ABIDJAN_ZONES,
  CATEGORIES,
  CITIES,
  PAY_METHODS,
  type ErrandCategory,
  type ErrandItem,
  type PayMethod,
} from "@/modules/errands/domain";

export default function NewErrandPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCategory = (params.get("category") as ErrandCategory) ?? "grocery";

  const [category, setCategory] = useState<ErrandCategory>(initialCategory);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [zone, setZone] = useState("");
  const [address, setAddress] = useState("");
  const [items, setItems] = useState<ErrandItem[]>([{ label: "", qty: "1" }]);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState("chat");
  const [scheduled, setScheduled] = useState("");
  const [payment, setPayment] = useState<PayMethod>("wave");
  const [saving, setSaving] = useState(false);

  const cleanItems = useMemo(
    () => items.filter((i) => i.label.trim().length > 0),
    [items]
  );
  const valid = title.trim().length >= 3 && address.trim().length >= 3 && cleanItems.length > 0;

  const updateItem = (idx: number, patch: Partial<ErrandItem>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  const submit = async () => {
    if (!user) {
      navigate("/auth?redirect=/courses/nouvelle");
      return;
    }
    if (!valid) {
      toast.error("Complétez le titre, l'adresse et au moins un article.");
      return;
    }
    setSaving(true);
    const { data, error } = await supabase
      .from("errands")
      .insert({
        customer_id: user.id,
        title: title.trim(),
        category,
        city,
        zone: zone || null,
        delivery_address: address.trim(),
        items: cleanItems as unknown as never,
        notes: notes || null,
        budget_estimate: Number(budget) || 0,
        preferred_contact: contact,
        scheduled_for: scheduled ? new Date(scheduled).toISOString() : null,
        payment_method: payment,
        status: "open",
      })
      .select("id")
      .single();
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Demande publiée — les shoppers vont répondre.");
    navigate(`/courses/${data.id}`);
  };

  return (
    <div className="akw-container max-w-3xl py-6">
      <p className="akw-eyebrow">Akwaba Courses</p>
      <h1 className="font-display text-2xl font-semibold">Nouvelle demande</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Décrivez ce dont vous avez besoin. Un shopper vérifié vous répondra avec son prix et son délai.
      </p>

      {!user && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          Vous devez être connecté pour publier.{" "}
          <Link className="font-medium text-primary" to="/auth?redirect=/courses/nouvelle">
            Se connecter
          </Link>
        </div>
      )}

      <div className="mt-5 space-y-5">
        <section className="rounded-2xl border border-border bg-card p-4">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Catégorie</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setCategory(c.value)}
                className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
                  category === c.value
                    ? "border-primary bg-primary-soft text-primary"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {c.emoji} {c.label}
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label htmlFor="title">Titre de la demande</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex. Courses de la semaine à Cocody"
            />
          </div>
          <div>
            <Label>Ville</Label>
            <Select value={city} onValueChange={setCity}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Quartier</Label>
            {city === "Abidjan" ? (
              <Select value={zone} onValueChange={setZone}>
                <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                <SelectContent>
                  {ABIDJAN_ZONES.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : (
              <Input value={zone} onChange={(e) => setZone(e.target.value)} placeholder="Quartier" />
            )}
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="addr">Adresse de livraison</Label>
            <Input
              id="addr"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rue, repère, étage…"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center justify-between">
            <Label>Liste des articles / tâches</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setItems((p) => [...p, { label: "", qty: "1" }])}
            >
              <Plus className="mr-1 h-4 w-4" /> Ajouter
            </Button>
          </div>
          <div className="mt-2 space-y-2">
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Input
                  className="flex-1"
                  value={it.label}
                  onChange={(e) => updateItem(i, { label: e.target.value })}
                  placeholder="Ex. Riz parfumé 5 kg"
                />
                <Input
                  className="w-20"
                  value={it.qty}
                  onChange={(e) => updateItem(i, { qty: e.target.value })}
                  placeholder="Qté"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}
                  aria-label="Supprimer l'article"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="budget">Budget estimé (FCFA)</Label>
            <Input
              id="budget"
              inputMode="numeric"
              value={budget}
              onChange={(e) => setBudget(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="25000"
            />
          </div>
          <div>
            <Label htmlFor="when">Pour quand ?</Label>
            <Input
              id="when"
              type="datetime-local"
              value={scheduled}
              onChange={(e) => setScheduled(e.target.value)}
            />
          </div>
          <div>
            <Label>Moyen de contact préféré</Label>
            <Select value={contact} onValueChange={setContact}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="chat">Chat Akwaba</SelectItem>
                <SelectItem value="call">Appel téléphonique</SelectItem>
                <SelectItem value="whatsapp">WhatsApp</SelectItem>
                <SelectItem value="video">Appel vidéo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Paiement</Label>
            <Select value={payment} onValueChange={(v) => setPayment(v as PayMethod)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PAY_METHODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.emoji} {p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="notes">Instructions au shopper</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Marques préférées, budget max par article, code portail…"
              rows={3}
            />
          </div>
        </section>

        <Button className="w-full" size="lg" disabled={saving} onClick={submit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Publier ma demande
        </Button>
      </div>
    </div>
  );
}

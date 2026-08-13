import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

const schema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  party_size: z.coerce.number().int().min(1).max(50).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  budget: z.string().max(60).optional().or(z.literal("")),
  message: z.string().trim().min(5).max(2000),
});

interface Props {
  placeId: string;
  placeName: string;
  kind: "lodging" | "restaurant" | "generic";
  onClose?: () => void;
}

export function LeadRequestForm({ placeId, placeName, kind, onClose }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    full_name: user?.user_metadata?.display_name ?? "",
    email: user?.email ?? "",
    phone: "",
    party_size: kind === "restaurant" ? "2" : "2",
    date_from: "",
    date_to: "",
    budget: "",
    message: "",
  });

  const update = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = schema.parse(form);
      const { error } = await supabase.functions.invoke("submit-lead", {
        body: {
          place_id: placeId,
          kind,
          ...parsed,
          phone: parsed.phone || null,
          budget: parsed.budget || null,
          date_from: parsed.date_from || null,
          date_to: parsed.date_to || null,
        },
      });
      if (error) throw error;
      toast.success("Demande envoyée ! Nous revenons vers vous rapidement.");
      onClose?.();
    } catch (err) {
      // La validation locale et l'appel réseau échouent différemment : on montre
      // le premier problème de saisie quand il existe, sinon le message technique.
      const msg =
        err instanceof z.ZodError
          ? (err.issues[0]?.message ?? "Erreur")
          : err instanceof Error
            ? err.message
            : "Erreur";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Demande pour <strong className="text-foreground">{placeName}</strong>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label>Nom complet</Label>
          <Input value={form.full_name} onChange={(e) => update("full_name", e.target.value)} required />
        </div>
        <div>
          <Label>Email</Label>
          <Input type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
        </div>
        <div>
          <Label>Téléphone / WhatsApp</Label>
          <Input value={form.phone} onChange={(e) => update("phone", e.target.value)} />
        </div>
        <div>
          <Label>Personnes</Label>
          <Input type="number" min={1} max={50} value={form.party_size} onChange={(e) => update("party_size", e.target.value)} />
        </div>
        {kind !== "restaurant" && (
          <>
            <div>
              <Label>Arrivée</Label>
              <Input type="date" value={form.date_from} onChange={(e) => update("date_from", e.target.value)} />
            </div>
            <div>
              <Label>Départ</Label>
              <Input type="date" value={form.date_to} onChange={(e) => update("date_to", e.target.value)} />
            </div>
          </>
        )}
        {kind === "restaurant" && (
          <div className="sm:col-span-2">
            <Label>Date souhaitée</Label>
            <Input type="datetime-local" value={form.date_from} onChange={(e) => update("date_from", e.target.value)} />
          </div>
        )}
        <div className="sm:col-span-2">
          <Label>Budget indicatif</Label>
          <Input value={form.budget} onChange={(e) => update("budget", e.target.value)} placeholder="ex: 80 000 FCFA / nuit" />
        </div>
      </div>
      <div>
        <Label>Message</Label>
        <Textarea rows={4} value={form.message} onChange={(e) => update("message", e.target.value)} required minLength={5} maxLength={2000} placeholder="Dites-nous ce que vous recherchez…" />
      </div>
      <div className="flex gap-2 justify-end">
        {onClose && <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>}
        <Button type="submit" disabled={loading}>{loading ? "Envoi..." : "Envoyer la demande"}</Button>
      </div>
    </form>
  );
}

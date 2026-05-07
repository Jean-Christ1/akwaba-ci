import { useEffect, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";

const TYPES = ["lodging","restaurant","maquis","attraction","beach","nightlife","culture","shopping"];
const STATUSES = ["draft","pending","published"];

export default function PlaceEditorPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const navigate = useNavigate();
  const { user, isModerator } = useAuth();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState<any>({
    slug: "", name: "", type: "lodging", city: "Abidjan", zone: "", address: "",
    tagline: "", description: "", lat: 5.32, lng: -4.03, standing: 3, price_band: "€€",
    phone: "", whatsapp: "", email: "", website: "", image: "", status: "draft",
  });

  useEffect(() => {
    if (!user) return;
    if (isNew) return;
    supabase.from("places").select("*").eq("id", id).single().then(({ data }) => {
      if (data) setForm(data);
    });
  }, [id, isNew, user]);

  const update = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        ...form,
        lat: Number(form.lat), lng: Number(form.lng), standing: Number(form.standing),
        owner_id: user!.id,
      };
      if (isNew) {
        const { data, error } = await supabase.from("places").insert(payload).select("id").single();
        if (error) throw error;
        toast.success("Fiche créée");
        navigate(`/admin/places/${data.id}`);
      } else {
        const { error } = await supabase.from("places").update(payload).eq("id", id);
        if (error) throw error;
        toast.success("Fiche enregistrée");
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="akw-container py-8 max-w-3xl">
      <Link to="/admin" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>
      <h1 className="font-display text-2xl mb-6">{isNew ? "Nouvelle fiche" : "Éditer la fiche"}</h1>
      <Card className="p-6">
        <form onSubmit={save} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nom"><Input value={form.name} onChange={(e) => update("name", e.target.value)} required maxLength={120} /></Field>
            <Field label="Slug (URL)"><Input value={form.slug} onChange={(e) => update("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,"-"))} required /></Field>
            <Field label="Type">
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.type} onChange={(e) => update("type", e.target.value)}>
                {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Ville"><Input value={form.city} onChange={(e) => update("city", e.target.value)} required /></Field>
            <Field label="Zone"><Input value={form.zone ?? ""} onChange={(e) => update("zone", e.target.value)} /></Field>
            <Field label="Standing (1-5)"><Input type="number" min={1} max={5} value={form.standing} onChange={(e) => update("standing", e.target.value)} /></Field>
            <Field label="Adresse" full><Input value={form.address} onChange={(e) => update("address", e.target.value)} required /></Field>
            <Field label="Latitude"><Input type="number" step="0.000001" value={form.lat} onChange={(e) => update("lat", e.target.value)} required /></Field>
            <Field label="Longitude"><Input type="number" step="0.000001" value={form.lng} onChange={(e) => update("lng", e.target.value)} required /></Field>
            <Field label="Tagline" full><Input value={form.tagline ?? ""} onChange={(e) => update("tagline", e.target.value)} /></Field>
          </div>
          <Field label="Description"><Textarea rows={5} value={form.description} onChange={(e) => update("description", e.target.value)} required /></Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Téléphone"><Input value={form.phone ?? ""} onChange={(e) => update("phone", e.target.value)} /></Field>
            <Field label="WhatsApp"><Input value={form.whatsapp ?? ""} onChange={(e) => update("whatsapp", e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email ?? ""} onChange={(e) => update("email", e.target.value)} /></Field>
            <Field label="Site web"><Input value={form.website ?? ""} onChange={(e) => update("website", e.target.value)} /></Field>
            <Field label="Image (URL)" full><Input value={form.image ?? ""} onChange={(e) => update("image", e.target.value)} /></Field>
          </div>
          <Field label="Statut">
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={(e) => update("status", e.target.value)}>
              <option value="draft">Brouillon</option>
              <option value="pending">Soumettre à modération</option>
              {isModerator && <option value="published">Publié</option>}
            </select>
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Link to="/admin"><Button type="button" variant="ghost">Annuler</Button></Link>
            <Button type="submit" disabled={loading}>{loading ? "..." : "Enregistrer"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return <div className={full ? "sm:col-span-2" : ""}><Label className="mb-1 block">{label}</Label>{children}</div>;
}

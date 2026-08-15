import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useServiceAreas } from "@/modules/places/application/useServiceAreas";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Check, Upload } from "lucide-react";

const TYPES = [
  { value: "lodging", label: "Hôtel / Hébergement" },
  { value: "restaurant", label: "Restaurant" },
  { value: "maquis", label: "Maquis" },
  { value: "attraction", label: "Attraction / Activité" },
  { value: "beach", label: "Plage / Resort" },
  { value: "nightlife", label: "Vie nocturne" },
  { value: "culture", label: "Culture / Musée" },
  { value: "shopping", label: "Boutique / Marché" },
];

const PRICES = ["€", "€€", "€€€", "€€€€"];

type FormState = {
  // account
  email: string; password: string; display_name: string;
  // place
  type: string; name: string; tagline: string; description: string; story: string;
  city: string; zone: string; address: string; lat: string; lng: string;
  standing: string; price_band: string;
  phone: string; whatsapp: string; contact_email: string; website: string;
  services: string; tags: string; cuisines: string;
  why_visit: string; best_for: string; best_time: string; average_duration: string;
  practical_tips: string;
  image: string; gallery: string[];
};

const initial: FormState = {
  email: "", password: "", display_name: "",
  type: "restaurant", name: "", tagline: "", description: "", story: "",
  city: "Abidjan", zone: "", address: "", lat: "5.32", lng: "-4.03",
  standing: "3", price_band: "€€",
  phone: "", whatsapp: "", contact_email: "", website: "",
  services: "", tags: "", cuisines: "",
  why_visit: "", best_for: "", best_time: "", average_duration: "",
  practical_tips: "",
  image: "", gallery: [],
};

const STEPS = ["Compte", "Type", "Identité", "Localisation", "Contact", "Détails", "Médias", "Validation"];

export default function PartnerSignupPage() {
  // Les villes viennent du referentiel : inscrire un etablissement dans une
  // ville que la plateforme ne dessert pas ne menerait a rien.
  const { cities: villesCouvertes } = useServiceAreas();
  const CITIES = villesCouvertes.map((v) => v.name);
  const { user, refreshRoles } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(user ? 1 : 0);
  const [form, setForm] = useState<FormState>({ ...initial, email: user?.email ?? "" });
  const [loading, setLoading] = useState(false);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));
  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const splitList = (v: string) => v.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);

  const uploadFile = async (file: File, kind: "image" | "gallery") => {
    const u = (await supabase.auth.getUser()).data.user;
    if (!u) return toast.error("Connectez-vous d'abord");
    const path = `${u.id}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, "_")}`;
    const { error } = await supabase.storage.from("place-images").upload(path, file);
    if (error) return toast.error(error.message);
    const { data } = supabase.storage.from("place-images").getPublicUrl(path);
    if (kind === "image") set("image", data.publicUrl);
    else set("gallery", [...form.gallery, data.publicUrl]);
  };

  const submit = async () => {
    setLoading(true);
    try {
      // 1. ensure account
      let currentUser = user;
      if (!currentUser) {
        const { data, error } = await supabase.auth.signUp({
          email: form.email, password: form.password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: form.display_name },
          },
        });
        if (error) throw error;
        currentUser = data.user;
        if (!data.session) {
          toast.success("Compte créé. Vérifiez votre email puis revenez compléter votre fiche.");
          setLoading(false);
          return;
        }
      }

      // 2. submit place via edge function (grants partner role)
      const { data, error } = await supabase.functions.invoke("register-partner", {
        body: {
          place: {
            name: form.name, type: form.type, city: form.city, zone: form.zone,
            address: form.address, tagline: form.tagline, description: form.description, story: form.story,
            lat: form.lat, lng: form.lng, standing: form.standing, price_band: form.price_band,
            phone: form.phone, whatsapp: form.whatsapp, email: form.contact_email, website: form.website,
            services: splitList(form.services), tags: splitList(form.tags), cuisines: splitList(form.cuisines),
            why_visit: splitList(form.why_visit), best_for: splitList(form.best_for),
            best_time: form.best_time, average_duration: form.average_duration,
            practical_tips: splitList(form.practical_tips),
            image: form.image, gallery: form.gallery,
          },
        },
      });
      if (error) throw error;
      const payload = data as { error?: string } | null;
      if (payload?.error) throw new Error(payload.error);
      await refreshRoles();
      toast.success("Inscription envoyée ! Votre fiche est en modération.");
      navigate("/profil");
    } catch (e) {
      toast.error((e instanceof Error ? e.message : null) ?? "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="akw-container py-8 max-w-3xl">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <div className="mb-6">
        <p className="akw-eyebrow">Devenir partenaire</p>
        <h1 className="font-display text-3xl">Inscrivez votre établissement</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Renseignez votre fiche en détail pour que les voyageurs vous trouvent facilement.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center gap-2 shrink-0">
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium ${
              i < step ? "bg-success text-success-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
            }`}>
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            <span className={`text-xs ${i === step ? "font-medium" : "text-muted-foreground"}`}>{label}</span>
            {i < STEPS.length - 1 && <span className="text-muted-foreground/40">›</span>}
          </div>
        ))}
      </div>

      <Card className="p-6 space-y-5">
        {step === 0 && (
          <>
            <h2 className="font-display text-lg">Créez votre compte</h2>
            <Field label="Nom d'affichage"><Input value={form.display_name} onChange={(e) => set("display_name", e.target.value)} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required /></Field>
            <Field label="Mot de passe"><Input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} minLength={6} required /></Field>
            <p className="text-xs text-muted-foreground">Déjà inscrit ? <Link to="/auth" className="text-primary hover:underline">Connectez-vous</Link>.</p>
          </>
        )}

        {step === 1 && (
          <>
            <h2 className="font-display text-lg">Type d'établissement</h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPES.map((t) => (
                <button key={t.value} type="button" onClick={() => set("type", t.value)}
                  className={`akw-card p-3 text-sm text-left transition ${form.type === t.value ? "ring-2 ring-primary" : "hover:bg-muted/30"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="font-display text-lg">Identité</h2>
            <Field label="Nom de l'établissement *"><Input value={form.name} onChange={(e) => set("name", e.target.value)} required /></Field>
            <Field label="Accroche (1 phrase)"><Input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} /></Field>
            <Field label="Description complète *"><Textarea rows={4} value={form.description} onChange={(e) => set("description", e.target.value)} required /></Field>
            <Field label="Histoire / À propos"><Textarea rows={3} value={form.story} onChange={(e) => set("story", e.target.value)} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Standing (1-5)">
                <Select value={form.standing} onValueChange={(v) => set("standing", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[1,2,3,4,5].map((n) => <SelectItem key={n} value={String(n)}>{"★".repeat(n)}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Gamme de prix">
                <Select value={form.price_band} onValueChange={(v) => set("price_band", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PRICES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="font-display text-lg">Localisation</h2>
            <Field label="Ville *">
              <Select value={form.city} onValueChange={(v) => set("city", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Quartier / Zone"><Input value={form.zone} onChange={(e) => set("zone", e.target.value)} placeholder="Ex: Cocody, Zone 4…" /></Field>
            <Field label="Adresse *"><Input value={form.address} onChange={(e) => set("address", e.target.value)} required /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitude"><Input value={form.lat} onChange={(e) => set("lat", e.target.value)} /></Field>
              <Field label="Longitude"><Input value={form.lng} onChange={(e) => set("lng", e.target.value)} /></Field>
            </div>
          </>
        )}

        {step === 4 && (
          <>
            <h2 className="font-display text-lg">Contact</h2>
            <Field label="Téléphone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
            <Field label="WhatsApp"><Input value={form.whatsapp} onChange={(e) => set("whatsapp", e.target.value)} /></Field>
            <Field label="Email de contact"><Input type="email" value={form.contact_email} onChange={(e) => set("contact_email", e.target.value)} /></Field>
            <Field label="Site web"><Input value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="https://" /></Field>
          </>
        )}

        {step === 5 && (
          <>
            <h2 className="font-display text-lg">Détails</h2>
            <p className="text-xs text-muted-foreground">Séparez les éléments par des virgules.</p>
            <Field label="Services / équipements"><Input value={form.services} onChange={(e) => set("services", e.target.value)} placeholder="Wifi, Parking, Climatisation…" /></Field>
            <Field label="Tags / mots-clés"><Input value={form.tags} onChange={(e) => set("tags", e.target.value)} placeholder="Romantique, Vue mer…" /></Field>
            {(form.type === "restaurant" || form.type === "maquis") && (
              <Field label="Cuisines"><Input value={form.cuisines} onChange={(e) => set("cuisines", e.target.value)} placeholder="Ivoirienne, Libanaise…" /></Field>
            )}
            <Field label="Pourquoi y aller"><Textarea rows={2} value={form.why_visit} onChange={(e) => set("why_visit", e.target.value)} /></Field>
            <Field label="Idéal pour"><Input value={form.best_for} onChange={(e) => set("best_for", e.target.value)} placeholder="Familles, Couples, Affaires…" /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Meilleur moment"><Input value={form.best_time} onChange={(e) => set("best_time", e.target.value)} placeholder="Saison sèche…" /></Field>
              <Field label="Durée moyenne"><Input value={form.average_duration} onChange={(e) => set("average_duration", e.target.value)} placeholder="2h, demi-journée…" /></Field>
            </div>
            <Field label="Conseils pratiques"><Textarea rows={2} value={form.practical_tips} onChange={(e) => set("practical_tips", e.target.value)} /></Field>
          </>
        )}

        {step === 6 && (
          <>
            <h2 className="font-display text-lg">Médias</h2>
            <Field label="Photo principale">
              <div className="flex items-center gap-3">
                {form.image && <img src={form.image} alt="" className="h-16 w-16 rounded object-cover" />}
                <label className="cursor-pointer">
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadFile(e.target.files[0], "image")} />
                  <span className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted/30"><Upload className="h-4 w-4" /> Téléverser</span>
                </label>
              </div>
            </Field>
            <Field label="Galerie">
              <div className="grid grid-cols-3 gap-2 mb-2">
                {form.gallery.map((g, i) => (
                  <div key={i} className="relative">
                    <img src={g} alt="" className="aspect-square w-full rounded object-cover" />
                    <button type="button" onClick={() => set("gallery", form.gallery.filter((_, j) => j !== i))} className="absolute -right-1 -top-1 rounded-full bg-destructive text-destructive-foreground h-5 w-5 text-xs">×</button>
                  </div>
                ))}
              </div>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => Array.from(e.target.files ?? []).forEach((f) => uploadFile(f, "gallery"))} />
                <span className="inline-flex items-center gap-2 rounded-md border border-input px-3 py-2 text-sm hover:bg-muted/30"><Upload className="h-4 w-4" /> Ajouter des photos</span>
              </label>
            </Field>
          </>
        )}

        {step === 7 && (
          <>
            <h2 className="font-display text-lg">Récapitulatif</h2>
            <div className="space-y-2 text-sm">
              <p><strong>{form.name}</strong> — {TYPES.find((t) => t.value === form.type)?.label}</p>
              <p className="text-muted-foreground">{form.city} · {form.address}</p>
              <p className="line-clamp-3">{form.description}</p>
            </div>
            <p className="text-xs text-muted-foreground">Après envoi, votre fiche passe en modération avant publication. Vous pourrez la modifier depuis votre back-office.</p>
          </>
        )}

        <div className="flex justify-between pt-3 border-t">
          <Button variant="outline" onClick={prev} disabled={step === 0}><ArrowLeft className="h-4 w-4" /> Précédent</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Suivant <ArrowRight className="h-4 w-4" /></Button>
          ) : (
            <Button onClick={submit} disabled={loading}>{loading ? "Envoi…" : "Envoyer ma fiche"}</Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

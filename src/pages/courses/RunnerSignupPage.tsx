import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ABIDJAN_ZONES, CITIES, VEHICLES, type RunnerStatus } from "@/modules/errands/domain";

export default function RunnerSignupPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [existing, setExisting] = useState<{ status: RunnerStatus } | null>(null);
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [city, setCity] = useState("Abidjan");
  const [zones, setZones] = useState<string[]>([]);
  const [vehicle, setVehicle] = useState("moto");
  const [bio, setBio] = useState("");

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    supabase
      .from("runner_profiles")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setExisting(data as { status: RunnerStatus } | null);
        setChecking(false);
      });
  }, [user]);

  const toggleZone = (z: string) =>
    setZones((p) => (p.includes(z) ? p.filter((x) => x !== z) : [...p, z]));

  const submit = async () => {
    if (!user) return navigate("/auth?redirect=/courses/devenir-shopper");
    if (fullName.trim().length < 2 || phone.trim().length < 6) {
      return toast.error("Nom et téléphone requis.");
    }
    setSaving(true);
    const { error } = await supabase.from("runner_profiles").insert({
      user_id: user.id,
      full_name: fullName.trim(),
      phone: phone.trim(),
      whatsapp: whatsapp.trim() || null,
      city,
      zones: zones as unknown as never,
      vehicle,
      bio: bio.trim() || null,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Candidature envoyée — validation sous 24 h.");
    setExisting({ status: "pending" });
  };

  if (checking) return null;

  if (existing) {
    const label: Record<RunnerStatus, string> = {
      pending: "Votre candidature est en cours de validation (sous 24 h).",
      approved: "Vous êtes shopper validé. Bonnes missions !",
      suspended: "Votre compte shopper est suspendu. Contactez le support.",
      rejected: "Votre candidature a été refusée.",
    };
    return (
      <div className="akw-container max-w-xl py-10 text-center">
        <ShieldCheck className="mx-auto h-8 w-8 text-primary" />
        <h1 className="mt-3 font-display text-2xl font-semibold">Statut shopper</h1>
        <p className="mt-2 text-sm text-muted-foreground">{label[existing.status]}</p>
        {existing.status === "approved" && (
          <Button asChild className="mt-4"><Link to="/courses/shopper">Voir les missions</Link></Button>
        )}
      </div>
    );
  }

  return (
    <div className="akw-container max-w-2xl py-6">
      <p className="akw-eyebrow">Akwaba Courses</p>
      <h1 className="font-display text-2xl font-semibold">Devenir shopper</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Réalisez des courses pour d'autres Ivoiriens et gagnez un revenu. Validation manuelle sous 24 h.
      </p>

      {!user && (
        <div className="mt-4 rounded-xl border border-border bg-muted/40 p-3 text-sm">
          <Link className="font-medium text-primary" to="/auth?redirect=/courses/devenir-shopper">
            Connectez-vous
          </Link>{" "}
          pour candidater.
        </div>
      )}

      <div className="mt-5 space-y-4">
        <section className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-2">
          <div>
            <Label>Nom complet</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Koffi Aya" />
          </div>
          <div>
            <Label>Téléphone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+225 07 00 00 00 00" />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="+225 07 …" />
          </div>
          <div>
            <Label>Moyen de déplacement</Label>
            <Select value={vehicle} onValueChange={setVehicle}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {VEHICLES.map((v) => <SelectItem key={v.value} value={v.value}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
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
        </section>

        {city === "Abidjan" && (
          <section className="rounded-2xl border border-border bg-card p-4">
            <Label>Zones couvertes</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {ABIDJAN_ZONES.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => toggleZone(z)}
                  className={`rounded-full border px-3 py-1.5 text-sm ${
                    zones.includes(z)
                      ? "border-primary bg-primary-soft text-primary"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {z}
                </button>
              ))}
            </div>
          </section>
        )}

        <section className="rounded-2xl border border-border bg-card p-4">
          <Label>Présentation</Label>
          <Textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Votre expérience, vos disponibilités, vos points forts…"
          />
        </section>

        <Button className="w-full" size="lg" disabled={saving} onClick={submit}>
          {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Envoyer ma candidature
        </Button>
      </div>
    </div>
  );
}

import { useCallback, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Plus, Trash2, Loader2, Info, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { AddressPicker } from "@/modules/errands/ui/AddressPicker";
import {
  calculerTrajet,
  centreVille,
  estimerDureeMission,
  profilPourVehicule,
  type Adresse,
} from "@/modules/errands/infrastructure/geocoding";
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
  formatFcfa,
  type ErrandCategory,
  type ErrandItem,
  type PayMethod,
} from "@/modules/errands/domain";
import {
  COMMISSION_RATE,
  DROPOFF_MODES,
  FUND_MODES,
  URGENCY_OPTIONS,
  VEHICLE_OPTIONS,
  VOLUME_OPTIONS,
  generateHandoverCode,
  quoteErrand,
  type DropoffMode,
  type FundMode,
  type Urgency,
  type VehicleKind,
  type VolumeSize,
} from "@/modules/errands/pricing";
import { usePageTitle } from "@/shared/hooks/usePageTitle";
import { useServiceAreas, zonesOfCity } from "@/modules/places/application/useServiceAreas";

export default function NewErrandPage() {
  usePageTitle("Demander une course", "Confiez votre course à un shopper vérifié.");
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

  // Logistique
  const [vehicle, setVehicle] = useState<VehicleKind>("any");
  const [volume, setVolume] = useState<VolumeSize>("small");
  const [urgency, setUrgency] = useState<Urgency>("standard");
  const [distance, setDistance] = useState("5");
  const [minutes, setMinutes] = useState("60");
  const [dropoff, setDropoff] = useState<DropoffMode>("runner_delivers");
  const [thirdParty, setThirdParty] = useState("");
  const [fundMode, setFundMode] = useState<FundMode>("customer_advance");

  // Coordonnées de l'adresse de remise, quand elle a pu être localisée.
  // Elles ancrent la distance, donc le prix, sur un trajet réel.
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [calculTrajet, setCalculTrajet] = useState(false);

  // Villes réellement ouvertes aux courses : proposer une ville sans réseau de
  // shoppers reviendrait à promettre un service que personne ne peut assurer.
  const { cities: villes, zones: quartiers } = useServiceAreas();
  const villesCourses = useMemo(
    () => villes.filter((v) => v.errandsEnabled),
    [villes]
  );
  const quartiersDeLaVille = useMemo(() => {
    const ville = villes.find((v) => v.name === city || v.slug === city);
    return ville ? zonesOfCity(quartiers, ville.slug) : [];
  }, [villes, quartiers, city]);

  const cleanItems = useMemo(() => items.filter((i) => i.label.trim().length > 0), [items]);

  /**
   * Une adresse vient d'être localisée : on dérive la distance et la durée du
   * trajet réel plutôt que de laisser une valeur saisie à la main servir
   * d'assiette au prix. Si le service de routage ne répond pas, la saisie
   * manuelle est conservée telle quelle.
   */
  const onAdresseLocalisee = useCallback(
    async (adresse: Adresse | null) => {
      if (!adresse) {
        setCoords(null);
        return;
      }

      setCoords({ lat: adresse.lat, lng: adresse.lng });
      setCalculTrajet(true);

      const trajet = await calculerTrajet(
        centreVille(city),
        { lat: adresse.lat, lng: adresse.lng },
        profilPourVehicule(vehicle)
      );

      setCalculTrajet(false);
      if (!trajet) return;

      setDistance(String(trajet.distanceKm));
      setMinutes(
        String(
          estimerDureeMission(trajet, cleanItems.length, dropoff === "runner_delivers")
        )
      );
    },
    [city, vehicle, cleanItems.length, dropoff]
  );
  const valid = title.trim().length >= 3 && address.trim().length >= 3 && cleanItems.length > 0;

  const quote = useMemo(
    () =>
      quoteErrand({
        vehicle,
        volume,
        urgency,
        distanceKm: Number(distance) || 0,
        estimatedMinutes: Number(minutes) || 0,
        dropoff,
        itemsCount: cleanItems.length,
      }),
    [vehicle, volume, urgency, distance, minutes, dropoff, cleanItems.length]
  );

  const budgetNum = Number(budget) || 0;

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
    // La course est créée par le serveur : il calcule le devis, pose la
    // commission et tire le code de remise. Le client décrit sa demande, il ne
    // fixe aucun montant, ce qui est exactement ce que la politique d'insertion
    // exige et ce qui rend le prix opposable aux deux parties.
    const { data, error } = await supabase.rpc("errand_create", {
      p_title: title.trim(),
      p_category: category,
      p_city: city,
      p_zone: zone || null,
      p_delivery_address: address.trim(),
      p_items: cleanItems as unknown as never,
      p_budget_estimate: budgetNum,
      p_notes: notes || null,
      p_preferred_contact: contact,
      p_scheduled_for: scheduled ? new Date(scheduled).toISOString() : null,
      p_payment_method: payment,
      p_vehicle_required: vehicle,
      p_volume_size: volume,
      p_urgency: urgency,
      p_distance_km: Number(distance) || 0,
      p_estimated_minutes: Number(minutes) || 60,
      p_dropoff_mode: dropoff,
      p_third_party: dropoff === "third_party" ? thirdParty || null : null,
      p_fund_mode: fundMode,
      p_lat: coords?.lat ?? null,
      p_lng: coords?.lng ?? null,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Demande publiée — les shoppers vont vous répondre.");
    navigate(`/courses/${data.id}`);
  };

  return (
    <div className="akw-container py-5 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="akw-eyebrow text-muted-foreground">Akwaba Courses</p>
          <h1 className="font-display text-2xl font-semibold">Nouvelle course</h1>
        </div>
        <Link
          to="/courses/comment-ca-marche"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary"
        >
          <Info className="h-4 w-4" /> Comment on paie ? <ChevronRight className="h-4 w-4" />
        </Link>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {/* 1. Type */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">1. Quel type de course ?</h2>
            <div className="scrollbar-none mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              {CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  className={`rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    category === c.value ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40"
                  }`}
                >
                  <span className="text-lg">{c.emoji}</span>
                  <p className="text-sm font-medium">{c.label}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{c.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <Label htmlFor="title">Titre de la course</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex : Courses de la semaine au marché d'Adjamé"
              />
            </div>
          </section>

          {/* 2. Articles */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">2. Que faut-il acheter / faire ?</h2>
            <div className="mt-3 space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex gap-2">
                  <Input
                    className="flex-1"
                    value={it.label}
                    onChange={(e) => updateItem(idx, { label: e.target.value })}
                    placeholder="Ex : Riz parfumé 5 kg"
                  />
                  <Input
                    className="w-20"
                    value={it.qty}
                    onChange={(e) => updateItem(idx, { qty: e.target.value })}
                    placeholder="Qté"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                    aria-label="Supprimer l'article"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => setItems((p) => [...p, { label: "", qty: "1" }])}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Ajouter un article
            </Button>
            <div className="mt-3">
              <Label htmlFor="notes">Précisions pour le shopper</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Marque préférée, remplacement autorisé, étage, point de repère…"
                rows={3}
              />
            </div>
          </section>

          {/* 3. Logistique */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">3. Transport et volume</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {VEHICLE_OPTIONS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  onClick={() => setVehicle(v.value)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                    vehicle === v.value ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-medium">{v.emoji} {v.label}</p>
                  <p className="text-[11px] text-muted-foreground line-clamp-1">{v.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Volume</Label>
                <Select value={volume} onValueChange={(v) => setVolume(v as VolumeSize)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {VOLUME_OPTIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label} — {v.hint}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Urgence</Label>
                <Select value={urgency} onValueChange={(v) => setUrgency(v as Urgency)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {URGENCY_OPTIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>{v.label} — {v.hint}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="dist">Distance estimée (km)</Label>
                <Input id="dist" inputMode="numeric" value={distance} onChange={(e) => setDistance(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="mins">Durée estimée (min)</Label>
                <Input id="mins" inputMode="numeric" value={minutes} onChange={(e) => setMinutes(e.target.value)} />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              {calculTrajet
                ? "Calcul du trajet en cours..."
                : coords
                  ? "Distance et durée calculées depuis l'adresse localisée. Vous pouvez les ajuster."
                  : "Choisissez une adresse dans les suggestions pour calculer la distance réelle."}
            </p>
          </section>

          {/* 4. Remise */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">4. Comment récupérez-vous la course ?</h2>
            <div className="mt-3 space-y-2">
              {DROPOFF_MODES.map((d) => (
                <button
                  key={d.value}
                  type="button"
                  onClick={() => setDropoff(d.value)}
                  className={`block w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    dropoff === d.value ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-medium">{d.label}</p>
                  <p className="text-xs text-muted-foreground">{d.hint}</p>
                </button>
              ))}
            </div>
            {dropoff === "third_party" && (
              <div className="mt-3">
                <Label htmlFor="tp">Contact du livreur tiers (facultatif)</Label>
                <Input id="tp" value={thirdParty} onChange={(e) => setThirdParty(e.target.value)} placeholder="Nom + numéro du nyango / gbaka" />
              </div>
            )}
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Ville</Label>
                <Select value={city} onValueChange={setCity}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(villesCourses.length ? villesCourses.map((v) => v.name) : CITIES).map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Quartier</Label>
                <Select value={zone} onValueChange={setZone}>
                  <SelectTrigger><SelectValue placeholder="Choisir" /></SelectTrigger>
                  <SelectContent>
                    {(quartiersDeLaVille.length ? quartiersDeLaVille : ABIDJAN_ZONES).map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="addr">Adresse de remise</Label>
                <AddressPicker
                  id="addr"
                  value={address}
                  onChange={setAddress}
                  onLocated={onAdresseLocalisee}
                  placeholder="Rue, immeuble, repère"
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="sched">Date / heure souhaitée (facultatif)</Label>
                <Input id="sched" type="datetime-local" value={scheduled} onChange={(e) => setScheduled(e.target.value)} />
              </div>
            </div>
          </section>

          {/* 5. Argent */}
          <section className="rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">5. L'argent des achats</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Ce montant est une <strong>estimation</strong>, pas un paiement. Rien n'est débité maintenant :
              on régularise au franc près avec le reçu, après la course.
            </p>
            <div className="mt-3 space-y-2">
              {FUND_MODES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFundMode(f.value)}
                  className={`block w-full rounded-xl border px-3 py-2.5 text-left transition-colors ${
                    fundMode === f.value ? "border-primary bg-primary-soft" : "border-border hover:border-primary/40"
                  }`}
                >
                  <p className="text-sm font-medium">
                    {f.label} <span className="ml-1 rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">{f.badge}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{f.hint}</p>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="budget">Budget achats estimé (FCFA)</Label>
                <Input id="budget" inputMode="numeric" value={budget} onChange={(e) => setBudget(e.target.value)} placeholder="Ex : 25000" />
              </div>
              <div>
                <Label>Moyen de transfert</Label>
                <Select value={payment} onValueChange={(v) => setPayment(v as PayMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PAY_METHODS.map((p) => <SelectItem key={p.value} value={p.value}>{p.emoji} {p.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>Contact préféré pendant la course</Label>
                <Select value={contact} onValueChange={setContact}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat">Chat dans l'application</SelectItem>
                    <SelectItem value="call">Appel téléphonique</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="video">Visio (choix au marché)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>
        </div>

        {/* Devis sticky */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="akw-eyebrow text-muted-foreground">Votre devis</p>
            <p className="mt-1 font-display text-3xl font-semibold">{formatFcfa(quote.serviceFee)}</p>
            <p className="text-xs text-muted-foreground">Frais de service Akwaba — connus d'avance</p>

            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li className="flex justify-between"><span>Base véhicule</span><span>{formatFcfa(quote.base)}</span></li>
              <li className="flex justify-between"><span>Distance</span><span>{formatFcfa(quote.distanceFee)}</span></li>
              <li className="flex justify-between"><span>Temps au-delà de 30 min</span><span>{formatFcfa(quote.timeFee)}</span></li>
              <li className="flex justify-between"><span>Volume</span><span>{formatFcfa(quote.volumeFee)}</span></li>
              <li className="flex justify-between"><span>Urgence</span><span>{formatFcfa(quote.urgencyFee)}</span></li>
              {quote.itemsFee > 0 && (
                <li className="flex justify-between"><span>Longue liste</span><span>{formatFcfa(quote.itemsFee)}</span></li>
              )}
              {quote.dropoffAdjustment !== 0 && (
                <li className="flex justify-between text-primary"><span>Remise remise/retrait</span><span>{formatFcfa(quote.dropoffAdjustment)}</span></li>
              )}
            </ul>

            <div className="mt-3 rounded-xl bg-muted/50 p-3 text-xs">
              <p className="flex justify-between"><span>Part shopper</span><strong>{formatFcfa(quote.runnerPayout)}</strong></p>
              <p className="flex justify-between text-muted-foreground"><span>Commission Akwaba ({Math.round(COMMISSION_RATE * 100)} %)</span><span>{formatFcfa(quote.commission)}</span></p>
            </div>

            <div className="mt-3 border-t border-border pt-3 text-sm">
              <p className="flex justify-between"><span className="text-muted-foreground">Achats (estimation)</span><span>{formatFcfa(budgetNum)}</span></p>
              <p className="mt-1 flex justify-between font-semibold"><span>Total prévisionnel</span><span>{formatFcfa(budgetNum + quote.serviceFee)}</span></p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Aucun prélèvement immédiat. Vous ne réglez qu'après validation du reçu.
              </p>
            </div>

            <Button className="mt-4 w-full" onClick={submit} disabled={saving || !valid}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Publier ma demande
            </Button>
            {!valid && (
              <p className="mt-2 text-center text-[11px] text-muted-foreground">
                Titre, adresse et au moins un article requis.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

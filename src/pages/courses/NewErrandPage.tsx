import { useCallback, useEffect, useMemo, useState } from "react";
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
  type SourceTrajet,
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
  CATEGORIES,
  resoudreCategorie,
  PAY_METHODS,
  formatFcfa,
  type ErrandCategory,
  type ErrandItem,
  type PayMethod,
} from "@/modules/errands/domain";
import {
  DROPOFF_MODES,
  FUND_MODES,
  URGENCY_OPTIONS,
  VEHICLE_OPTIONS,
  VOLUME_OPTIONS,
  type DropoffMode,
  type FundMode,
  type Urgency,
  type VehicleKind,
  type VolumeSize,
} from "@/modules/errands/pricing";
import { usePageTitle } from "@/shared/hooks/usePageTitle";
import { usePricingGrid } from "@/modules/errands/application/usePricingGrid";
import { devisDepuisGrille } from "@/modules/errands/grilleTarifaire";
import { useServiceAreas, zonesOfCity } from "@/modules/places/application/useServiceAreas";
import {
  LIBELLES_CONSIGNE,
  avertissementConsigne,
  quartierApresChangementDeVille,
  type SubstitutionPolicy,
} from "@/modules/errands/consigne";
import { useOrganisations } from "@/modules/organisations/application/useOrganisations";


export default function NewErrandPage() {
  usePageTitle("Demander une course", "Confiez votre course à un shopper vérifié.");
  const { user } = useAuth();
  // Le serveur calcule le devis avec le barème en vigueur, pas avec les
  // constantes du moteur : l'écran doit lire le même, sinon il annonce un
  // prix que la base n'applique plus.
  // Le devis affiché se calcule avec les tarifs publiés en base, ceux-là
  // mêmes dont le serveur se servira. Tant qu'ils ne sont pas chargés, on
  // n'affiche aucun prix : annoncer un chiffre qu'on ne peut pas tenir serait
  // pire que de faire patienter.
  const { grille, erreur: erreurBareme } = usePricingGrid();

  // Les organisations du client. Une course rattachee apparait dans le suivi
  // de l'entreprise ; sans organisation, ce choix ne s'affiche pas du tout.
  const { organisations } = useOrganisations(user?.id);
  const [organisation, setOrganisation] = useState('');
  const navigate = useNavigate();
  const [params] = useSearchParams();

  // Une course peut être demandée depuis la fiche d'un hôtel : on reprend
  // l'adresse de l'établissement comme point de remise, ce qui évite au
  // voyageur de la ressaisir alors qu'il y est déjà.
  const depuisLieu = params.get("depuis");
  // Une catégorie inconnue retombe sur la valeur par défaut plutôt que de
  // remonter telle quelle jusqu'à l'énumération serveur.
  const initialCategory = resoudreCategorie(params.get("category"));

  const villeInitiale = params.get("ville") ?? "Abidjan";

  const [category, setCategory] = useState<ErrandCategory>(initialCategory);
  const [title, setTitle] = useState("");
  const [city, setCity] = useState(villeInitiale);
  const [zone, setZone] = useState("");
  const [address, setAddress] = useState(params.get("adresse") ?? "");
  const [items, setItems] = useState<ErrandItem[]>([{ label: "", qty: "1" }]);
  const [budget, setBudget] = useState("");
  const [notes, setNotes] = useState("");
  const [contact, setContact] = useState("chat");
  // Consigne de remplacement, donnée d'avance plutôt qu'en pleine course : le
  // client est rarement disponible au moment où le shopper est devant le rayon.
  const [substitution, setSubstitution] = useState<SubstitutionPolicy>("ask");
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
  // Origine de la distance affichée. Une estimation obtenue sans le service de
  // routage doit être annoncée : le prix en dépend, le client a le droit de
  // savoir sur quoi il repose.
  const [sourceTrajet, setSourceTrajet] = useState<SourceTrajet | null>(null);

  // Villes réellement ouvertes aux courses : proposer une ville sans réseau de
  // shoppers reviendrait à promettre un service que personne ne peut assurer.
  const { cities: villes, zones: quartiers, loading: chargementZones } = useServiceAreas();
  const villesCourses = useMemo(
    () => villes.filter((v) => v.errandsEnabled),
    [villes]
  );
  // Une ville venue de l'URL, ou fermée aux courses depuis, laisserait la
  // liste sans sélection lisible et la demande partirait sur une ville que
  // personne ne dessert. Dès que le réseau réel est connu, on retombe sur la
  // première ville ouverte.
  useEffect(() => {
    if (villesCourses.length === 0) return;
    const connue = villesCourses.some((v) => v.name === city || v.slug === city);
    if (!connue) setCity(villesCourses[0].name);
  }, [villesCourses, city]);

  const quartiersDeLaVille = useMemo(() => {
    const ville = villes.find((v) => v.name === city || v.slug === city);
    return ville ? zonesOfCity(quartiers, ville.slug) : [];
  }, [villes, quartiers, city]);

  // Le quartier suit la ville : sans cela, il survivait au changement de ville
  // et partait dans p_zone alors que le sélecteur, lui, n'affichait plus rien.
  useEffect(() => {
    setZone((actuel) =>
      quartierApresChangementDeVille(actuel, quartiersDeLaVille, !chargementZones)
    );
  }, [quartiersDeLaVille, chargementZones]);

  const cleanItems = useMemo(() => items.filter((i) => i.label.trim().length > 0), [items]);

  /**
   * Une adresse vient d'être localisée : on dérive la distance et la durée du
   * trajet réel plutôt que de laisser une valeur saisie à la main servir
   * d'assiette au prix. Si le service de routage ne répond pas, une estimation
   * géométrique prend le relais et son origine est affichée : la demande reste
   * publiable dans tous les cas.
   */
  const onAdresseLocalisee = useCallback(
    async (adresse: Adresse | null) => {
      if (!adresse) {
        setCoords(null);
        setSourceTrajet(null);
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
      setSourceTrajet(trajet.source);
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

  // Le barème module par ville, et la course enregistre la ville par son nom.
  // La grille, elle, est indexée par identifiant : la correspondance se fait
  // ici, faute de quoi la modulation resterait sans effet.
  const villeSlug = useMemo(() => {
    const trouvee = villes.find((v) => v.name === city || v.slug === city);
    return trouvee?.slug ?? null;
  }, [villes, city]);

  const quote = useMemo(
    () =>
      grille
        ? devisDepuisGrille(
            {
              vehicle,
              volume,
              urgency,
              dropoff,
              distanceKm: Number(distance) || 0,
              estimatedMinutes: Number(minutes) || 0,
              itemsCount: cleanItems.length,
              citySlug: villeSlug,
            },
            grille
          )
        : null,
    [grille, vehicle, volume, urgency, distance, minutes, dropoff, cleanItems.length, villeSlug]
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
      p_zone: (zone || null) as unknown as string,
      p_delivery_address: address.trim(),
      p_items: cleanItems as unknown as never,
      p_budget_estimate: budgetNum,
      p_notes: (notes || null) as unknown as string,
      p_preferred_contact: contact,
      p_scheduled_for: (scheduled ? new Date(scheduled).toISOString() : null) as unknown as string,
      p_payment_method: payment,
      p_vehicle_required: vehicle,
      p_volume_size: volume,
      p_urgency: urgency,
      p_distance_km: Number(distance) || 0,
      p_estimated_minutes: Number(minutes) || 60,
      p_dropoff_mode: dropoff,
      p_third_party: (dropoff === "third_party" ? thirdParty || null : null) as unknown as string,
      p_fund_mode: fundMode,
      p_lat: coords?.lat ?? undefined,
      p_lng: coords?.lng ?? undefined,
    });
    // Le bouton reste inactif jusqu'à la fin de la consigne : le rendre à la
    // création seule laissait une fenêtre pendant laquelle un second appui
    // publiait une deuxième course.
    // La consigne est posée juste après la création : errand_create garde sa
    // signature, ce qui évite de casser tout appel existant.
    let consigneEchouee = false;
    if (!error && data) {
      const creee = data as { id?: string } | null;
      if (creee?.id) {
        // Le résultat de ce second appel n'était pas lu : une coupure réseau
        // laissait la course sur la consigne par défaut sans que rien ne le
        // signale au client.
        const { error: erreurConsigne } = await supabase.rpc("errand_set_substitution_policy", {
          p_errand_id: creee.id,
          p_policy: substitution,
        });
        consigneEchouee = Boolean(erreurConsigne);

        // Le rattachement à une organisation suit la même règle que la
        // consigne : son échec doit se dire. Une course qui n'apparaît pas
        // dans le suivi de l'entreprise ne se remarque pas, elle manque.
        if (organisation && organisation !== "perso") {
          const { error: erreurOrg } = await supabase.rpc("errand_set_organisation", {
            p_errand_id: creee.id,
            p_organisation_id: organisation,
          });
          if (erreurOrg) {
            toast.warning(
              "Demande publiée, mais elle n'a pas pu être rattachée à votre organisation. " +
                "Elle reste une course personnelle."
            );
          }
        }
      }
    }

    setSaving(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    const avertissement = avertissementConsigne(substitution, consigneEchouee);
    // La course existe dans tous les cas : c'est un avertissement, jamais une
    // erreur de publication.
    if (avertissement) toast.warning(avertissement);
    else toast.success("Demande publiée - les shoppers vont vous répondre.");
    navigate(`/courses/${data.id}`);
  };

  return (
    <div className="akw-container py-5 lg:py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="akw-eyebrow text-muted-foreground">Akwaba Courses</p>
          {depuisLieu && (
          <p className="mb-2 rounded-xl border border-primary/30 bg-primary-soft px-3 py-2 text-xs text-primary">
            Course demandée depuis {depuisLieu}. L'adresse de remise est déjà renseignée.
          </p>
        )}
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

            {/* Le choix n'apparaît qu'à ceux qui appartiennent à une
                organisation : le proposer à tout le monde ferait poser une
                question qui n'a de sens que pour une minorité. Le règlement ne
                change pas, seul le suivi de l'entreprise en dépend. */}
            {organisations.length > 0 && (
              <div className="mt-3">
                <Label className="text-xs" htmlFor="organisation">
                  Pour quel compte ?
                </Label>
                <Select value={organisation} onValueChange={setOrganisation}>
                  <SelectTrigger id="organisation" className="mt-1 min-h-[44px]">
                    <SelectValue placeholder="Compte personnel" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="perso">Compte personnel</SelectItem>
                    {organisations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Une course rattachée apparaît dans le suivi de l'organisation. Vous la réglez
                  comme d'habitude.
                </p>
              </div>
            )}
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
                      <SelectItem key={v.value} value={v.value}>{v.label} - {v.hint}</SelectItem>
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
                      <SelectItem key={v.value} value={v.value}>{v.label} - {v.hint}</SelectItem>
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
                : sourceTrajet === "routage"
                  ? "Distance et durée calculées depuis l'adresse localisée. Vous pouvez les ajuster."
                  : sourceTrajet === "estimation"
                    ? "Le calculateur d'itinéraire n'a pas répondu : distance et durée sont estimées à vol d'oiseau, majorées du détour de voirie. Ajustez-les si vous connaissez le trajet."
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
                    {villesCourses.map((v) => v.name).map((c) => (
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
                    {quartiersDeLaVille.map((z) => (
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
              <div className="sm:col-span-2">
                <Label>Si un article manque</Label>
                <Select
                  value={substitution}
                  onValueChange={(v) => setSubstitution(v as SubstitutionPolicy)}
                >
                  <SelectTrigger className="min-h-[44px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {/* Les libellés viennent du catalogue : l'avertissement les
                        reprend mot pour mot, deux copies finiraient par différer. */}
                    <SelectItem value="ask">{LIBELLES_CONSIGNE.ask}</SelectItem>
                    <SelectItem value="similar">{LIBELLES_CONSIGNE.similar}</SelectItem>
                    <SelectItem value="never">{LIBELLES_CONSIGNE.never}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {substitution === "never"
                    ? "Le shopper marquera l'article introuvable sans rien acheter d'autre."
                    : substitution === "similar"
                      ? "Un équivalent nettement plus cher vous sera quand même soumis."
                      : "Vous validez chaque remplacement, article par article."}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Devis sticky */}
        <aside className="lg:sticky lg:top-20 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="akw-eyebrow text-muted-foreground">Votre devis</p>

            {/* Sans barème, pas de prix. Un montant de repli écrit dans le code
                serait une deuxième source de tarifs, qui vieillit en silence et
                finit par annoncer au client ce que le serveur ne facturera pas. */}
            {!quote ? (
              <div className="mt-2 rounded-xl bg-muted/50 p-3 text-sm text-muted-foreground">
                {erreurBareme ? (
                  <>
                    <p className="font-medium text-destructive">Le barème n'a pas pu être lu.</p>
                    <p className="mt-1 text-xs">{erreurBareme}</p>
                    <p className="mt-1 text-xs">
                      Nous préférons ne rien afficher plutôt qu'un prix que nous ne pourrions pas
                      tenir. Réessayez dans un instant.
                    </p>
                  </>
                ) : (
                  <p>Calcul du devis…</p>
                )}
              </div>
            ) : (
              <>
            <p className="mt-1 font-display text-3xl font-semibold">{formatFcfa(quote.serviceFee)}</p>
            <p className="text-xs text-muted-foreground">Frais de service Akwaba - connus d'avance</p>

            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              <li className="flex justify-between"><span>Base véhicule</span><span>{formatFcfa(quote.base)}</span></li>
              <li className="flex justify-between"><span>Distance</span><span>{formatFcfa(quote.distanceFee)}</span></li>
              <li className="flex justify-between">
                <span>Temps au-delà de {grille?.freeMinutes ?? 0} min</span>
                <span>{formatFcfa(quote.timeFee)}</span>
              </li>
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
              <p className="flex justify-between text-muted-foreground">
                <span>Commission Akwaba ({Math.round((grille?.commission.rate ?? 0) * 100)} %)</span>
                <span>{formatFcfa(quote.commission)}</span>
              </p>
            </div>

            <div className="mt-3 border-t border-border pt-3 text-sm">
              <p className="flex justify-between"><span className="text-muted-foreground">Achats (estimation)</span><span>{formatFcfa(budgetNum)}</span></p>
              <p className="mt-1 flex justify-between font-semibold"><span>Total prévisionnel</span><span>{formatFcfa(budgetNum + quote.serviceFee)}</span></p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Aucun prélèvement immédiat. Vous ne réglez qu'après validation du reçu.
              </p>
            </div>
              </>
            )}

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

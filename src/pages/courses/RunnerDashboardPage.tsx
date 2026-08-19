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
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCommissionRule } from "@/modules/errands/application/useCommissionRule";
import {
  CATEGORIES, formatFcfa, STATUS_LABEL, statusTone, type ErrandStatus,
} from "@/modules/errands/domain";

interface Mission {
  id: string;
  title: string;
  category: string;
  city: string;
  zone: string | null;
  /** Absente du flux ouvert : révélée une fois la course assignée. */
  delivery_address?: string | null;
  budget_estimate: number;
  status: ErrandStatus;
  created_at: string;
  runner_id: string | null;
}

export interface AccesShopper {
  /** Le marché ouvert n'est publié qu'au shopper validé : la vue refuse les autres. */
  marcheOuvert: boolean;
  /** Les missions déjà attribuées, dues au client quel que soit l'état du compte. */
  mesMissions: boolean;
  /** Invitation à candidater, pour qui n'a pas encore de dossier de shopper. */
  candidature: boolean;
  /** Ce qu'il faut dire au shopper sur l'état de son dossier, ou rien. */
  bandeau: string | null;
}

const BANDEAUX: Record<string, string> = {
  pending:
    "Votre candidature de shopper est en cours d'examen. Le marché ouvert s'affichera dès sa validation.",
  suspended:
    "Votre compte shopper est suspendu : vous ne recevez plus de nouvelles missions. " +
    "Terminez celles que vous avez déjà acceptées, le client attend sa livraison.",
  rejected:
    "Votre candidature de shopper n'a pas été retenue. Vous ne recevez plus de nouvelles missions ; " +
    "terminez celles qui vous ont été confiées.",
};

const BANDEAU_PAR_DEFAUT =
  "Votre compte shopper n'est pas actif : le marché ouvert ne vous est plus proposé. " +
  "Les missions déjà acceptées restent accessibles.";

/**
 * Ce qu'un shopper voit selon l'état de son dossier.
 *
 * L'écran abandonnait ses deux requêtes dès que le statut n'était plus
 * « approved ». Un shopper suspendu perdait donc l'accès aux missions qu'il
 * avait déjà acceptées, alors que le serveur l'autorise toujours à les faire
 * avancer (errand_advance_status ne contrôle que le shopper assigné) et qu'un
 * client attend sa livraison au bout. Seule la lecture du marché ouvert doit
 * dépendre de la validation.
 *
 * `undefined` : le dossier n'a pas encore été lu, on ne conclut rien.
 * `null` : aucun dossier, l'invitation à candidater est la seule réponse utile.
 */
export function accesShopper(statut: string | null | undefined): AccesShopper {
  if (statut === undefined) {
    return { marcheOuvert: false, mesMissions: false, candidature: false, bandeau: null };
  }
  if (statut === null) {
    return { marcheOuvert: false, mesMissions: false, candidature: true, bandeau: null };
  }
  if (statut === "approved") {
    return { marcheOuvert: true, mesMissions: true, candidature: false, bandeau: null };
  }
  return {
    marcheOuvert: false,
    mesMissions: true,
    candidature: false,
    bandeau: BANDEAUX[statut] ?? BANDEAU_PAR_DEFAUT,
  };
}

/**
 * Refus d'une offre dont le prix ne tient pas debout.
 *
 * Le champ acceptait le vide : `Number("") || 0` valait zéro et l'insertion
 * passait. Le client lisait « 0 FCFA », acceptait, et le serveur lui facturait
 * le plancher du barème, GREATEST(prix, min_service_fee) dans
 * errand_accept_offer. Le prix affiché n'était donc pas celui appliqué.
 */
export function messageOffreInvalide(prix: string, plancher: number): string | null {
  const valeur = Number(prix);
  if (!prix.trim() || !Number.isFinite(valeur) || valeur <= 0) {
    return `Indiquez votre prix de service, au minimum ${formatFcfa(plancher)}.`;
  }
  if (valeur < plancher) {
    return `Votre prix ne peut pas descendre sous ${formatFcfa(plancher)} : c'est le montant que le client paiera de toute façon.`;
  }
  return null;
}

/**
 * Carte d'une mission.
 *
 * Sortie du corps de la page : définie à l'intérieur, elle était recréée à
 * chaque rendu, donc React démontait et remontait toute la liste à la moindre
 * frappe dans le formulaire d'offre.
 */
export function CarteMission({
  mission,
  avecOffre,
  offreEnvoyee,
  onProposer,
}: {
  mission: Mission;
  avecOffre?: boolean;
  /** Une offre existe déjà pour cette mission : la table n'en accepte qu'une par shopper. */
  offreEnvoyee?: boolean;
  onProposer?: (mission: Mission) => void;
}) {
  return (
    <li className="rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{mission.title}</p>
          <p className="text-xs text-muted-foreground">
            {CATEGORIES.find((c) => c.value === mission.category)?.label} ·{" "}
            {mission.zone ? `${mission.zone}, ` : ""}{mission.city}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {mission.delivery_address ?? "Adresse exacte communiquée dès l'attribution de la course"}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-sm font-semibold">{formatFcfa(mission.budget_estimate)}</p>
          <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${statusTone(mission.status)}`}>
            {STATUS_LABEL[mission.status]}
          </span>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <Button asChild variant="outline" size="sm"><Link to={`/courses/${mission.id}`}>Ouvrir</Link></Button>
        {avecOffre &&
          (offreEnvoyee ? (
            // Reproposer une offre butait sur la clé unique (errand_id, runner_id)
            // et affichait le message brut de la base au shopper.
            <Button size="sm" variant="secondary" disabled>Offre envoyée</Button>
          ) : (
            <Button size="sm" onClick={() => onProposer?.(mission)}>
              Proposer une offre
            </Button>
          ))}
      </div>
    </li>
  );
}

export default function RunnerDashboardPage() {
  const { user } = useAuth();
  const { rule, loading: baremeEnCours } = useCommissionRule();
  // undefined tant que le dossier n'a pas été lu : voir accesShopper.
  const [statut, setStatut] = useState<string | null | undefined>(undefined);
  const [open, setOpen] = useState<Mission[]>([]);
  const [mine, setMine] = useState<Mission[]>([]);
  const [offresEnvoyees, setOffresEnvoyees] = useState<Set<string>>(new Set());
  // Onglet piloté : une valeur par défaut ne s'applique qu'au montage, or le
  // statut du dossier n'est connu qu'après. Un shopper sans marché ouvert
  // resterait devant une liste vide alors que ses missions l'attendent à côté.
  const [onglet, setOnglet] = useState("open");
  const [target, setTarget] = useState<Mission | null>(null);
  const [price, setPrice] = useState("");
  const [eta, setEta] = useState("60");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  // Un refus de lecture ne doit pas se déguiser en « aucune mission » : le
  // shopper croirait le marché vide alors qu'il ne peut simplement pas le voir.
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    const { data: prof, error: erreurProfil } = await supabase
      .from("runner_profiles").select("status").eq("user_id", user.id).maybeSingle();
    if (erreurProfil) {
      // Sans profil lisible, on ignore si le compte est validé : le dire plutôt
      // que d'afficher l'invitation à candidater à un shopper déjà validé.
      setMessageErreur(erreurProfil.message);
      setStatut(undefined);
      return;
    }
    const statutLu = prof?.status ?? null;
    setStatut(statutLu);

    const acces = accesShopper(statutLu);
    // Sans marché ouvert, la seule liste qui porte quelque chose est celle de
    // ses missions : c'est elle qu'il faut lui montrer d'emblée.
    if (!acces.marcheOuvert) setOnglet("mine");
    if (!acces.mesMissions) return;

    // Marché ouvert : vue filtrée, sans adresse exacte ni notes du client.
    // L'adresse complète n'apparaît qu'une fois la course assignée.
    const [miennes, ouvertes, offres] = await Promise.all([
      // Colonnes explicites : la lecture d'errands est accordée colonne par
      // colonne pour protéger le code de remise, et une étoile demanderait
      // aussi cette colonne, donc échouerait pour tout le monde.
      supabase
        .from("errands")
        .select(
          "id,title,category,city,zone,delivery_address,budget_estimate,status,created_at,runner_id"
        )
        .eq("runner_id", user.id)
        .order("created_at", { ascending: false }),
      acces.marcheOuvert
        ? supabase.from("open_errands_feed").select("*").order("created_at", { ascending: false })
        : null,
      // Les offres déjà envoyées, lues au même moment que le marché : sans
      // elles, le bouton invitait à reproposer une offre que la clé unique
      // (errand_id, runner_id) refuse.
      acces.marcheOuvert
        ? supabase.from("errand_offers").select("errand_id").eq("runner_id", user.id)
        : null,
    ]);

    const erreur = miennes.error ?? ouvertes?.error ?? offres?.error;
    setMessageErreur(erreur ? erreur.message : null);

    // Le flux ouvert ne porte ni statut ni affectation : par construction, ces
    // courses sont ouvertes et sans shopper.
    setOpen(
      (ouvertes?.data ?? []).map((row) => ({
        ...row,
        status: "open" as ErrandStatus,
        runner_id: null,
      })) as Mission[]
    );
    setMine((miennes.data ?? []) as Mission[]);
    setOffresEnvoyees(new Set((offres?.data ?? []).map((o) => o.errand_id)));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const acces = accesShopper(statut);

  useEffect(() => {
    if (!user || !acces.marcheOuvert) return;
    const channel = supabase
      .channel("runner-feed")
      // Abonnement filtre : sans filtre, chaque shopper rechargeait toute sa
      // liste a la moindre mutation d'une course quelconque de la plateforme.
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "errands", filter: "status=eq.open" },
        () => load()
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, acces.marcheOuvert, load]);

  // Tant que le barème n'est pas lu, le hook rend son repli. Envoyer une offre
  // pendant cette fenêtre la ferait passer sous un plancher plus élevé, et le
  // client se verrait de nouveau facturer le minimum du barème réel au lieu du
  // prix annoncé. On attend donc de savoir avant d'autoriser.
  const offreInvalide = baremeEnCours
    ? "Barème en cours de chargement, un instant."
    : messageOffreInvalide(price, rule.minServiceFee);

  const sendOffer = async () => {
    if (!target || !user) return;
    if (offreInvalide) return toast.error(offreInvalide);
    setSending(true);
    const { error } = await supabase.from("errand_offers").insert({
      errand_id: target.id,
      runner_id: user.id,
      price: Number(price),
      eta_minutes: Number(eta) || 60,
      message: msg.trim() || null,
    });
    setSending(false);
    if (error) {
      // 23505 : l'offre existe déjà. La liste peut avoir vieilli entre deux
      // chargements, le shopper n'a pas à lire le nom de la contrainte.
      if (error.code === "23505") {
        toast.error("Vous avez déjà envoyé une offre pour cette mission.");
        setTarget(null);
        return load();
      }
      return toast.error(error.message);
    }
    toast.success("Offre envoyée");
    setTarget(null);
    setPrice(""); setMsg("");
    load();
  };

  if (!user)
    return (
      <div className="akw-container py-10 text-center text-sm">
        <Link className="text-primary" to="/auth?redirect=/courses/shopper">Connectez-vous</Link> pour accéder à l'espace shopper.
      </div>
    );

  if (acces.candidature)
    return (
      <div className="akw-container max-w-xl py-10 text-center">
        <h1 className="font-display text-2xl font-semibold">Espace shopper</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vous devez être un shopper validé pour voir les missions.
        </p>
        <Button asChild className="mt-4"><Link to="/courses/devenir-shopper">Candidater</Link></Button>
      </div>
    );

  return (
    <div className="akw-container max-w-4xl py-6">
      <p className="akw-eyebrow">Espace shopper</p>
      <h1 className="font-display text-2xl font-semibold">Missions</h1>

      {acces.bandeau && (
        <div className="mt-4 rounded-2xl border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
          {acces.bandeau}
        </div>
      )}

      {messageErreur && (
        <div className="mt-4 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Les missions n'ont pas pu être chargées.</p>
          <p className="mt-1 text-muted-foreground">{messageErreur}</p>
        </div>
      )}

      <Tabs value={onglet} onValueChange={setOnglet} className="mt-4">
        <TabsList>
          <TabsTrigger value="open">Ouvertes ({open.length})</TabsTrigger>
          <TabsTrigger value="mine">Mes missions ({mine.length})</TabsTrigger>
        </TabsList>
        <TabsContent value="open">
          <ul className="mt-3 space-y-2">
            {open.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {acces.marcheOuvert
                  ? "Aucune mission ouverte pour l'instant."
                  : "Le marché ouvert est réservé aux shoppers validés."}
              </p>
            )}
            {open.map((m) => (
              <CarteMission
                key={m.id}
                mission={m}
                avecOffre
                offreEnvoyee={offresEnvoyees.has(m.id)}
                onProposer={(mission) => {
                  setTarget(mission); setPrice(""); setEta("60"); setMsg("");
                }}
              />
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="mine">
          <ul className="mt-3 space-y-2">
            {mine.length === 0 && <p className="text-sm text-muted-foreground">Pas encore de mission assignée.</p>}
            {mine.map((m) => <CarteMission key={m.id} mission={m} />)}
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
              {offreInvalide && (
                <p className={`mt-1 text-xs ${price.trim() ? "text-destructive" : "text-muted-foreground"}`}>
                  {offreInvalide}
                </p>
              )}
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
            <Button onClick={sendOffer} disabled={sending || !!offreInvalide}>
              {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

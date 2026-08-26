import { Link } from "react-router-dom";
import { ArrowRight, Banknote, Receipt, ShieldCheck, Wallet, Truck, Clock } from "lucide-react";
import {
  RUNNER_ADVANCE_CAP,
  VEHICLE_OPTIONS,
  VOLUME_OPTIONS,
  URGENCY_OPTIONS,
} from "@/modules/errands/pricing";
import { useCommissionRule } from "@/modules/errands/application/useCommissionRule";
import { usePricingGrid } from "@/modules/errands/application/usePricingGrid";
import { formatFcfa } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

const STEPS = [
  {
    n: 1,
    title: "Vous décrivez la course",
    text: "Liste des articles, quartier, véhicule souhaité, volume, urgence. Vous voyez immédiatement les frais de service, pas le prix des achats, qu'on ne peut pas deviner.",
  },
  {
    n: 2,
    title: "Un shopper vérifié accepte",
    text: "Il propose son prix et son délai. Vous choisissez. Chat, appel et visio s'ouvrent dans l'application.",
  },
  {
    n: 3,
    title: "L'argent des achats",
    text: "Vous envoyez le budget estimé sur le compte Wave / Orange Money du shopper affiché dans la fiche, puis vous déposez la capture. Le shopper ne part qu'une fois l'avance confirmée.",
  },
  {
    n: 4,
    title: "Il fait la course, vous suivez",
    text: "Photos en rayon, échanges au marché pour choisir, ajustements en direct si un article manque.",
  },
  {
    n: 5,
    title: "Reçu + régularisation au franc près",
    text: "Le shopper saisit le montant réel des achats et photographie le reçu. Si ça dépasse l'avance, vous complétez ; si c'est moins, il vous rend la différence. Aucune commission sur les achats.",
  },
  {
    n: 6,
    title: "Livraison et code de remise",
    text: "Il vous livre, confie à un livreur, ou vous passez récupérer. Vous donnez le code à 4 chiffres : la course est clôturée et le shopper est crédité.",
  },
];

export default function HowItWorksPage() {
  // Cette page publie la grille tarifaire. Elle doit donc lire celle qui est
  // réellement appliquée, pas une copie figée dans le code.
  const { grille } = usePricingGrid();

  usePageTitle("Comment ça marche", "Le fonctionnement du service Akwaba Shopper.");
  // Le mode de règlement décide de ce qui est vrai du paiement du shopper. Le
  // lire ici évite que cette page promette un portefeuille crédité pendant que
  // l'écran du portefeuille annonce le contraire au même shopper.
  const { rule } = useCommissionRule();
  const reglementDirect = rule.settlement === "direct";
  return (
    <div className="akw-container py-6 lg:py-8">
      <header className="rounded-3xl bg-editorial px-6 py-8 text-background sm:px-10">
        <p className="akw-eyebrow text-background/70">Akwaba Courses · Transparence totale</p>
        <h1 className="mt-2 max-w-2xl font-display text-2xl font-semibold leading-tight sm:text-3xl">
          Qui paie quoi, quand, et comment le shopper touche son argent.
        </h1>
        <p className="mt-3 max-w-2xl text-sm text-background/85">
          Deux flux d'argent, jamais mélangés : l'argent des <strong>achats</strong> (100 % pour le
          marchand) et les <strong>frais de service</strong> (la rémunération du shopper + notre
          commission).
        </p>
      </header>

      {/* Les deux enveloppes */}
      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-card p-5">
          <Banknote className="h-6 w-6 text-primary" />
          <h2 className="mt-3 font-display text-lg font-semibold">1. L'argent des achats</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Personne ne connaît le prix exact au marché avant d'y être. Le montant que vous saisissez
            à la commande est donc une <strong>estimation</strong>, pas un paiement.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            <li>• Vous transférez l'estimation au shopper (Wave, OM, MoMo, Moov) et déposez la preuve.</li>
            <li>• Il achète, garde le reçu, saisit le montant réel dans l'application.</li>
            <li>• Écart positif : vous complétez. Écart négatif : il vous rembourse à la remise.</li>
            <li>• Shopper vérifié : il peut avancer jusqu'à {formatFcfa(RUNNER_ADVANCE_CAP)} et vous remboursez à la livraison.</li>
            <li className="font-medium text-foreground">• Akwaba ne prend aucune commission sur cette enveloppe.</li>
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <Wallet className="h-6 w-6 text-primary" />
          <h2 className="mt-3 font-display text-lg font-semibold">2. Les frais de service</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            C'est le seul montant calculé par Akwaba. Il est connu <strong>avant</strong> de commander.
          </p>
          <ul className="mt-3 space-y-2 text-sm">
            {/* Les chiffres viennent du barème publié. Les écrire ici les
                figerait, et cette page annoncerait un tarif que le serveur
                n'applique plus dès la première révision. */}
            <li>
              • Base véhicule + distance + temps au-delà de{" "}
              {grille ? `${grille.freeMinutes} min (${grille.perMinute} FCFA/min)` : "…"}.
            </li>
            <li>• Supplément volume et urgence, remise si vous récupérez vous-même.</li>
            <li>
              • Minimum {grille ? formatFcfa(grille.commission.minServiceFee) : "…"}.
            </li>
            <li>
              • Commission Akwaba :{" "}
              {grille ? `${Math.round(grille.commission.rate * 100)} %` : "…"}, le reste va au
              shopper.
            </li>
            <li>• Pourboire possible : 100 % pour le shopper.</li>
          </ul>
        </div>
      </section>

      {/* Grille tarifaire */}
      <section className="mt-6 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Grille tarifaire</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          <div>
            <p className="akw-eyebrow flex items-center gap-1 text-muted-foreground"><Truck className="h-3.5 w-3.5" /> Véhicule</p>
            <ul className="mt-2 space-y-1 text-sm">
              {VEHICLE_OPTIONS.filter((v) => v.value !== "any").map((v) => (
                <li key={v.value} className="flex justify-between gap-3">
                  <span>{v.emoji} {v.label}</span>
                  <span className="text-muted-foreground">
                    {grille?.vehicles[v.value]
                      ? `${grille.vehicles[v.value].base} + ${grille.vehicles[v.value].perKm}/km`
                      : "…"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="akw-eyebrow text-muted-foreground">Volume</p>
            <ul className="mt-2 space-y-1 text-sm">
              {VOLUME_OPTIONS.map((v) => (
                <li key={v.value} className="flex justify-between gap-3">
                  <span>{v.label}</span>
                  <span className="text-muted-foreground">
                    {grille ? `+${grille.volume[v.value] ?? 0}` : "…"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="akw-eyebrow flex items-center gap-1 text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Urgence</p>
            <ul className="mt-2 space-y-1 text-sm">
              {URGENCY_OPTIONS.map((v) => (
                <li key={v.value} className="flex justify-between gap-3">
                  <span>{v.label}</span>
                  <span className="text-muted-foreground">
                    {grille ? `+${grille.urgency[v.value] ?? 0}` : "…"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Parcours */}
      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">Le déroulé, étape par étape</h2>
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-border bg-card p-4">
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-primary">
                {s.n}
              </span>
              <p className="mt-2 text-sm font-semibold">{s.title}</p>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Paiement du shopper */}
      <section className="mt-6 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="mt-2 font-display text-lg font-semibold">Comment le shopper est payé</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            {reglementDirect ? (
              <>
                {/* Le barème en vigueur règle en direct : la plateforme ne
                    détient aucun gain. Décrire ici un portefeuille crédité, un
                    délai de maturation et un retrait contredirait mot pour mot
                    ce que l'écran du portefeuille annonce au même shopper. */}
                <li>1. Le client règle le shopper directement, à la remise ou par mobile money.</li>
                <li>2. La plateforme ne détient aucun de ces gains : rien ne transite par elle.</li>
                <li>3. En contrepartie, la commission Akwaba reste due par le shopper, et son montant s'affiche dans son portefeuille.</li>
                <li>4. Le pourboire lui revient en entier, sans commission.</li>
                <li>5. L'argent des achats est réglé directement entre client et shopper, il n'est jamais commissionné.</li>
              </>
            ) : (
              <>
                <li>1. À la clôture de la course, sa part des frais de service (+ pourboire) est créditée sur son <strong className="text-foreground">portefeuille Akwaba</strong>.</li>
                <li>2. Le solde devient disponible après {rule.holdHours} h (délai anti-litige).</li>
                <li>3. Il demande un retrait dès {formatFcfa(rule.minPayout)} vers son compte Wave / OM / MoMo / Moov.</li>
                <li>4. Virements traités chaque jour ouvré ; référence de transfert visible dans l'historique.</li>
                <li>5. L'argent des achats ne transite jamais par le portefeuille : il est réglé directement entre client et shopper.</li>
              </>
            )}
          </ul>
        </div>
        <div className="rounded-2xl border border-border bg-muted/30 p-5">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h2 className="mt-2 font-display text-lg font-semibold">Vos garanties</h2>
          <ul className="mt-2 space-y-2 text-sm text-muted-foreground">
            <li>• Identité du shopper vérifiée avant sa première mission.</li>
            <li>• Reçu photographié obligatoire pour valider les achats.</li>
            <li>• Code de remise à 4 chiffres : rien n'est clôturé sans votre accord.</li>
            <li>• Litige : la course passe en statut « litige », le portefeuille du shopper est gelé sur cette course.</li>
            <li>• Historique complet des transferts, exportable.</li>
          </ul>
        </div>
      </section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Link
          to="/courses/nouvelle"
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          Commander une course <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          to="/courses/devenir-shopper"
          className="inline-flex items-center gap-2 rounded-full border border-border px-5 py-2.5 text-sm font-medium"
        >
          Devenir shopper
        </Link>
      </div>
    </div>
  );
}

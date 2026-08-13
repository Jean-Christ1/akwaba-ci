import { Link } from "react-router-dom";
import { ArrowRight, ShoppingBasket, Bike, Hammer, Store, ShieldCheck, Wallet } from "lucide-react";
import { CATEGORIES } from "@/modules/errands/domain";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

const PILLARS = [
  {
    to: "/courses/nouvelle",
    icon: ShoppingBasket,
    title: "Faire faire mes courses",
    text: "Un shopper vérifié va au marché, au supermarché ou à la pharmacie pour vous. Vous suivez en direct, par chat ou appel.",
    cta: "Commander une course",
  },
  {
    to: "/courses/shopper",
    icon: Bike,
    title: "Devenir shopper",
    text: "Gagnez un revenu en réalisant des courses près de chez vous. Missions ouvertes, paiement sécurisé.",
    cta: "Voir les missions",
  },
  {
    to: "/partner/signup",
    icon: Store,
    title: "Marchands & établissements",
    text: "Boutiques, maquis, hôtels, supermarchés : référencez-vous et recevez des commandes.",
    cta: "Inscrire mon commerce",
  },
  {
    to: "/courses/nouvelle?category=artisan",
    icon: Hammer,
    title: "Artisans & services",
    text: "Plombier, électricien, couturier, coiffure à domicile : demandez une intervention en 2 minutes.",
    cta: "Demander un artisan",
  },
];

const TRUST = [
  { icon: ShieldCheck, title: "Shoppers vérifiés", text: "Identité contrôlée, notation après chaque mission." },
  { icon: Wallet, title: "Paiement local", text: "Wave, Orange Money, MTN MoMo, Moov, espèces ou carte." },
  { icon: Bike, title: "Suivi en direct", text: "Chat temps réel, appel, WhatsApp et facture détaillée." },
];

export default function ServicesHubPage() {
  usePageTitle("Services", "Les services Akwaba, dont Akwaba Shopper.");
  return (
    <div className="akw-container py-6 lg:py-8">
      <header className="rounded-3xl bg-editorial px-6 py-8 text-background sm:px-10">
        <p className="akw-eyebrow text-background/70">Akwaba Services · Côte d'Ivoire</p>
        <h1 className="mt-2 max-w-2xl font-display text-2xl font-semibold leading-tight sm:text-3xl lg:text-4xl">
          Tout ce dont vous avez besoin, quelqu'un le fait pour vous.
        </h1>
        <p className="mt-3 max-w-xl text-sm text-background/85">
          Courses, marché, pharmacie, démarches, artisans, livraison. Vous commandez, un shopper de
          confiance s'en occupe, vous payez en ligne. Simple, traçable, ivoirien.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            to="/courses/nouvelle"
            className="inline-flex items-center gap-2 rounded-full bg-background px-5 py-2.5 text-sm font-semibold text-foreground"
          >
            Commander une course <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/courses/devenir-shopper"
            className="inline-flex items-center gap-2 rounded-full border border-background/40 px-5 py-2.5 text-sm font-medium text-background"
          >
            Devenir shopper
          </Link>
        </div>
      </header>

      <section className="mt-6 grid gap-3 sm:grid-cols-2">
        {PILLARS.map(({ to, icon: Icon, title, text, cta }) => (
          <Link
            key={to}
            to={to}
            className="group rounded-2xl border border-border bg-card p-5 transition-colors hover:border-primary/40"
          >
            <Icon className="h-6 w-6 text-primary" />
            <h2 className="mt-3 font-display text-lg font-semibold">{title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{text}</p>
            <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary">
              {cta} <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </section>

      <section className="mt-6">
        <h2 className="font-display text-lg font-semibold">Que peut-on vous faire faire ?</h2>
        <div className="scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((c) => (
            <Link
              key={c.value}
              to={`/courses/nouvelle?category=${c.value}`}
              className="flex min-w-[150px] flex-col rounded-2xl border border-border bg-card px-4 py-3 transition-colors hover:border-primary/40"
            >
              <span className="text-xl">{c.emoji}</span>
              <span className="mt-1 text-sm font-medium">{c.label}</span>
              <span className="text-xs text-muted-foreground">{c.hint}</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-3 sm:grid-cols-3">
        {TRUST.map(({ icon: Icon, title, text }) => (
          <div key={title} className="rounded-2xl border border-border bg-muted/30 p-4">
            <Icon className="h-5 w-5 text-primary" />
            <p className="mt-2 text-sm font-semibold">{title}</p>
            <p className="text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

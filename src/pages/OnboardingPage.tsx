import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Compass, Map, Sparkles } from "lucide-react";
import { Logo } from "@/shared/ui/Logo";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "akwaba.onboarded.v1";

const STEPS = [
  {
    icon: Sparkles,
    eyebrow: "Bienvenue",
    title: "La Côte d'Ivoire, sélectionnée pour vous",
    body: "Une équipe locale visite, vérifie et choisit chaque adresse. Pas un annuaire — une sélection.",
  },
  {
    icon: Map,
    eyebrow: "Se repérer",
    title: "Trouver son chemin, sans stress",
    body: "Carte interactive, itinéraires clairs, contact WhatsApp direct avec les établissements.",
  },
  {
    icon: Compass,
    eyebrow: "Vivre",
    title: "Des parcours prêts à vivre",
    body: "48h à Abidjan, week-end à Assinie, journée à Bassam : suivez le fil, gardez votre énergie.",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(0);
  const navigate = useNavigate();

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY)) {
      navigate("/", { replace: true });
    }
  }, [navigate]);

  const finish = () => {
    try { localStorage.setItem(STORAGE_KEY, "1"); } catch {}
    navigate("/", { replace: true });
  };

  const current = STEPS[step];
  const Icon = current.icon;
  const isLast = step === STEPS.length - 1;

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="akw-container flex items-center justify-between py-5">
        <Logo />
        <button onClick={finish} className="text-sm text-muted-foreground hover:text-foreground">
          Passer
        </button>
      </header>

      <main className="akw-container flex flex-1 flex-col justify-center py-8">
        <div className="mx-auto w-full max-w-md text-center animate-fade-in" key={step}>
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-primary">
            <Icon className="h-7 w-7" />
          </div>
          <p className="akw-eyebrow mt-6">{current.eyebrow}</p>
          <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-balance sm:text-4xl">
            {current.title}
          </h1>
          <p className="mt-4 text-base text-muted-foreground text-pretty">{current.body}</p>
        </div>
      </main>

      <footer className="akw-container space-y-5 py-8">
        <div className="flex items-center justify-center gap-2">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === step ? "w-8 bg-primary" : "w-1.5 bg-border"
              )}
            />
          ))}
        </div>
        <button
          onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
          className="mx-auto flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-primary px-6 py-4 text-sm font-semibold text-primary-foreground"
        >
          {isLast ? "Commencer l'exploration" : "Continuer"}
          <ArrowRight className="h-4 w-4" />
        </button>
        <p className="text-center text-xs text-muted-foreground">
          <Link to="/" onClick={finish} className="underline-offset-2 hover:underline">
            Aller directement à l'accueil
          </Link>
        </p>
      </footer>
    </div>
  );
}

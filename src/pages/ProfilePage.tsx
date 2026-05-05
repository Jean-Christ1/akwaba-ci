import { Link } from "react-router-dom";
import { Globe, HelpCircle, LogIn, Settings, Bell } from "lucide-react";
import { Logo } from "@/shared/ui/Logo";

export default function ProfilePage() {
  return (
    <div className="bg-background">
      <section className="border-b border-border/60 bg-card">
        <div className="akw-container py-8">
          <p className="akw-eyebrow mb-2">Profil</p>
          <h1 className="font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Votre espace Akwaba
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Connectez-vous pour synchroniser vos favoris, vos demandes et vos parcours sur tous vos appareils.
          </p>
        </div>
      </section>

      <section className="akw-container py-10 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          <Row icon={LogIn} label="Connexion" hint="Email · Google · WhatsApp" />
          <Row icon={Globe} label="Langue" hint="Français" right="FR · EN" />
          <Row icon={Bell} label="Notifications" hint="Recevoir les recommandations contextuelles" />
          <Row icon={Settings} label="Préférences" hint="Standing, budget, ambiance" />
          <Row icon={HelpCircle} label="Aide & support" hint="FAQ, signaler une fiche" />
        </div>

        <aside className="akw-card p-6">
          <Logo />
          <p className="akw-prose mt-4 text-sm">
            Akwaba est votre compagnon de voyage en Côte d'Ivoire. Tous nos lieux sont sélectionnés
            et vérifiés par une équipe locale. Aucune publicité dissimulée, aucune mise en avant
            cachée.
          </p>
          <Link
            to="/"
            className="mt-5 inline-block text-sm font-semibold text-primary hover:underline"
          >
            En savoir plus →
          </Link>
        </aside>
      </section>
    </div>
  );
}

function Row({
  icon: Icon,
  label,
  hint,
  right,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  right?: string;
}) {
  return (
    <button className="akw-card-hover flex w-full items-center gap-4 px-5 py-4 text-left">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-soft text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
      {right && <span className="text-xs font-medium text-muted-foreground">{right}</span>}
    </button>
  );
}

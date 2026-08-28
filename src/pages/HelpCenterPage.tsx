import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, LifeBuoy, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Article {
  slug: string;
  categorie: string;
  audience: string;
  question: string;
  reponse: string;
  lien_action: string | null;
  lien_libelle: string | null;
  position: number;
}

const AUDIENCES: { value: string; label: string }[] = [
  { value: "tous", label: "Tout" },
  { value: "client", label: "Je commande" },
  { value: "shopper", label: "Je fais les courses" },
];

/**
 * Le mode d'emploi interne ne s'affiche qu'à qui le tient.
 *
 * La base refuse déjà ces réponses aux autres : la politique de lecture les
 * réserve aux personnes habilitées. Cet onglet n'ajoute donc pas de protection,
 * il évite seulement de proposer un filtre qui ne ramènerait rien.
 */
const AUDIENCE_EXPLOITATION = { value: "exploitation", label: "Exploitation" };

/**
 * Enlève les accents pour comparer.
 *
 * Personne ne tape « périmée » avec son accent sur un clavier de téléphone. Une
 * recherche qui ne trouve pas « perimee » renvoie une page vide à quelqu'un qui
 * a pourtant écrit le bon mot.
 */
function sansAccent(texte: string): string {
  return texte.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Le centre d'aide.
 *
 * Il n'existait pas. Un client qui se demandait qui détient son argent, un
 * shopper qui voulait savoir quand il serait payé, un candidat bloqué sur sa
 * pièce d'identité : personne n'avait de réponse à leur donner, et le support
 * recevait la même question chaque semaine.
 *
 * Les réponses viennent de la base et non du code, parce qu'une réponse se
 * corrige plus souvent qu'on ne déploie, et parce qu'une réponse fausse doit
 * pouvoir être retirée tout de suite.
 */
export default function HelpCenterPage() {
  usePageTitle("Centre d'aide", "Les réponses aux questions que l'on nous pose.");

  const [articles, setArticles] = useState<Article[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");
  const [audience, setAudience] = useState("tous");
  const { peut } = useAuth();
  const onglets = peut("exploitation.sante")
    ? [...AUDIENCES, AUDIENCE_EXPLOITATION]
    : AUDIENCES;
  const [ouvert, setOuvert] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    supabase
      .from("help_articles")
      .select("slug,categorie,audience,question,reponse,lien_action,lien_libelle,position")
      .eq("publie", true)
      .order("position")
      .then(({ data, error }) => {
        if (annule) return;
        setChargement(false);
        if (error) return setErreur(error.message);
        setArticles((data ?? []) as Article[]);
      });
    return () => {
      annule = true;
    };
  }, []);

  const visibles = useMemo(() => {
    const q = sansAccent(recherche.trim());
    return articles.filter((a) => {
      // « tous » désigne une réponse qui vaut pour les deux côtés : elle
      // s'affiche quel que soit le filtre choisi.
      // « Tout » désigne ce qui s'adresse au public. Le mode d'emploi interne
      // ne s'y mêle pas : il noierait les réponses que l'on vient chercher.
      const pourMoi =
        audience === "exploitation"
          ? a.audience === "exploitation"
          : a.audience !== "exploitation" &&
            (audience === "tous" || a.audience === audience || a.audience === "tous");
      if (!pourMoi) return false;
      if (!q) return true;
      return sansAccent(`${a.question} ${a.reponse} ${a.categorie}`).includes(q);
    });
  }, [articles, recherche, audience]);

  const parCategorie = useMemo(() => {
    const groupes = new Map<string, Article[]>();
    for (const a of visibles) {
      const liste = groupes.get(a.categorie) ?? [];
      liste.push(a);
      groupes.set(a.categorie, liste);
    }
    return [...groupes.entries()];
  }, [visibles]);

  return (
    <div className="akw-container max-w-3xl py-8">
      <p className="akw-eyebrow flex items-center gap-1.5">
        <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
        Centre d'aide
      </p>
      <h1 className="mt-1 font-display text-3xl font-semibold text-balance">
        Les réponses aux questions que l'on nous pose
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Tout ce qui suit décrit ce que la plateforme fait réellement. Quand quelque chose n'existe
        pas encore, c'est écrit.
      </p>

      <div className="relative mt-5">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="min-h-[48px] pl-9"
          placeholder="Chercher une question"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          aria-label="Chercher dans le centre d'aide"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {onglets.map((a) => (
          <button
            key={a.value}
            type="button"
            onClick={() => setAudience(a.value)}
            aria-pressed={audience === a.value}
            className={`min-h-[44px] rounded-full border px-4 text-sm transition-colors ${
              audience === a.value
                ? "border-primary bg-primary-soft text-primary"
                : "border-border hover:border-primary/40"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {chargement ? (
        <p className="mt-8 text-sm text-muted-foreground">Chargement des réponses…</p>
      ) : erreur ? (
        <div className="mt-8 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Les réponses n'ont pas pu être chargées.</p>
          <p className="mt-1 text-muted-foreground">{erreur}</p>
        </div>
      ) : visibles.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm text-muted-foreground">
            Aucune réponse ne correspond à « {recherche} ».
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            Si votre question porte sur une course en cours, ouvrez-la et décrivez le problème :
            c'est le chemin le plus court pour qu'un modérateur la voie.
          </p>
          <Link className="mt-3 inline-block text-sm text-primary" to="/courses">
            Voir mes courses
          </Link>
        </div>
      ) : (
        parCategorie.map(([categorie, liste]) => (
          <section key={categorie} className="mt-8">
            <h2 className="font-display text-lg font-semibold">{categorie}</h2>
            <ul className="mt-3 space-y-2">
              {liste.map((a) => {
                const affiche = ouvert === a.slug;
                return (
                  <li key={a.slug} className="rounded-2xl border border-border bg-card">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                      aria-expanded={affiche}
                      onClick={() => setOuvert(affiche ? null : a.slug)}
                    >
                      <span className="text-sm font-medium">{a.question}</span>
                      <span
                        aria-hidden="true"
                        className={`shrink-0 text-muted-foreground transition-transform ${
                          affiche ? "rotate-90" : ""
                        }`}
                      >
                        <ArrowRight className="h-4 w-4" />
                      </span>
                    </button>
                    {affiche && (
                      <div className="border-t border-border/60 px-4 py-3">
                        <p className="text-sm leading-relaxed text-muted-foreground text-pretty">
                          {a.reponse}
                        </p>
                        {a.lien_action && (
                          <Link
                            className="mt-3 inline-flex min-h-[44px] items-center text-sm font-medium text-primary"
                            to={a.lien_action}
                          >
                            {a.lien_libelle ?? "Y aller"}
                          </Link>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      <section className="mt-10 rounded-2xl border border-border bg-card p-5">
        <h2 className="font-display text-lg font-semibold">Vous n'avez pas trouvé ?</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Si votre question porte sur une course, ouvrez-la et décrivez ce qui s'est passé : un
          modérateur voit le dossier complet, avec les preuves déjà déposées. C'est plus rapide et
          plus sûr qu'un message hors contexte.
        </p>
        <Link className="mt-3 inline-block text-sm text-primary" to="/courses">
          Voir mes courses
        </Link>
      </section>
    </div>
  );
}

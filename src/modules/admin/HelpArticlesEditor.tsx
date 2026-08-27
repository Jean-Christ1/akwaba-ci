import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";

interface Article {
  slug: string;
  categorie: string;
  audience: string;
  question: string;
  reponse: string;
  lien_action: string | null;
  lien_libelle: string | null;
  publie: boolean;
  position: number;
}

const VIDE: Article = {
  slug: "",
  categorie: "",
  audience: "tous",
  question: "",
  reponse: "",
  lien_action: null,
  lien_libelle: null,
  publie: true,
  position: 100,
};

const AUDIENCES = [
  { value: "tous", label: "Tout le monde" },
  { value: "client", label: "Client" },
  { value: "shopper", label: "Shopper" },
  { value: "partenaire", label: "Partenaire" },
];

/**
 * Fabrique un identifiant lisible à partir d'une question.
 *
 * Le serveur n'accepte que des minuscules, des chiffres et des tirets. Laisser
 * quelqu'un le saisir à la main produirait des refus incompréhensibles au
 * moment d'enregistrer, après avoir écrit toute la réponse.
 */
export function slugDepuisQuestion(question: string): string {
  return question
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/**
 * Tenir le centre d'aide.
 *
 * Les réponses vivent en base parce qu'une réponse se corrige bien plus
 * souvent qu'on ne déploie, et parce qu'une réponse fausse doit pouvoir être
 * retirée tout de suite. Encore fallait-il un écran pour le faire : la table
 * et la fonction existaient, mais corriger une phrase demandait toujours un
 * développeur.
 *
 * Dépublier plutôt que supprimer : une réponse retirée peut avoir été citée à
 * un client, et il vaut mieux pouvoir la relire que d'avoir à la reconstituer.
 */
export function HelpArticlesEditor() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [brouillon, setBrouillon] = useState<Article | null>(null);
  const [recherche, setRecherche] = useState("");
  const [chargement, setChargement] = useState(true);
  const [busy, setBusy] = useState(false);
  const [jePeux, setJePeux] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    const [{ data }, { data: droits }] = await Promise.all([
      supabase
        .from("help_articles")
        .select("slug,categorie,audience,question,reponse,lien_action,lien_libelle,publie,position")
        .order("position"),
      supabase.rpc("my_permissions"),
    ]);
    setArticles((data ?? []) as Article[]);
    setJePeux(((droits as string[]) ?? []).includes("aide.gerer"));
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const visibles = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) =>
      [a.question, a.reponse, a.categorie, a.slug].some((v) => v.toLowerCase().includes(q))
    );
  }, [articles, recherche]);

  const categories = useMemo(
    () => [...new Set(articles.map((a) => a.categorie))].sort(),
    [articles]
  );

  const enregistrer = async () => {
    if (!brouillon) return;
    const slug = brouillon.slug || slugDepuisQuestion(brouillon.question);
    if (slug.length < 3) {
      return toast.error("La question est trop courte pour en tirer un identifiant.");
    }

    setBusy(true);
    const { error } = await supabase.rpc("help_article_upsert", {
      p_slug: slug,
      p_categorie: brouillon.categorie.trim(),
      p_audience: brouillon.audience,
      p_question: brouillon.question.trim(),
      p_reponse: brouillon.reponse.trim(),
      p_lien_action: brouillon.lien_action?.trim() || undefined,
      p_lien_libelle: brouillon.lien_libelle?.trim() || undefined,
      p_publie: brouillon.publie,
      p_position: brouillon.position,
    });
    setBusy(false);

    if (error) return toast.error(error.message);
    toast.success(brouillon.publie ? "Réponse publiée." : "Réponse enregistrée, non publiée.");
    setBrouillon(null);
    void charger();
  };

  const basculer = async (a: Article) => {
    const { error } = await supabase.rpc("help_article_upsert", {
      p_slug: a.slug,
      p_categorie: a.categorie,
      p_audience: a.audience,
      p_question: a.question,
      p_reponse: a.reponse,
      p_lien_action: a.lien_action ?? undefined,
      p_lien_libelle: a.lien_libelle ?? undefined,
      p_publie: !a.publie,
      p_position: a.position,
    });
    if (error) return toast.error(error.message);
    toast.success(a.publie ? "Réponse retirée du centre d'aide." : "Réponse publiée.");
    void charger();
  };

  if (chargement) return null;

  return (
    <section className="mt-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold">Centre d'aide</h2>
        <span className="text-xs text-muted-foreground">
          {articles.filter((a) => a.publie).length} publiée(s) sur {articles.length}
        </span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Une réponse fausse est pire que pas de réponse : elle se retire d'un clic, sans
        déploiement. Ne décrivez que ce que la plateforme fait réellement.
      </p>

      {!jePeux && (
        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Vous consultez ces réponses sans pouvoir les modifier : le droit de tenir le centre
          d'aide ne vous est pas accordé.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            className="min-h-[44px] pl-9"
            placeholder="Chercher une réponse"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            aria-label="Chercher une réponse"
          />
        </div>
        <Button
          className="min-h-[44px]"
          disabled={!jePeux}
          onClick={() => setBrouillon({ ...VIDE, categorie: categories[0] ?? "" })}
        >
          <Plus className="mr-1.5 h-4 w-4" aria-hidden="true" />
          Nouvelle réponse
        </Button>
      </div>

      {brouillon && (
        <div className="mt-4 rounded-2xl border border-primary/40 bg-primary-soft/30 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="aide-categorie">
                Catégorie
              </Label>
              <Input
                id="aide-categorie"
                className="mt-1 min-h-[44px]"
                list="aide-categories"
                value={brouillon.categorie}
                onChange={(e) => setBrouillon({ ...brouillon, categorie: e.target.value })}
              />
              <datalist id="aide-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div>
              <Label className="text-xs" htmlFor="aide-audience">
                À qui la réponse s'adresse
              </Label>
              <select
                id="aide-audience"
                className="mt-1 min-h-[44px] w-full rounded-md border border-input bg-background px-3 text-sm"
                value={brouillon.audience}
                onChange={(e) => setBrouillon({ ...brouillon, audience: e.target.value })}
              >
                {AUDIENCES.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <Label className="text-xs" htmlFor="aide-question">
              Question
            </Label>
            <Input
              id="aide-question"
              className="mt-1 min-h-[44px]"
              value={brouillon.question}
              onChange={(e) => setBrouillon({ ...brouillon, question: e.target.value })}
            />
          </div>

          <div className="mt-3">
            <Label className="text-xs" htmlFor="aide-reponse">
              Réponse
            </Label>
            <Textarea
              id="aide-reponse"
              className="mt-1"
              rows={6}
              value={brouillon.reponse}
              onChange={(e) => setBrouillon({ ...brouillon, reponse: e.target.value })}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs" htmlFor="aide-lien">
                Lien vers l'écran qui permet d'agir
              </Label>
              <Input
                id="aide-lien"
                className="mt-1 min-h-[44px]"
                placeholder="/courses/nouvelle"
                value={brouillon.lien_action ?? ""}
                onChange={(e) => setBrouillon({ ...brouillon, lien_action: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs" htmlFor="aide-lien-libelle">
                Texte du lien
              </Label>
              <Input
                id="aide-lien-libelle"
                className="mt-1 min-h-[44px]"
                placeholder="Publier une course"
                value={brouillon.lien_libelle ?? ""}
                onChange={(e) => setBrouillon({ ...brouillon, lien_libelle: e.target.value })}
              />
            </div>
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button className="min-h-[44px]" disabled={busy} onClick={() => void enregistrer()}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              Publier
            </Button>
            <Button
              variant="outline"
              className="min-h-[44px]"
              disabled={busy}
              onClick={() => {
                setBrouillon({ ...brouillon, publie: false });
                void enregistrer();
              }}
            >
              Enregistrer sans publier
            </Button>
            <Button variant="ghost" className="min-h-[44px]" onClick={() => setBrouillon(null)}>
              Annuler
            </Button>
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {visibles.map((a) => (
          <li key={a.slug} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.question}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {a.categorie} · {AUDIENCES.find((x) => x.value === a.audience)?.label ?? a.audience}
                  {!a.publie && " · non publiée"}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-[44px]"
                  disabled={!jePeux}
                  onClick={() => setBrouillon(a)}
                >
                  Modifier
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="min-h-[44px]"
                  disabled={!jePeux}
                  onClick={() => void basculer(a)}
                >
                  {a.publie ? "Retirer" : "Publier"}
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HelpArticlesEditor;

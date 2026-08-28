import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

interface Majoration {
  id: string;
  city_slug: string | null;
  multiplicateur: number;
  motif: string;
  debut: string;
  fin: string;
  actif: boolean;
}

interface Ville {
  slug: string;
  name: string;
}

const NIVEAUX = [
  { value: "1.2", label: "+20 %" },
  { value: "1.3", label: "+30 %" },
  { value: "1.5", label: "+50 %" },
  { value: "1.75", label: "+75 %" },
  { value: "2", label: "Double" },
];

const DUREES = [
  { value: "60", label: "1 heure" },
  { value: "120", label: "2 heures" },
  { value: "240", label: "4 heures" },
  { value: "480", label: "8 heures" },
];

/**
 * La majoration exceptionnelle.
 *
 * Un soir de pluie à Abidjan, les courses s'accumulent et aucun shopper ne les
 * prend. Le barème est le même à quinze heures et à vingt-deux heures un jour
 * d'orage, et un shopper n'a aucune raison de préférer le second.
 *
 * Trois choses à savoir avant d'en ouvrir une.
 *
 * Le supplément revient entièrement au shopper. La commission d'Akwaba se
 * calcule sur le tarif d'avant majoration : la faire porter sur le supplément
 * reviendrait à s'enrichir d'une pénurie.
 *
 * Le motif est montré au client avant qu'il ne commande. Écrivez-le comme il le
 * lira, pas comme une note interne.
 *
 * Elle a toujours une fin, et ne dépasse jamais le double. Une majoration sans
 * terme est une hausse de tarif déguisée : elle mérite alors de passer par le
 * barème, où elle se voit.
 */
export function MajorationEditor() {
  const [majorations, setMajorations] = useState<Majoration[]>([]);
  const [villes, setVilles] = useState<Ville[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enCours, setEnCours] = useState(false);
  const [niveau, setNiveau] = useState("1.3");
  const [duree, setDuree] = useState("120");
  const [ville, setVille] = useState("");
  const [motif, setMotif] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    const [m, v] = await Promise.all([
      supabase
        .from("pricing_surges")
        .select("id, city_slug, multiplicateur, motif, debut, fin, actif")
        .order("debut", { ascending: false })
        .limit(20),
      supabase.from("service_cities").select("slug, name").order("position"),
    ]);
    setMajorations((m.data ?? []) as Majoration[]);
    setVilles((v.data ?? []) as Ville[]);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const ouvrir = async () => {
    if (motif.trim().length < 10) {
      toast.error("Écrivez le motif que le client va lire, en une phrase.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("surge_ouvrir", {
      p_multiplicateur: Number(niveau),
      p_motif: motif.trim(),
      p_minutes: Number(duree),
      p_city_slug: ville || null,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Majoration ouverte. Elle s'arrêtera d'elle-même.");
    setMotif("");
    await charger();
  };

  const arreter = async (id: string) => {
    setEnCours(true);
    const { error } = await supabase.rpc("surge_arreter", { p_id: id });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Majoration arrêtée.");
    await charger();
  };

  if (chargement) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </section>
    );
  }

  const enCoursActuel = majorations.filter((m) => m.actif && new Date(m.fin) > new Date());
  const passees = majorations.filter((m) => !enCoursActuel.includes(m));

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
        <h2 className="text-sm font-semibold">Majoration exceptionnelle</h2>
      </header>
      <p className="mt-1 text-xs text-muted-foreground">
        Le supplément revient entièrement au shopper : la commission d'Akwaba se calcule
        sur le tarif d'avant majoration. Le motif est montré au client avant qu'il ne
        commande.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-xs">Niveau</Label>
          <Select value={niveau} onValueChange={setNiveau}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {NIVEAUX.map((n) => (
                <SelectItem key={n.value} value={n.value}>
                  {n.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Durée</Label>
          <Select value={duree} onValueChange={setDuree}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DUREES.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Ville</Label>
          <Select value={ville} onValueChange={(v) => setVille(v === "*" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Partout" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="*">Partout</SelectItem>
              {villes.map((v) => (
                <SelectItem key={v.slug} value={v.slug}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs" htmlFor="motif-majoration">
            Motif lu par le client
          </Label>
          <Input
            id="motif-majoration"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Orage sur Abidjan, peu de shoppers disponibles"
          />
        </div>
      </div>

      <Button className="mt-3" size="sm" onClick={() => void ouvrir()} disabled={enCours}>
        {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
        Ouvrir la majoration
      </Button>

      {enCoursActuel.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">En cours</h3>
          <ul className="mt-2 space-y-2">
            {enCoursActuel.map((m) => (
              <li
                key={m.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-accent bg-accent/20 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium">
                    +{Math.round((Number(m.multiplicateur) - 1) * 100)} %{" "}
                    {m.city_slug
                      ? `· ${villes.find((v) => v.slug === m.city_slug)?.name ?? m.city_slug}`
                      : "· partout"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {m.motif} · jusqu'à{" "}
                    {new Date(m.fin).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void arreter(m.id)}
                  disabled={enCours}
                >
                  Arrêter
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {passees.length > 0 && (
        <div className="mt-4">
          <h3 className="text-sm font-semibold">Passées ({passees.length})</h3>
          <ul className="mt-2 space-y-1">
            {passees.slice(0, 8).map((m) => (
              <li key={m.id} className="text-[11px] text-muted-foreground">
                {new Date(m.debut).toLocaleDateString("fr-FR")} · +
                {Math.round((Number(m.multiplicateur) - 1) * 100)} %{" "}
                {m.city_slug ?? "partout"} · {m.motif}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export default MajorationEditor;

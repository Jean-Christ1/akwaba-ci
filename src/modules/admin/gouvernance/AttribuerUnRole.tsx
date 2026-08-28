import { useState } from "react";
import { Loader2, MapPin, ShieldCheck } from "lucide-react";
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

import type { Role } from "./types";

interface Ville {
  slug: string;
  name: string;
}

interface Proprietes {
  roles: Role[];
  villes: Ville[];
  onChange: () => void;
}

const DUREES = [
  { value: "", label: "Sans terme" },
  { value: "7", label: "7 jours" },
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
  { value: "180", label: "6 mois" },
];

/**
 * Confier un rôle, éventuellement pour une ville et pour un temps.
 *
 * Deux choix par défaut ont été renversés ici, parce qu'ils coûtaient cher sans
 * qu'on s'en aperçoive. Une attribution valait partout : un responsable recruté
 * pour ouvrir Bouaké recevait Abidjan avec. Et elle valait pour toujours : un
 * droit prêté le temps d'un congé restait ouvert des années.
 *
 * Le serveur refuse ce qu'il doit refuser, et cet écran ne le remplace pas. On
 * n'attribue pas un rôle plus étendu que le sien, ni un rôle qui ouvrirait des
 * droits qu'on n'a pas soi-même, ni un rôle à soi-même.
 */
export function AttribuerUnRole({ roles, villes, onChange }: Proprietes) {
  const [identifiant, setIdentifiant] = useState("");
  const [role, setRole] = useState("");
  const [ville, setVille] = useState("");
  const [duree, setDuree] = useState("");
  const [motif, setMotif] = useState("");
  const [enCours, setEnCours] = useState(false);

  const choisi = roles.find((r) => r.code === role);

  const attribuer = async (accorder: boolean) => {
    const id = identifiant.trim();
    if (!/^[0-9a-f-]{36}$/i.test(id)) {
      toast.error("Indiquez l'identifiant du compte, tel qu'il apparaît dans la recherche.");
      return;
    }
    if (!role) {
      toast.error("Choisissez le rôle à confier.");
      return;
    }
    setEnCours(true);
    const { error } = await supabase.rpc("staff_assign_role", {
      p_user_id: id,
      p_role_code: role,
      p_accorder: accorder,
      p_scope_value: ville || null,
      p_jours: duree ? Number(duree) : null,
      p_motif: motif.trim() || null,
    });
    setEnCours(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(accorder ? "Rôle confié." : "Rôle retiré.");
    setMotif("");
    onChange();
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-4">
      <header className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Confier un rôle</h3>
      </header>

      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="sm:col-span-2">
          <Label className="text-xs" htmlFor="qui">
            Identifiant du compte
          </Label>
          <Input
            id="qui"
            value={identifiant}
            onChange={(e) => setIdentifiant(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="font-mono text-xs"
          />
        </div>

        <div>
          <Label className="text-xs">Rôle</Label>
          <Select value={role} onValueChange={setRole}>
            <SelectTrigger>
              <SelectValue placeholder="Choisir" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.code} value={r.code}>
                  {r.libelle} · {r.droits} droits
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
          <Label className="text-xs">Durée</Label>
          <Select value={duree} onValueChange={(v) => setDuree(v === "*" ? "" : v)}>
            <SelectTrigger>
              <SelectValue placeholder="Sans terme" />
            </SelectTrigger>
            <SelectContent>
              {DUREES.map((d) => (
                <SelectItem key={d.value || "*"} value={d.value || "*"}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="sm:col-span-2 lg:col-span-3">
          <Label className="text-xs" htmlFor="motif">
            Motif (conservé dans le journal)
          </Label>
          <Input
            id="motif"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex : ouverture de Bouaké, remplacement pendant un congé"
          />
        </div>
      </div>

      {choisi?.description && (
        <p className="mt-2 text-xs text-muted-foreground">{choisi.description}</p>
      )}
      {ville && (
        <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" aria-hidden="true" />
          Les droits restreignables de ce rôle ne vaudront que pour cette ville. Les autres
          valent partout.
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void attribuer(true)} disabled={enCours}>
          {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
          Confier
        </Button>
        <Button size="sm" variant="outline" onClick={() => void attribuer(false)} disabled={enCours}>
          Retirer
        </Button>
      </div>
    </section>
  );
}

export default AttribuerUnRole;

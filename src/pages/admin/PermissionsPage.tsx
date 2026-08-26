import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Minus, Search, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

interface Droit {
  code: string;
  categorie: string;
  libelle: string;
  description: string;
  sensible: boolean;
  position: number;
}

interface Role {
  code: string;
  libelle: string;
  description: string;
  systeme: boolean;
  position: number;
}

interface Attribution {
  user_id: string;
  role_code: string;
  granted_at: string;
}

interface Exception {
  user_id: string;
  permission_code: string;
  accorde: boolean;
  motif: string | null;
}

/**
 * La matrice des droits d'accès.
 *
 * La plateforme reconnaissait quatre rôles. Un seul d'entre eux ouvrait, du
 * même geste, la lecture des pièces d'identité, l'approbation des retraits et
 * la publication des tarifs. Confier la trésorerie à quelqu'un revenait à lui
 * confier aussi les identités des shoppers.
 *
 * Cet écran montre ce que chaque rôle porte réellement, et permet d'attribuer
 * un rôle ou de faire une exception nominative. Il ne décide de rien : le
 * serveur refuse ce qu'il doit refuser, et cet écran ne fait que le rendre
 * lisible. Une case cochée ici n'ouvre aucun accès par elle-même.
 */
export default function PermissionsPage() {
  const { loading } = useAuth();
  const [droits, setDroits] = useState<Droit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [matrice, setMatrice] = useState<{ role_code: string; permission_code: string }[]>([]);
  const [attributions, setAttributions] = useState<Attribution[]>([]);
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [mesDroits, setMesDroits] = useState<string[]>([]);
  const [recherche, setRecherche] = useState("");
  const [chargement, setChargement] = useState(true);
  const [identifiant, setIdentifiant] = useState("");

  const charger = useCallback(async () => {
    setChargement(true);
    const [d, r, m, a, e, p] = await Promise.all([
      supabase.from("permissions").select("*").order("position"),
      supabase.from("staff_roles").select("*").order("position"),
      supabase.from("role_permissions").select("role_code,permission_code"),
      supabase.from("staff_assignments").select("user_id,role_code,granted_at"),
      supabase.from("user_permissions").select("user_id,permission_code,accorde,motif"),
      supabase.rpc("my_permissions"),
    ]);
    setDroits((d.data ?? []) as Droit[]);
    setRoles((r.data ?? []) as Role[]);
    setMatrice(m.data ?? []);
    setAttributions((a.data ?? []) as Attribution[]);
    setExceptions((e.data ?? []) as Exception[]);
    setMesDroits((p.data as string[]) ?? []);
    setChargement(false);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const jePeuxAttribuer = mesDroits.includes("roles.attribuer");

  const porte = useMemo(() => {
    const s = new Set<string>();
    for (const l of matrice) s.add(`${l.role_code}|${l.permission_code}`);
    return s;
  }, [matrice]);

  const parCategorie = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    const visibles = q
      ? droits.filter((d) =>
          [d.code, d.libelle, d.description, d.categorie].some((v) => v.toLowerCase().includes(q))
        )
      : droits;
    const groupes = new Map<string, Droit[]>();
    for (const d of visibles) {
      const liste = groupes.get(d.categorie) ?? [];
      liste.push(d);
      groupes.set(d.categorie, liste);
    }
    return [...groupes.entries()];
  }, [droits, recherche]);

  const attribuer = async (roleCode: string, accorder: boolean) => {
    const cible = identifiant.trim();
    if (!cible) {
      return toast.error("Indiquez l'identifiant du compte concerné.");
    }
    const { error } = await supabase.rpc("staff_assign_role", {
      p_user_id: cible,
      p_role_code: roleCode,
      p_accorder: accorder,
    });
    if (error) return toast.error(error.message);
    toast.success(accorder ? "Rôle attribué." : "Rôle retiré.");
    void charger();
  };

  if (loading || chargement) return null;

  // Le catalogue est lisible par tout compte connecté : savoir qu'un droit
  // existe ne donne rien. Ce qui est réservé, c'est de pouvoir l'attribuer.
  if (droits.length === 0) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        Aucun catalogue de droits n'est publié.{" "}
        <Link className="text-primary" to="/admin">
          Retour à la console
        </Link>
      </div>
    );
  }

  return (
    <div className="akw-container max-w-6xl py-6">
      <p className="akw-eyebrow">Back-office</p>
      <h1 className="font-display text-2xl font-semibold">Droits d'accès</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {droits.length} droits, {roles.length} rôles. Un droit se demande par ce qu'il permet, pas
        par le titre de celui qui le porte.
      </p>

      {!jePeuxAttribuer && (
        <p className="mt-3 rounded-xl bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          Vous consultez cette matrice sans pouvoir la modifier : le droit d'attribuer les rôles ne
          vous est pas accordé.
        </p>
      )}

      <div className="relative mt-4 max-w-md">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          className="min-h-[44px] pl-9"
          placeholder="Rechercher un droit"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          aria-label="Rechercher un droit"
        />
      </div>

      {/* La matrice tient rarement dans la largeur d'un telephone : elle defile
          dans son propre cadre, sans faire defiler la page. */}
      <div className="mt-4 overflow-x-auto rounded-2xl border border-border bg-card">
        <table className="w-full min-w-[52rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="sticky left-0 z-10 bg-card px-4 py-3 text-left font-medium">Droit</th>
              {roles.map((r) => (
                <th key={r.code} className="px-2 py-3 text-center align-bottom">
                  <span className="block text-xs font-medium" title={r.description}>
                    {r.libelle}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parCategorie.map(([categorie, liste]) => (
              <>
                <tr key={categorie} className="bg-muted/40">
                  <td
                    className="px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                    colSpan={roles.length + 1}
                  >
                    {categorie}
                  </td>
                </tr>
                {liste.map((d) => (
                  <tr key={d.code} className="border-b border-border/60">
                    <td className="sticky left-0 z-10 bg-card px-4 py-2">
                      <span className="flex items-center gap-1.5">
                        {d.sensible && (
                          <ShieldAlert
                            className="h-3.5 w-3.5 shrink-0 text-destructive"
                            aria-label="Droit sensible"
                          />
                        )}
                        <span className="font-medium">{d.libelle}</span>
                      </span>
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">
                        {d.description}
                      </span>
                      <code className="mt-0.5 block text-[10px] text-muted-foreground">{d.code}</code>
                    </td>
                    {roles.map((r) => (
                      <td key={r.code} className="px-2 py-2 text-center">
                        {porte.has(`${r.code}|${d.code}`) ? (
                          <Check
                            className="mx-auto h-4 w-4 text-primary"
                            aria-label={`${r.libelle} porte ce droit`}
                          />
                        ) : (
                          <Minus
                            className="mx-auto h-3 w-3 text-muted-foreground/40"
                            aria-label={`${r.libelle} ne porte pas ce droit`}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Attribuer un rôle</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          L'attribution est inscrite au journal d'audit : donner un rôle, c'est ouvrir un accès, et
          l'on doit pouvoir dire qui l'a ouvert.
        </p>
        <Input
          className="mt-3 min-h-[44px] max-w-md font-mono text-xs"
          placeholder="Identifiant du compte (uuid)"
          value={identifiant}
          onChange={(e) => setIdentifiant(e.target.value)}
          aria-label="Identifiant du compte"
          disabled={!jePeuxAttribuer}
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {roles.map((r) => (
            <div key={r.code} className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                className="min-h-[44px]"
                disabled={!jePeuxAttribuer}
                onClick={() => void attribuer(r.code, true)}
              >
                {r.libelle}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="min-h-[44px] px-2 text-xs"
                disabled={!jePeuxAttribuer}
                onClick={() => void attribuer(r.code, false)}
                aria-label={`Retirer ${r.libelle}`}
              >
                retirer
              </Button>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <h2 className="font-display text-lg font-semibold">Attributions en cours</h2>
        {attributions.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Aucun rôle d'exploitation n'est attribué.
          </p>
        ) : (
          <ul className="mt-2 space-y-1 text-sm">
            {attributions.map((a) => (
              <li key={`${a.user_id}|${a.role_code}`} className="flex flex-wrap gap-2">
                <code className="text-xs text-muted-foreground">{a.user_id}</code>
                <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary">
                  {roles.find((r) => r.code === a.role_code)?.libelle ?? a.role_code}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  depuis le {new Date(a.granted_at).toLocaleDateString("fr-FR")}
                </span>
              </li>
            ))}
          </ul>
        )}

        {exceptions.length > 0 && (
          <>
            <h3 className="mt-4 text-sm font-semibold">Exceptions nominatives</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Un retrait nominatif l'emporte sur le rôle. C'est le sens d'une exception, et c'est le
              sens prudent.
            </p>
            <ul className="mt-2 space-y-1 text-sm">
              {exceptions.map((e) => (
                <li key={`${e.user_id}|${e.permission_code}`} className="flex flex-wrap gap-2">
                  <code className="text-xs text-muted-foreground">{e.user_id}</code>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] ${
                      e.accorde ? "bg-primary-soft text-primary" : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {e.accorde ? "accordé" : "retiré"} : {e.permission_code}
                  </span>
                  {e.motif && <span className="text-[11px] text-muted-foreground">{e.motif}</span>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { KeyRound, Loader2, MapPin, Search, ShieldAlert } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { AttribuerUnRole } from "@/modules/admin/gouvernance/AttribuerUnRole";
import { DroitDetail } from "@/modules/admin/gouvernance/DroitDetail";
import { DroitsDUnePersonne } from "@/modules/admin/gouvernance/DroitsDUnePersonne";
import { MatriceDesDroits } from "@/modules/admin/gouvernance/MatriceDesDroits";
import { Reconciliation } from "@/modules/admin/gouvernance/Reconciliation";
import type { Attribution, Droit, Role } from "@/modules/admin/gouvernance/types";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

interface Ville {
  slug: string;
  name: string;
}

/**
 * La gouvernance des accès.
 *
 * L'écran montrait la matrice, et c'était déjà mieux que rien. Il ne répondait
 * pas aux trois questions qu'un responsable se pose vraiment.
 *
 * Que permet ce droit, et surtout où s'arrête-t-il ? Un droit dont on ignore
 * les limites s'accorde à l'aveugle, et la description ne disait jamais ce
 * qu'il ne couvrait pas.
 *
 * D'où vient le droit de cette personne ? Sans la réponse, le retirer se
 * faisait à tâtons : on retirait le rôle, la personne gardait le droit.
 *
 * Et ce que la plateforme affirme est-il vrai ? Elle énonce que l'accès vient
 * de la matrice, alors qu'un rôle hérité posé sur le compte ouvre tout sans y
 * figurer. Rien ne comparait les deux.
 *
 * Cet écran ne décide de rien. Le serveur refuse ce qu'il doit refuser, et
 * chaque geste ici laisse une trace nominative.
 */
export default function PermissionsPage() {
  usePageTitle("Gouvernance des accès", "Qui peut quoi, d'où cela vient, et ce qui reste à trancher.");

  const { loading, droits: mesDroits } = useAuth();
  const [catalogue, setCatalogue] = useState<Droit[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [villes, setVilles] = useState<Ville[]>([]);
  const [attributions, setAttributions] = useState<Attribution[]>([]);
  const [recherche, setRecherche] = useState("");
  const [ouvert, setOuvert] = useState<Droit | null>(null);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);

  const charger = useCallback(async () => {
    setChargement(true);
    const [d, r, v, a] = await Promise.all([
      supabase.rpc("catalogue_des_droits"),
      supabase.rpc("catalogue_des_roles"),
      supabase.from("service_cities").select("slug, name").order("position"),
      supabase
        .from("staff_assignments")
        .select("user_id, role_code, scope_type, scope_value, expire_le, motif, granted_at")
        .order("granted_at", { ascending: false }),
    ]);
    setChargement(false);
    if (d.error) {
      setErreur(d.error.message);
      return;
    }
    setErreur(null);
    setCatalogue((d.data ?? []) as unknown as Droit[]);
    setRoles((r.data ?? []) as unknown as Role[]);
    setVilles((v.data ?? []) as Ville[]);
    setAttributions((a.data ?? []) as unknown as Attribution[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const filtres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return catalogue;
    return catalogue.filter((d) =>
      [d.code, d.libelle, d.description ?? "", d.ne_permet_pas ?? "", d.categorie].some((v) =>
        v.toLowerCase().includes(q)
      )
    );
  }, [catalogue, recherche]);

  const restreintes = attributions.filter((a) => a.scope_type === "ville");
  const aTerme = attributions.filter((a) => a.expire_le);
  const jePeuxAttribuer = mesDroits.includes("roles.attribuer");

  if (loading || chargement) {
    return (
      <div className="akw-container py-10 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </div>
    );
  }

  if (erreur) {
    return (
      <div className="akw-container py-10 text-center text-sm text-muted-foreground">
        {erreur}{" "}
        <Link className="text-primary" to="/admin">
          Retour à la console
        </Link>
      </div>
    );
  }

  const sensibles = catalogue.filter((d) => d.sensible).length;

  return (
    <div className="akw-container py-6 lg:py-8">
      <header>
        <p className="akw-eyebrow text-muted-foreground">Administration</p>
        <h1 className="font-display text-2xl font-semibold">Gouvernance des accès</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {catalogue.length} droits dont {sensibles} sensibles, {roles.length} rôles,{" "}
          {attributions.length} attribution{attributions.length > 1 ? "s" : ""} en cours.
        </p>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 sm:max-w-sm">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Chercher un droit"
            className="pl-9"
            aria-label="Chercher un droit"
          />
        </div>
        {!jePeuxAttribuer && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />
            Lecture seule : vous n'avez pas le droit d'attribuer.
          </p>
        )}
      </div>

      <Tabs defaultValue="matrice" className="mt-4">
        <TabsList>
          <TabsTrigger value="matrice">Matrice</TabsTrigger>
          <TabsTrigger value="personne">Droits d'une personne</TabsTrigger>
          <TabsTrigger value="perimetres">Périmètres</TabsTrigger>
          <TabsTrigger value="reconciliation">Réconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="matrice" className="mt-4">
          <MatriceDesDroits
            droits={filtres}
            roles={roles}
            onOuvrir={setOuvert}
            recherche={recherche}
          />
        </TabsContent>

        <TabsContent value="personne" className="mt-4 space-y-4">
          {jePeuxAttribuer && (
            <AttribuerUnRole roles={roles} villes={villes} onChange={charger} />
          )}
          <DroitsDUnePersonne mesDroits={mesDroits} />
        </TabsContent>

        <TabsContent value="perimetres" className="mt-4 space-y-4">
          <p className="text-xs text-muted-foreground">
            Une attribution vaut partout et pour toujours par défaut. Les deux se
            restreignent : un responsable recruté pour ouvrir une ville n'a pas besoin des
            autres, et un droit prêté le temps d'un congé devrait se refermer seul.
          </p>

          <section>
            <h3 className="text-sm font-semibold">
              Restreintes à une ville ({restreintes.length})
            </h3>
            {restreintes.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Aucune attribution n'est restreinte. Tout le personnel voit toutes les villes.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {restreintes.map((a) => (
                  <li
                    key={`${a.user_id}-${a.role_code}-${a.scope_value}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {a.user_id.slice(0, 8)}
                    </span>
                    <span className="text-sm">
                      {roles.find((r) => r.code === a.role_code)?.libelle ?? a.role_code}
                    </span>
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <MapPin className="h-3 w-3" aria-hidden="true" />
                      {villes.find((v) => v.slug === a.scope_value)?.name ?? a.scope_value}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h3 className="text-sm font-semibold">Avec une échéance ({aTerme.length})</h3>
            {aTerme.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Aucune attribution n'a de terme. Chacune restera ouverte jusqu'à ce que
                quelqu'un pense à la retirer.
              </p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {aTerme.map((a) => (
                  <li
                    key={`${a.user_id}-${a.role_code}-terme`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {a.user_id.slice(0, 8)}
                    </span>
                    <span className="text-sm">
                      {roles.find((r) => r.code === a.role_code)?.libelle ?? a.role_code}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      jusqu'au{" "}
                      {a.expire_le
                        ? new Date(a.expire_le).toLocaleDateString("fr-FR")
                        : "sans terme"}
                      {a.motif && ` · ${a.motif}`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>

        <TabsContent value="reconciliation" className="mt-4">
          <Reconciliation />
        </TabsContent>
      </Tabs>

      <DroitDetail droit={ouvert} roles={roles} onFermer={() => setOuvert(null)} />

      <p className="mt-6 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <KeyRound className="h-3 w-3" aria-hidden="true" />
        Chaque attribution et chaque retrait laisse une trace nominative et datée dans le
        journal d'audit.
      </p>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Building2, Copy, LogIn, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { formatFcfa, STATUS_LABEL, statusTone, type ErrandStatus } from "@/modules/errands/domain";
import {
  chargerMembres,
  useOrganisations,
  type CourseOrganisation,
  type OrganisationMembre,
  type OrgRole,
} from "@/modules/organisations/application/useOrganisations";
import { usePageTitle } from "@/shared/hooks/usePageTitle";

const LIBELLE_ROLE: Record<OrgRole, string> = {
  owner: "Propriétaire",
  manager: "Responsable",
  member: "Membre",
};

/** Les rôles qui gèrent : voir le code, retirer un membre, le renouveler. */
export function gereLOrganisation(role: OrgRole | undefined): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Les comptes entreprises.
 *
 * Un hôtel, un bureau, un commerce commandent tous les jours, mais chacun sous
 * son propre compte : la direction ne voit rien et l'historique se disperse.
 * Cet écran rassemble l'organisation, ses membres et ses courses.
 *
 * Le paiement n'y change rien : chaque course reste réglée par la personne qui
 * l'a demandée. La facturation groupée dépend du prestataire de paiement, qui
 * n'est pas choisi, et cet écran ne prétend pas le contraire.
 */
export default function OrganisationsPage() {
  usePageTitle("Mon organisation", "Commandez à plusieurs, suivez tout au même endroit.");
  const { user } = useAuth();
  const { organisations, roles, chargement, erreur, recharger } = useOrganisations(user?.id);

  const [nom, setNom] = useState("");
  const [courriel, setCourriel] = useState("");
  const [telephone, setTelephone] = useState("");
  const [codeSaisi, setCodeSaisi] = useState("");
  const [busy, setBusy] = useState(false);

  const [choisie, setChoisie] = useState<string | null>(null);
  const [membres, setMembres] = useState<OrganisationMembre[]>([]);
  const [courses, setCourses] = useState<CourseOrganisation[]>([]);
  const [codeAdhesion, setCodeAdhesion] = useState<string | null>(null);

  const active = organisations.find((o) => o.id === choisie) ?? organisations[0] ?? null;
  const monRole = active ? roles[active.id] : undefined;

  const chargerDetail = useCallback(async () => {
    if (!active) {
      setMembres([]);
      setCourses([]);
      setCodeAdhesion(null);
      return;
    }
    const [listeMembres, { data: listeCourses }] = await Promise.all([
      chargerMembres(active.id),
      supabase.rpc("organisation_errands", { p_org: active.id }),
    ]);
    setMembres(listeMembres);
    setCourses((listeCourses ?? []) as CourseOrganisation[]);

    if (gereLOrganisation(roles[active.id])) {
      const { data } = await supabase.rpc("organisation_join_code", { p_org: active.id });
      setCodeAdhesion(typeof data === "string" ? data : null);
    } else {
      setCodeAdhesion(null);
    }
  }, [active, roles]);

  useEffect(() => {
    void chargerDetail();
  }, [chargerDetail]);

  const creer = async () => {
    if (nom.trim().length < 2) return toast.error("Donnez un nom à votre organisation.");
    setBusy(true);
    const { error } = await supabase.rpc("organisation_create", {
      p_name: nom.trim(),
      p_contact_email: courriel.trim() || undefined,
      p_contact_phone: telephone.trim() || undefined,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    setNom("");
    setCourriel("");
    setTelephone("");
    toast.success("Organisation créée. Partagez son code pour que vos collègues la rejoignent.");
    void recharger();
  };

  const rejoindre = async () => {
    if (!codeSaisi.trim()) return toast.error("Saisissez le code que votre organisation vous a donné.");
    setBusy(true);
    const { error } = await supabase.rpc("organisation_join", { p_code: codeSaisi.trim() });
    setBusy(false);
    if (error) return toast.error(error.message);
    setCodeSaisi("");
    toast.success("Vous avez rejoint l'organisation.");
    void recharger();
  };

  const renouveler = async () => {
    if (!active) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("organisation_rotate_join_code", { p_org: active.id });
    setBusy(false);
    if (error) return toast.error(error.message);
    setCodeAdhesion(typeof data === "string" ? data : null);
    toast.success("Nouveau code. L'ancien ne fonctionne plus.");
  };

  const retirer = async (membre: OrganisationMembre) => {
    if (!active) return;
    setBusy(true);
    const { error } = await supabase.rpc("organisation_remove_member", {
      p_org: active.id,
      p_user: membre.user_id,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${membre.nom} ne fait plus partie de l'organisation.`);
    void recharger();
    void chargerDetail();
  };

  const copier = async (valeur: string) => {
    try {
      await navigator.clipboard.writeText(valeur);
      toast.success("Code copié.");
    } catch {
      toast.error("Copie impossible sur cet appareil.");
    }
  };

  if (!user) {
    return (
      <div className="akw-container max-w-xl py-12 text-center">
        <h1 className="font-display text-2xl font-semibold">Mon organisation</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connectez-vous pour créer une organisation ou rejoindre celle de votre employeur.
        </p>
        <Button asChild className="mt-4 min-h-[44px]">
          <Link to="/auth?redirect=/organisation">Se connecter</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="akw-container max-w-4xl py-6">
      <p className="akw-eyebrow">Akwaba Entreprises</p>
      <h1 className="font-display text-2xl font-semibold">Mon organisation</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted-foreground text-pretty">
        Plusieurs personnes commandent, un seul historique. Chaque course reste réglée par celui qui
        la demande, comme aujourd'hui.
      </p>

      {chargement ? (
        <p className="mt-6 text-sm text-muted-foreground">Chargement…</p>
      ) : erreur ? (
        <div className="mt-6 rounded-2xl border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <p className="font-medium text-destructive">Vos organisations n'ont pas pu être chargées.</p>
          <p className="mt-1 text-muted-foreground">{erreur}</p>
          <Button size="sm" variant="outline" className="mt-3 min-h-[44px]" onClick={() => void recharger()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          {organisations.length > 1 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {organisations.map((o) => (
                <Button
                  key={o.id}
                  size="sm"
                  className="min-h-[44px]"
                  variant={active?.id === o.id ? "default" : "outline"}
                  onClick={() => setChoisie(o.id)}
                >
                  {o.name}
                </Button>
              ))}
            </div>
          )}

          {active ? (
            <section className="mt-4 rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
                    <h2 className="font-display text-xl font-semibold">{active.name}</h2>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Vous y êtes {LIBELLE_ROLE[monRole ?? "member"].toLowerCase()} ·{" "}
                    {membres.length} membre{membres.length > 1 ? "s" : ""}
                  </p>
                </div>
                <Button asChild size="sm" className="min-h-[44px]">
                  <Link to="/courses/nouvelle">Demander une course</Link>
                </Button>
              </div>

              {/* Le code fait entrer dans l'organisation : il n'est montré qu'à
                  ceux qui la gèrent, et il se renouvelle quand il a trop circulé. */}
              {gereLOrganisation(monRole) && codeAdhesion && (
                <div className="mt-4 rounded-xl border border-border bg-background p-3">
                  <p className="text-xs text-muted-foreground">Code d'adhésion</p>
                  <p className="mt-1 font-display text-lg font-semibold tracking-[0.2em]">
                    {codeAdhesion}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      onClick={() => void copier(codeAdhesion)}
                    >
                      <Copy className="mr-1.5 h-4 w-4" aria-hidden="true" /> Copier
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="min-h-[44px]"
                      disabled={busy}
                      onClick={() => void renouveler()}
                    >
                      <RefreshCw className="mr-1.5 h-4 w-4" aria-hidden="true" /> Renouveler
                    </Button>
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Renouveler coupe l'ancien code : ceux qui l'avaient ne pourront plus s'en servir.
                  </p>
                </div>
              )}

              <h3 className="mt-5 flex items-center gap-2 text-sm font-semibold">
                <Users className="h-4 w-4" aria-hidden="true" /> Membres
              </h3>
              <ul className="mt-2 space-y-2">
                {membres.map((m) => (
                  <li
                    key={m.user_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-sm"
                  >
                    <span>
                      {m.nom}
                      <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                        {LIBELLE_ROLE[m.role]}
                      </span>
                    </span>
                    {gereLOrganisation(monRole) && m.user_id !== user.id && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="min-h-[44px]"
                        disabled={busy}
                        onClick={() => void retirer(m)}
                        aria-label={`Retirer ${m.nom} de l'organisation`}
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>

              <h3 className="mt-5 text-sm font-semibold">Courses de l'organisation</h3>
              {courses.length === 0 ? (
                <p className="mt-2 rounded-xl border border-dashed border-border p-3 text-sm text-muted-foreground">
                  Aucune course rattachée pour l'instant. Au moment de demander une course, choisissez
                  cette organisation pour qu'elle apparaisse ici.
                </p>
              ) : (
                <ul className="mt-2 space-y-2">
                  {courses.map((c) => (
                    <li key={c.id} className="rounded-xl border border-border px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium">{c.title}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] ${statusTone(c.status as ErrandStatus)}`}>
                          {STATUS_LABEL[c.status as ErrandStatus]}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {c.zone ? `${c.zone}, ` : ""}
                        {c.city} · demandée par {c.demandeur} ·{" "}
                        {new Date(c.created_at).toLocaleDateString("fr-FR")} ·{" "}
                        {formatFcfa(c.total_amount || c.service_fee)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ) : (
            <p className="mt-4 rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
              Vous n'appartenez à aucune organisation. Créez la vôtre, ou rejoignez celle de votre
              employeur avec le code qu'il vous a donné.
            </p>
          )}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <Plus className="h-4 w-4 text-primary" aria-hidden="true" /> Créer une organisation
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Vous en devenez propriétaire et recevez le code à partager.
              </p>
              <div className="mt-3 space-y-2">
                <div>
                  <Label className="text-xs" htmlFor="org-nom">Nom</Label>
                  <Input
                    id="org-nom"
                    className="mt-1 min-h-[44px]"
                    value={nom}
                    maxLength={120}
                    placeholder="Hôtel des Palmiers"
                    onChange={(e) => setNom(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="org-courriel">Adresse électronique (facultatif)</Label>
                  <Input
                    id="org-courriel"
                    type="email"
                    className="mt-1 min-h-[44px]"
                    value={courriel}
                    onChange={(e) => setCourriel(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs" htmlFor="org-tel">Téléphone (facultatif)</Label>
                  <Input
                    id="org-tel"
                    type="tel"
                    inputMode="tel"
                    className="mt-1 min-h-[44px]"
                    value={telephone}
                    onChange={(e) => setTelephone(e.target.value)}
                  />
                </div>
              </div>
              <Button className="mt-3 min-h-[44px] w-full" disabled={busy} onClick={() => void creer()}>
                Créer l'organisation
              </Button>
            </section>

            <section className="rounded-2xl border border-border bg-card p-5">
              <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
                <LogIn className="h-4 w-4 text-primary" aria-hidden="true" /> Rejoindre par code
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Votre employeur vous donne un code. Les espaces et les minuscules n'ont pas
                d'importance.
              </p>
              <div className="mt-3">
                <Label className="text-xs" htmlFor="org-code">Code d'adhésion</Label>
                <Input
                  id="org-code"
                  className="mt-1 min-h-[44px] tracking-[0.2em]"
                  value={codeSaisi}
                  maxLength={32}
                  placeholder="A1B2C3D4E5F6"
                  onChange={(e) => setCodeSaisi(e.target.value)}
                />
              </div>
              <Button
                variant="outline"
                className="mt-3 min-h-[44px] w-full"
                disabled={busy}
                onClick={() => void rejoindre()}
              >
                Rejoindre
              </Button>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

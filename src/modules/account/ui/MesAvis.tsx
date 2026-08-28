import { useCallback, useEffect, useState } from "react";
import { BellRing, CheckCheck, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

interface Avis {
  id: string;
  evenement: string;
  sujet: string;
  corps: string;
  errand_id: string | null;
  recu_le: string;
  lue_le: string | null;
}

/**
 * Les avis reçus dans l'application.
 *
 * L'écran des préférences propose « Dans l'application, aucun message envoyé au
 * dehors ». C'est aussi le dernier maillon du routage, celui qui ne peut pas
 * échouer : quand quelqu'un n'a ni numéro joignable ni adresse, le message
 * atterrit là.
 *
 * Il n'atterrissait nulle part. Le message partait bien dans la file d'envoi,
 * mais la file n'est lisible que du personnel, et aucun écran de l'application
 * ne la montrait. Quelqu'un qui choisissait ce canal ne recevait plus rien, et
 * l'application le lui avait pourtant proposé comme un choix légitime.
 *
 * Cet écran est la moitié manquante. Il ne montre que les avis internes du
 * compte connecté : le reste de la file porte des adresses et des numéros, et
 * ne le regarde pas.
 */
export function MesAvis() {
  const [avis, setAvis] = useState<Avis[]>([]);
  const [chargement, setChargement] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    setChargement(true);
    const { data, error } = await supabase.rpc("mes_avis", { p_limite: 30 });
    setChargement(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    setErreur(null);
    setAvis((data ?? []) as unknown as Avis[]);
  }, []);

  useEffect(() => {
    void charger();
  }, [charger]);

  const marquer = async (id: string | null) => {
    setEnCours(true);
    const { error } = await supabase.rpc("avis_marquer_lu", { p_id: id });
    setEnCours(false);
    if (error) {
      setErreur(error.message);
      return;
    }
    void charger();
  };

  const nonLus = avis.filter((a) => !a.lue_le).length;

  if (chargement) {
    return (
      <div className="py-8 text-center">
        <Loader2 className="mx-auto h-4 w-4 animate-spin text-muted-foreground" aria-label="Chargement" />
      </div>
    );
  }

  return (
    <section className="akw-card-hover rounded-2xl border border-border p-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 font-display text-lg font-semibold">
            <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
            Vos avis
            {nonLus > 0 && (
              <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                {nonLus}
              </span>
            )}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Les messages reçus dans l'application. Ils restent ici, rien n'est envoyé au
            dehors.
          </p>
        </div>
        {nonLus > 0 && (
          <Button size="sm" variant="outline" disabled={enCours} onClick={() => void marquer(null)}>
            {enCours && <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />}
            <CheckCheck className="mr-1 h-3 w-3" aria-hidden="true" />
            Tout marquer comme lu
          </Button>
        )}
      </header>

      {erreur && (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          {erreur}
        </p>
      )}

      {avis.length === 0 ? (
        <p className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Aucun avis pour l'instant. Ceux qui concernent vos courses arriveront ici si vous
          avez choisi d'être joint dans l'application.
        </p>
      ) : (
        <ul className="mt-3 space-y-2">
          {avis.map((a) => (
            <li
              key={a.id}
              className={`rounded-xl border p-3 ${
                a.lue_le ? "border-border" : "border-primary/30 bg-primary-soft"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.sujet}</p>
                  <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                    {a.corps}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {new Date(a.recu_le).toLocaleString("fr-FR", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                    {a.errand_id && (
                      <>
                        {" · "}
                        <Link className="text-primary" to={`/courses/${a.errand_id}`}>
                          Voir la course
                        </Link>
                      </>
                    )}
                  </p>
                </div>
                {!a.lue_le && (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={enCours}
                    onClick={() => void marquer(a.id)}
                  >
                    Marquer lu
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default MesAvis;

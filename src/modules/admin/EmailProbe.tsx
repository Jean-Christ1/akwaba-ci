import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

interface Resultat {
  status?: string;
  recipient?: string;
  detail?: string;
  provider_id?: string;
}

/**
 * Vérification du canal d'envoi.
 *
 * Une décision de modération part par courriel au partenaire. Quand ce courriel
 * ne part plus, la file continue de fonctionner et personne ne s'en aperçoit :
 * cette sonde permet de constater la panne avant qu'un partenaire attende une
 * réponse qui n'arrivera jamais.
 */
export function EmailProbe() {
  const [adresse, setAdresse] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultat, setResultat] = useState<Resultat | null>(null);

  const envoyer = async () => {
    if (!adresse) return;
    setBusy(true);
    setResultat(null);
    try {
      const { data, error } = await supabase.functions.invoke("test-email", {
        body: { recipient: adresse.trim() },
      });
      if (error) throw error;
      setResultat(data);
      const reponse = data as Resultat | null;
      const statut = reponse?.status;
      if (statut === "sent") toast.success(`Email envoyé à ${reponse?.recipient ?? "destinataire"}`);
      else if (statut === "failed") toast.error("Envoi échoué - voir les détails");
      else if (statut === "no_recipient") toast.warning("Adresse invalide");
      else if (statut === "not_configured") toast.warning("Connecteur Resend non configuré");
      else toast.info(`Statut : ${statut ?? "?"}`);
    } catch (e) {
      setResultat({ status: "failed", detail: e instanceof Error ? e.message : "Erreur inattendue" });
      toast.error(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Collapsible>
      <Card className="p-3">
        <CollapsibleTrigger className="flex w-full items-center justify-between text-sm font-medium">
          <span>Vérifier l'envoi d'email</span>
          <ChevronDown className="h-4 w-4" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-2 pt-3">
          <p className="text-xs text-muted-foreground">
            Envoie un email de test via Resend et affiche le statut.
          </p>
          <div className="flex flex-wrap gap-2">
            <Input
              type="email"
              placeholder="adresse@exemple.com"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              className="min-w-[220px] flex-1"
            />
            <Button onClick={envoyer} disabled={busy || !adresse}>
              {busy ? "Envoi…" : "Envoyer le test"}
            </Button>
          </div>
          {resultat && (
            <div className="rounded-md border bg-muted/30 p-2 text-xs">
              <div className="flex items-center gap-2">
                <Badge
                  variant={
                    resultat.status === "sent"
                      ? "default"
                      : resultat.status === "failed"
                        ? "destructive"
                        : "secondary"
                  }
                >
                  {resultat.status}
                </Badge>
                {resultat.recipient && (
                  <span className="text-muted-foreground">→ {resultat.recipient}</span>
                )}
              </div>
              {resultat.detail && (
                <p className="mt-1 break-all text-muted-foreground">{resultat.detail}</p>
              )}
              {resultat.provider_id && (
                <p className="mt-1 font-mono text-[10px]">id: {resultat.provider_id}</p>
              )}
            </div>
          )}
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}

export default EmailProbe;

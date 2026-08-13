import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/** Durée de vie du lien, en secondes. Alignée sur le dépôt des preuves. */
const DUREE_SIGNATURE = 300;

interface PrivateDocumentButtonProps {
  bucket: "errand-proofs" | "identity-docs";
  /** Clé d'objet enregistrée en base, jamais une URL publique. */
  path: string | null | undefined;
  label: string;
  /** Rappel affiché une fois le lien ouvert, quand le document est personnel. */
  notice?: string;
  /** Texte affiché lorsque aucun document n'a été déposé. */
  emptyLabel?: string;
}

/**
 * Ouverture d'un document stocké dans un bucket privé.
 *
 * Ces buckets ne servent aucun fichier par URL directe : la lecture passe par
 * une signature de courte durée, délivrée au vu du rôle de la personne
 * connectée. Sans ce passage, la modération tranche sans jamais voir la pièce
 * sur laquelle elle est censée se prononcer.
 */
export function PrivateDocumentButton({
  bucket,
  path,
  label,
  notice,
  emptyLabel = "Aucun document déposé",
}: PrivateDocumentButtonProps) {
  const [busy, setBusy] = useState(false);
  const [ouvert, setOuvert] = useState(false);

  if (!path) {
    return <span className="text-xs text-muted-foreground">{emptyLabel}</span>;
  }

  const ouvrir = async () => {
    setBusy(true);
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, DUREE_SIGNATURE);
    setBusy(false);
    if (error || !data) {
      return toast.error("Impossible d'ouvrir le document.");
    }
    setOuvert(true);
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  return (
    <div className="space-y-1">
      <Button size="sm" variant="outline" disabled={busy} onClick={ouvrir}>
        {busy ? "Ouverture..." : label}
      </Button>
      {ouvert && (
        <p className="text-[11px] text-muted-foreground">
          Lien valable cinq minutes, il expire automatiquement.
          {notice ? ` ${notice}` : ""}
        </p>
      )}
    </div>
  );
}

export default PrivateDocumentButton;

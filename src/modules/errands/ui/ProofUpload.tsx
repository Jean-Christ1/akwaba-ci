import { useRef, useState } from "react";
import { Camera, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { compresserImage, formaterOctets } from "@/shared/media/compresserImage";

const BUCKET = "errand-proofs";
const MAX_BYTES = 8 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

interface ProofUploadProps {
  errandId: string;
  kind: "receipt" | "advance";
  /** Chemin déjà enregistré, s'il existe. */
  existingPath?: string | null;
  /** Montant associé, transmis au serveur avec la preuve. */
  amount?: number;
  onUploaded?: () => void;
}

/**
 * Dépôt d'une preuve de course dans un bucket privé.
 *
 * Le fichier n'est jamais public : on stocke une clé d'objet, et la lecture
 * passe par une URL signée à durée courte, réservée aux parties de la course
 * et aux modérateurs.
 */
export function ProofUpload({
  errandId,
  kind,
  existingPath,
  amount,
  onUploaded,
}: ProofUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  const label = kind === "receipt" ? "Reçu des achats" : "Preuve de l'avance";

  const upload = async (fichierChoisi: File) => {
    if (!ACCEPTED.includes(fichierChoisi.type)) {
      return toast.error("Formats acceptés : JPEG, PNG, WebP ou PDF.");
    }

    setBusy(true);

    // La photo est réduite avant d'être envoyée. Un cliché de téléphone pèse
    // plusieurs mégaoctets, ce qui, sur un réseau mobile, se traduit par de
    // longues minutes d'attente ou un envoi qui se coupe en chemin. Un reçu n'a
    // besoin que d'être lisible.
    const { fichier: file, octetsAvant, octetsApres, compressee } =
      await compresserImage(fichierChoisi);

    if (file.size > MAX_BYTES) {
      setBusy(false);
      return toast.error("Fichier trop lourd, 8 Mo maximum même après réduction.");
    }

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${errandId}/${kind}-${Date.now()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });

    if (uploadError) {
      setBusy(false);
      return toast.error(uploadError.message);
    }

    const { error } = await supabase.rpc("errand_attach_proof", {
      p_errand_id: errandId,
      p_kind: kind,
      p_path: path,
      p_amount: amount ?? null,
    });

    setBusy(false);
    if (error) return toast.error(error.message);

    toast.success(
      compressee
        ? `${label} enregistré, ${formaterOctets(octetsAvant)} réduits à ${formaterOctets(octetsApres)}.`
        : `${label} enregistré.`
    );
    onUploaded?.();
  };

  const reveal = async () => {
    if (!existingPath) return;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(existingPath, 300);
    if (error) return toast.error("Impossible d'ouvrir le document.");
    setSignedUrl(data.signedUrl);
    window.open(data.signedUrl, "_blank", "noreferrer");
  };

  return (
    <div className="rounded-xl border border-border bg-background p-3">
      <p className="text-xs font-medium">{label}</p>

      {existingPath ? (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Document déposé</span>
          <Button size="sm" variant="outline" onClick={reveal}>
            Consulter
          </Button>
        </div>
      ) : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {kind === "receipt"
            ? "Photographiez le ticket de caisse. Il est obligatoire pour clôturer une course avec achats."
            : "Ajoutez la capture du transfert du budget d'achat."}
        </p>
      )}

      {/* Deux entrées distinctes : l'appareil photo, pour le shopper qui est
          devant la caisse, et la galerie, pour une capture d'écran de transfert
          déjà faite. L'attribut capture ouvre directement l'appareil au lieu du
          sélecteur de fichiers, ce qui épargne deux touchers à chaque preuve. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
          e.target.value = "";
        }}
      />

      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          size="sm"
          variant={existingPath ? "outline" : "default"}
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => cameraRef.current?.click()}
        >
          <Camera className="h-4 w-4" aria-hidden="true" />
          {busy ? "Envoi..." : "Photographier"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImageIcon className="h-4 w-4" aria-hidden="true" />
          Choisir
        </Button>
      </div>

      {signedUrl && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Lien valable cinq minutes, il expire automatiquement.
        </p>
      )}
    </div>
  );
}

export default ProofUpload;

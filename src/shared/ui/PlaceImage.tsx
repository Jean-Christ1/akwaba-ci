import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface PlaceImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  /** Chargée sans attendre pour la première image visible. */
  priority?: boolean;
}

/**
 * Image d'un lieu, avec repli.
 *
 * Une fiche du catalogue peut très bien ne pas avoir de photographie, ou en
 * référencer une devenue introuvable. Sans repli, la carte affiche alors une
 * zone vide qui casse la mise en page et donne l'impression d'un produit
 * défaillant. On préfère un aplat sobre portant le nom du lieu.
 */
export function PlaceImage({ src, alt, className, priority = false }: PlaceImageProps) {
  const [enEchec, setEnEchec] = useState(false);

  if (!src || enEchec) {
    return (
      <div
        role="img"
        aria-label={alt}
        className={cn(
          "flex items-center justify-center bg-primary-soft text-primary",
          className
        )}
      >
        <ImageIcon className="h-6 w-6 opacity-60" aria-hidden="true" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      // Le navigateur peut réserver la place avant l'arrivée du fichier, ce qui
      // évite le décalage de mise en page sur un réseau lent.
      width={800}
      height={600}
      onError={() => setEnEchec(true)}
    />
  );
}

export default PlaceImage;

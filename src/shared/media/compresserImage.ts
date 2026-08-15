/**
 * Réduction d'une photo avant envoi.
 *
 * Un téléphone récent produit des images de trois à huit mégaoctets. Sur le
 * réseau mobile ivoirien, un shopper qui photographie son reçu au marché passe
 * alors plusieurs minutes à téléverser, quand l'envoi ne se coupe pas en cours
 * de route. Le reçu n'a pourtant besoin que d'être lisible : mille six cents
 * pixels sur le grand côté suffisent à relire un ticket de caisse.
 *
 * La compression a lieu dans le navigateur, avant tout envoi : ce qui n'est pas
 * transmis ne coûte ni temps ni forfait.
 */

export interface ResultatCompression {
  fichier: File;
  /** Taille d'origine, pour pouvoir annoncer ce qui a été économisé. */
  octetsAvant: number;
  octetsApres: number;
  compressee: boolean;
}

interface OptionsCompression {
  /** Plus grand côté conservé, en pixels. */
  cotelMax?: number;
  /** Qualité JPEG, entre 0 et 1. */
  qualite?: number;
  /** En deçà de ce poids, l'image part telle quelle. */
  seuilOctets?: number;
}

const chargerImage = (fichier: File): Promise<HTMLImageElement> =>
  new Promise((resoudre, rejeter) => {
    const url = URL.createObjectURL(fichier);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resoudre(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      rejeter(new Error("Image illisible"));
    };
    image.src = url;
  });

export async function compresserImage(
  fichier: File,
  options: OptionsCompression = {}
): Promise<ResultatCompression> {
  const { cotelMax = 1600, qualite = 0.82, seuilOctets = 400 * 1024 } = options;

  const inchange: ResultatCompression = {
    fichier,
    octetsAvant: fichier.size,
    octetsApres: fichier.size,
    compressee: false,
  };

  // Un PDF ne se recompresse pas ici, et une image déjà légère n'y gagnerait
  // rien : la recompresser dégraderait sa lisibilité pour quelques kilooctets.
  if (!fichier.type.startsWith("image/") || fichier.size <= seuilOctets) {
    return inchange;
  }

  // Sans canvas exploitable, mieux vaut envoyer l'original que rien du tout.
  if (typeof document === "undefined" || typeof HTMLCanvasElement === "undefined") {
    return inchange;
  }

  try {
    const image = await chargerImage(fichier);
    const facteur = Math.min(1, cotelMax / Math.max(image.width, image.height));
    const largeur = Math.round(image.width * facteur);
    const hauteur = Math.round(image.height * facteur);

    const canvas = document.createElement("canvas");
    canvas.width = largeur;
    canvas.height = hauteur;

    const contexte = canvas.getContext("2d");
    if (!contexte) return inchange;

    // Fond blanc : une photo transparente deviendrait noire en JPEG, ce qui
    // rend un ticket de caisse illisible.
    contexte.fillStyle = "#ffffff";
    contexte.fillRect(0, 0, largeur, hauteur);
    contexte.drawImage(image, 0, 0, largeur, hauteur);

    const blob = await new Promise<Blob | null>((resoudre) =>
      canvas.toBlob(resoudre, "image/jpeg", qualite)
    );

    // Une compression qui alourdit le fichier n'en est pas une.
    if (!blob || blob.size >= fichier.size) return inchange;

    const nom = fichier.name.replace(/\.[^.]+$/, "") + ".jpg";
    return {
      fichier: new File([blob], nom, { type: "image/jpeg", lastModified: Date.now() }),
      octetsAvant: fichier.size,
      octetsApres: blob.size,
      compressee: true,
    };
  } catch {
    // Une photo exotique que le navigateur ne sait pas décoder part telle
    // quelle : le dépôt d'une preuve ne doit jamais échouer pour cette raison.
    return inchange;
  }
}

/** Poids lisible, pour annoncer à l'utilisateur ce qui a été envoyé. */
export function formaterOctets(octets: number): string {
  if (octets < 1024) return `${octets} o`;
  if (octets < 1024 * 1024) return `${Math.round(octets / 1024)} Ko`;
  return `${(octets / (1024 * 1024)).toFixed(1)} Mo`;
}

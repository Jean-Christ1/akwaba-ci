/**
 * Destination de retour après authentification.
 *
 * Un paramètre de redirection non filtré est une porte ouverte à l'hameçonnage :
 * un lien de connexion forgé renverrait l'utilisateur, une fois authentifié,
 * vers un site tiers imitant le nôtre. On n'accepte donc qu'un chemin interne.
 */
export function safeRedirect(brut: string | null, defaut = "/profil"): string {
  if (!brut) return defaut;

  // Doit commencer par une seule barre oblique : "//evil.example" serait
  // interprété par le navigateur comme une adresse absolue.
  if (!brut.startsWith("/") || brut.startsWith("//")) return defaut;

  // Une barre oblique inversée est normalisée en barre oblique par certains
  // navigateurs, ce qui permettrait de contourner le contrôle précédent.
  if (brut.includes("\\")) return defaut;

  // Un schéma glissé dans le chemin ne doit jamais être suivi.
  if (/^\/+\s*(javascript|data|vbscript):/i.test(brut)) return defaut;

  return brut;
}

export default safeRedirect;

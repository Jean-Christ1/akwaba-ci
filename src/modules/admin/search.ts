import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type ErrandStatus = Database["public"]["Enums"]["errand_status"];

export interface ErrandHit {
  id: string;
  title: string;
  city: string;
  zone: string | null;
  status: ErrandStatus;
  customer_id: string;
  runner_id: string | null;
  total_amount: number;
  created_at: string;
}

export interface UserHit {
  /** Identifiant du compte, absent quand l'adresse n'est liée à aucun compte. */
  userId: string | null;
  email: string | null;
  displayName: string | null;
  phone: string | null;
  /** Table d'où vient la correspondance, pour que l'exploitant sache ce qu'il lit. */
  source: "profil" | "demande";
}

export interface SearchResult {
  errands: ErrandHit[];
  users: UserHit[];
  /** Message d'erreur du serveur, à afficher plutôt qu'un résultat vide trompeur. */
  error: string | null;
}

const LIMITE = 20;
export const LONGUEUR_MINIMALE = 2;

const MOTIF_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const estUuid = (valeur: string) => MOTIF_UUID.test(valeur.trim());
export const ressembleAUnCourriel = (valeur: string) => valeur.includes("@");

/**
 * Colonnes lues sur les courses.
 *
 * La lecture de `errands` est accordée colonne par colonne : une étoile
 * demanderait aussi le code de remise, qui n'est accordé à personne, et la
 * requête échouerait pour tout le monde.
 */
const COLONNES_COURSE =
  "id,title,city,zone,status,customer_id,runner_id,total_amount,created_at";

/** Deux correspondances sur la même course ne doivent apparaître qu'une fois. */
function fusionnerCourses(...listes: ErrandHit[][]): ErrandHit[] {
  const parId = new Map<string, ErrandHit>();
  for (const liste of listes) {
    for (const course of liste) if (!parId.has(course.id)) parId.set(course.id, course);
  }
  return Array.from(parId.values()).slice(0, LIMITE);
}

/**
 * Un compte peut apparaître par son profil et par plusieurs demandes. On garde
 * une entrée par compte, en privilégiant celle qui porte le plus d'information.
 */
function fusionnerUtilisateurs(...listes: UserHit[][]): UserHit[] {
  const parCle = new Map<string, UserHit>();
  for (const liste of listes) {
    for (const hit of liste) {
      const cle = hit.userId ?? `courriel:${hit.email ?? ""}`;
      const existant = parCle.get(cle);
      if (!existant) {
        parCle.set(cle, hit);
        continue;
      }
      parCle.set(cle, {
        userId: existant.userId ?? hit.userId,
        email: existant.email ?? hit.email,
        displayName: existant.displayName ?? hit.displayName,
        phone: existant.phone ?? hit.phone,
        source: existant.userId ? existant.source : hit.source,
      });
    }
  }
  return Array.from(parCle.values()).slice(0, LIMITE);
}

/**
 * Recherche de la console d'exploitation.
 *
 * Chaque critère part en requête vers la base : un exploitant qui reçoit un
 * appel doit retrouver une course ou un compte dans l'ensemble des données, et
 * non dans la page qu'un écran a déjà chargée. Le cloisonnement reste celui du
 * serveur, les politiques de sécurité s'appliquent à ces requêtes comme aux
 * autres.
 */
export async function searchConsole(requete: string): Promise<SearchResult> {
  const q = requete.trim();
  if (q.length < LONGUEUR_MINIMALE) return { errands: [], users: [], error: null };

  const erreurs: string[] = [];
  const motif = `%${q}%`;

  // Un identifiant complet désigne une ligne précise : on interroge les deux
  // tables qui portent ce genre d'identifiant plutôt que de deviner laquelle.
  if (estUuid(q)) {
    const [course, profil] = await Promise.all([
      supabase.from("errands").select(COLONNES_COURSE).eq("id", q).maybeSingle(),
      supabase.from("profiles").select("id,display_name,phone").eq("id", q).maybeSingle(),
    ]);
    if (course.error) erreurs.push(course.error.message);
    if (profil.error) erreurs.push(profil.error.message);

    return {
      errands: course.data ? [course.data as ErrandHit] : [],
      users: profil.data
        ? [
            {
              userId: profil.data.id,
              email: null,
              displayName: profil.data.display_name,
              phone: profil.data.phone,
              source: "profil",
            },
          ]
        : [],
      error: erreurs[0] ?? null,
    };
  }

  // Une adresse ne se cherche que là où l'application en conserve : la table
  // des comptes d'authentification n'est pas exposée au navigateur.
  if (ressembleAUnCourriel(q)) {
    const demandes = await supabase
      .from("leads")
      .select("email,full_name,phone,user_id")
      .ilike("email", motif)
      .order("created_at", { ascending: false })
      .limit(LIMITE);

    if (demandes.error) erreurs.push(demandes.error.message);

    const parCourriel = fusionnerUtilisateurs(
      (demandes.data ?? []).map((d) => ({
        userId: d.user_id,
        email: d.email,
        displayName: d.full_name,
        phone: d.phone,
        source: "demande" as const,
      }))
    );

    // Le nom affiché du compte prime sur celui saisi dans un formulaire.
    const identifiants = parCourriel.map((u) => u.userId).filter(Boolean) as string[];
    if (identifiants.length) {
      const profils = await supabase
        .from("profiles")
        .select("id,display_name,phone")
        .in("id", identifiants);
      if (profils.error) erreurs.push(profils.error.message);
      const parId = new Map((profils.data ?? []).map((p) => [p.id, p]));
      for (const hit of parCourriel) {
        const profil = hit.userId ? parId.get(hit.userId) : undefined;
        if (profil) {
          hit.displayName = profil.display_name ?? hit.displayName;
          hit.phone = profil.phone ?? hit.phone;
          hit.source = "profil";
        }
      }
    }

    return { errands: [], users: parCourriel, error: erreurs[0] ?? null };
  }

  // Recherche en texte libre. Les critères partent en requêtes séparées : un
  // filtre combiné ferait porter à la valeur saisie la syntaxe de la requête.
  const [parTitre, parVille, parNom, parTelephone] = await Promise.all([
    supabase
      .from("errands")
      .select(COLONNES_COURSE)
      .ilike("title", motif)
      .order("created_at", { ascending: false })
      .limit(LIMITE),
    supabase
      .from("errands")
      .select(COLONNES_COURSE)
      .ilike("city", motif)
      .order("created_at", { ascending: false })
      .limit(LIMITE),
    supabase.from("profiles").select("id,display_name,phone").ilike("display_name", motif).limit(LIMITE),
    supabase.from("profiles").select("id,display_name,phone").ilike("phone", motif).limit(LIMITE),
  ]);

  for (const reponse of [parTitre, parVille, parNom, parTelephone]) {
    if (reponse.error) erreurs.push(reponse.error.message);
  }

  const versUtilisateur = (ligne: { id: string; display_name: string | null; phone: string | null }): UserHit => ({
    userId: ligne.id,
    email: null,
    displayName: ligne.display_name,
    phone: ligne.phone,
    source: "profil",
  });

  return {
    errands: fusionnerCourses(
      (parTitre.data ?? []) as ErrandHit[],
      (parVille.data ?? []) as ErrandHit[]
    ),
    users: fusionnerUtilisateurs(
      (parNom.data ?? []).map(versUtilisateur),
      (parTelephone.data ?? []).map(versUtilisateur)
    ),
    error: erreurs[0] ?? null,
  };
}

-- L'annuaire des comptes.
--
-- La console sait attribuer un rôle, retirer un droit, relire un accès. Elle
-- demande pour cela un identifiant technique de trente-six caractères, qu'il
-- faut donc avoir sous la main. La recherche d'exploitation existante ne comble
-- pas le trou : elle le dit elle-même en commentaire, la table des comptes
-- d'authentification n'est pas exposée au navigateur, donc elle ne trouve
-- personne par son adresse courriel.
--
-- Conséquence pratique : pour suspendre un compte dont on a l'adresse, il n'y a
-- aucun chemin. C'est ce qui manquait pour que « utilisateurs.suspendre »
-- devienne un geste et pas une ligne de catalogue.
--
-- L'annuaire lit l'adresse, ce que la recherche du navigateur ne peut pas
-- faire, et il n'est ouvert qu'à qui détient « utilisateurs.lire ».

CREATE OR REPLACE FUNCTION public.annuaire_des_comptes(
  p_recherche text DEFAULT NULL,
  p_limite integer DEFAULT 40
)
RETURNS TABLE (
  user_id uuid,
  courriel text,
  nom_affiche text,
  telephone text,
  cree_le timestamptz,
  suspendu_le timestamptz,
  suspendu_motif text,
  suspendu_par_courriel text,
  roles text[],
  courses integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_motif text;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'utilisateurs.lire') THEN
    RAISE EXCEPTION 'Vous n''avez pas le droit de consulter les comptes.' USING ERRCODE = '42501';
  END IF;

  -- Une recherche vide renvoie les comptes les plus récents plutôt que rien :
  -- l'écran doit montrer quelque chose avant qu'on ait tapé.
  v_motif := NULLIF(btrim(COALESCE(p_recherche, '')), '');

  RETURN QUERY
  SELECT
    u.id,
    u.email::text,
    p.display_name,
    p.phone,
    u.created_at,
    p.suspendu_le,
    p.suspendu_motif,
    (SELECT a.email::text FROM auth.users a WHERE a.id = p.suspendu_par),
    COALESCE(
      (SELECT array_agg(s.role_code ORDER BY s.role_code)
         FROM public.staff_assignments s
        WHERE s.user_id = u.id
          AND (s.expire_le IS NULL OR s.expire_le > now())),
      ARRAY[]::text[]
    ),
    (SELECT count(*)::integer FROM public.errands e WHERE e.customer_id = u.id)
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE v_motif IS NULL
     OR u.email ILIKE '%' || v_motif || '%'
     OR p.display_name ILIKE '%' || v_motif || '%'
     OR p.phone ILIKE '%' || v_motif || '%'
     -- Un identifiant complet colle rarement au reste : on le teste à part
     -- plutôt que de le passer en filtre textuel sur une colonne uuid.
     OR (v_motif ~ '^[0-9a-fA-F-]{36}$' AND u.id = v_motif::uuid)
  ORDER BY p.suspendu_le DESC NULLS LAST, u.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limite, 40), 1), 200);
END;
$fn$;

REVOKE ALL ON FUNCTION public.annuaire_des_comptes(text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.annuaire_des_comptes(text, integer) TO authenticated;

COMMENT ON FUNCTION public.annuaire_des_comptes(text, integer) IS
  'Recherche de comptes par adresse, nom, téléphone ou identifiant. Réservée au droit utilisateurs.lire.';

-- ---------------------------------------------------------------------------
-- Une suspension ne se pose pas non plus à la création du profil
--
-- Le retrait d'écriture posé plus tôt ne portait que sur la modification. Le
-- droit d'insertion, lui, couvrait toutes les colonnes, celles ajoutées depuis
-- comprises. Rien ne s'ouvre aujourd'hui par là, la clé primaire refusant une
-- seconde ligne pour le même compte, mais la règle du dépôt est de n'accorder
-- que les colonnes que le parcours écrit réellement, plutôt que de raisonner à
-- chaque fois sur ce qui empêche l'abus par ailleurs.
-- ---------------------------------------------------------------------------

REVOKE INSERT ON public.profiles FROM authenticated;
GRANT INSERT (id, display_name, avatar_url, phone, locale, whatsapp, canal_prefere,
              created_at, updated_at)
  ON public.profiles TO authenticated;

-- Exposition graduée : ce qu'un shopper peut porter dépend de ce qu'il a prouvé.
--
-- Le produit annonçait au client, à l'écran, que l'avance du shopper était
-- « réservée aux shoppers vérifiés, plafond 50 000 FCFA ». Ce plafond
-- n'existait que dans le TypeScript, où il servait à écrire une phrase. Aucune
-- fonction serveur ne le vérifiait : un shopper pouvait recevoir n'importe quel
-- montant, et le client croyait le contraire.
--
-- Le plafond fixe était de toute façon la mauvaise réponse. Il traitait de la
-- même façon un shopper validé la veille et un shopper de deux cents courses,
-- ce qui est précisément la faille qu'exploite un réseau de faux comptes :
-- créer un compte neuf coûte quelques minutes, et si un compte neuf peut
-- porter le même montant qu'un compte éprouvé, en créer cent est rentable.
--
-- Le principe retenu : l'exposition suit la preuve. Un shopper commence bas et
-- monte en portant des courses jusqu'au bout. Créer des comptes ne rapporte
-- alors plus rien, puisque chacun repart du plancher. C'est ce que font les
-- plateformes qui ont survécu à ce problème.
--
-- Les seuils sont administrables et versionnés, comme le barème tarifaire :
-- décider qu'un shopper accède à cent cinquante mille francs après vingt-cinq
-- courses est une décision d'exploitation, pas une migration.

CREATE TABLE IF NOT EXISTS public.runner_trust_levels (
  code              text PRIMARY KEY CHECK (code ~ '^[a-z_]+$'),
  libelle           text NOT NULL,
  description       text NOT NULL,

  -- Conditions d'accès au palier. Toutes doivent être remplies.
  courses_minimum   integer NOT NULL DEFAULT 0 CHECK (courses_minimum >= 0),
  note_minimum      numeric(3,2) NOT NULL DEFAULT 0 CHECK (note_minimum BETWEEN 0 AND 5),
  anciennete_jours  integer NOT NULL DEFAULT 0 CHECK (anciennete_jours >= 0),

  -- Ce que le palier autorise.
  plafond_avance    numeric(12,2) NOT NULL CHECK (plafond_avance >= 0),

  position          integer NOT NULL,
  actif             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),

  UNIQUE (position)
);

-- Le plancher reprend la valeur annoncee jusqu'ici (50 000) au palier ou elle
-- etait promise, et introduit un palier d'entree plus bas : un compte neuf ne
-- doit pas pouvoir porter ce qu'un compte eprouve porte.
INSERT INTO public.runner_trust_levels
  (code, libelle, description, courses_minimum, note_minimum, anciennete_jours, plafond_avance, position)
VALUES
  ('debutant', 'Debutant',
   'Premieres courses. L''exposition reste faible le temps que la confiance se construise.',
   0, 0, 0, 15000, 10),
  ('confirme', 'Confirme',
   'Cinq courses menees a leur terme et une note tenue. Le plafond annonce jusqu''ici.',
   5, 4.0, 7, 50000, 20),
  ('etabli', 'Etabli',
   'Vingt-cinq courses et une note elevee. Le shopper porte des paniers importants.',
   25, 4.5, 30, 150000, 30)
ON CONFLICT (code) DO UPDATE SET
  libelle = EXCLUDED.libelle, description = EXCLUDED.description,
  courses_minimum = EXCLUDED.courses_minimum, note_minimum = EXCLUDED.note_minimum,
  anciennete_jours = EXCLUDED.anciennete_jours, plafond_avance = EXCLUDED.plafond_avance;

-- ---------------------------------------------------------------------------
-- Le palier d'un shopper, calculé et non stocké
--
-- Stocker le palier obligerait à le recalculer à chaque course terminée, à
-- chaque note reçue, à chaque suspension. Un champ qu'on oublie de mettre à
-- jour est pire qu'un calcul : il ment avec l'autorité d'une donnée.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.runner_trust_level(p_user_id uuid)
RETURNS public.runner_trust_levels
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_profil public.runner_profiles;
  v_palier public.runner_trust_levels;
BEGIN
  SELECT * INTO v_profil FROM public.runner_profiles WHERE user_id = p_user_id;

  -- Sans dossier, ou hors habilitation, aucun palier : l'appelant en tire un
  -- plafond nul, ce qui est le comportement prudent.
  IF NOT FOUND OR v_profil.status <> 'approved'::runner_status THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_palier
    FROM public.runner_trust_levels
   WHERE actif
     AND courses_minimum <= COALESCE(v_profil.jobs_completed, 0)
     AND note_minimum <= COALESCE(v_profil.rating, 0)
     AND anciennete_jours <= EXTRACT(DAY FROM now() - v_profil.created_at)
   ORDER BY position DESC
   LIMIT 1;

  RETURN v_palier;
END;
$fn$;

/**
 * Ce qu'un shopper peut porter en avance, en francs.
 *
 * Zero quand il n'est pas habilite : la garde est fermee par defaut, et un
 * dossier suspendu cesse immediatement de pouvoir recevoir de l'argent.
 */
CREATE OR REPLACE FUNCTION public.runner_advance_ceiling(p_user_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT COALESCE((public.runner_trust_level(p_user_id)).plafond_avance, 0);
$fn$;

COMMENT ON FUNCTION public.runner_advance_ceiling(uuid) IS
  'Montant maximum qu''un shopper peut recevoir en avance, selon son palier de confiance.';

ALTER TABLE public.runner_trust_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runner_trust_levels FORCE ROW LEVEL SECURITY;

-- Les paliers sont publics en lecture : un shopper a le droit de savoir ce
-- qu'il doit accomplir pour monter, et le lui cacher rendrait la regle
-- arbitraire a ses yeux.
DROP POLICY IF EXISTS "Paliers lisibles" ON public.runner_trust_levels;
CREATE POLICY "Paliers lisibles" ON public.runner_trust_levels
  FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.runner_trust_levels FROM anon, authenticated;
GRANT SELECT ON public.runner_trust_levels TO anon, authenticated;
GRANT ALL ON public.runner_trust_levels TO service_role;

GRANT EXECUTE ON FUNCTION public.runner_trust_level(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.runner_advance_ceiling(uuid) TO authenticated;

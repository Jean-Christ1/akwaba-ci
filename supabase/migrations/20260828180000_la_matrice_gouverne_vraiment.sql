-- La matrice gouverne enfin les tables qu'elle prétend gouverner.
--
-- Troisième constat, et le plus profond des trois. La visibilité des courses ne
-- consultait pas la matrice : elle partait de l'ancien rôle, « admin » ou
-- « moderator », posé sur le compte.
--
-- Deux conséquences, symétriques et toutes deux fausses.
--
-- Une personne à qui l'on confie « admin_operations », donc « courses.lire »,
-- ne voyait aucune course. Vérifié contre la base : zéro ligne. La matrice
-- disait oui, la table disait non, et c'est la table qui commande.
--
-- Et un ancien modérateur voyait toutes les courses de toutes les villes, quoi
-- que la matrice en dise, puisqu'elle n'était pas consultée.
--
-- Le périmètre par ville, posé la semaine dernière, n'était donc appliqué nulle
-- part : un responsable limité à Bouaké voyait Abidjan, parce que la politique
-- ne regardait pas son attribution.
--
-- Ce que cette migration change : les trois politiques de lecture consultent
-- has_scoped_permission. Les anciens rôles continuent d'ouvrir, mais par le
-- chemin normal : le déclencheur les recopie dans la matrice, et l'accès de
-- secours reste dans has_permission. Ce qui change, c'est qu'ils passent
-- désormais par la matrice au lieu de la contourner.

-- ---------------------------------------------------------------------------
-- 1. Les courses
--
-- La ville de la course décide du périmètre. Sans attribution restreinte, le
-- droit vaut partout, ce qui est le cas de tout le personnel actuel.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Errand visibility" ON public.errands;
CREATE POLICY "Errand visibility" ON public.errands
  FOR SELECT TO authenticated
  USING (
    customer_id = auth.uid()
    OR runner_id = auth.uid()
    OR public.has_scoped_permission(auth.uid(), 'courses.lire', city)
  );

-- ---------------------------------------------------------------------------
-- 2. Les offres
--
-- Elles suivent la course : voir l'offre sans voir la course n'aurait aucun
-- sens, et voir la course sans ses offres priverait le support de l'essentiel.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Offer visibility" ON public.errand_offers;
CREATE POLICY "Offer visibility" ON public.errand_offers
  FOR SELECT TO authenticated
  USING (
    runner_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.errands e
       WHERE e.id = errand_offers.errand_id AND e.customer_id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.errands e
       WHERE e.id = errand_offers.errand_id
         AND public.has_scoped_permission(auth.uid(), 'courses.lire', e.city)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Les dossiers de shopper
--
-- Un dossier n'a pas de ville : un shopper travaille là où il se trouve. Le
-- droit reste donc global, mais il devient le droit de la matrice, et non plus
-- l'ancien rôle.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Runner profile read access" ON public.runner_profiles;
CREATE POLICY "Runner profile read access" ON public.runner_profiles
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_permission(auth.uid(), 'shoppers.lire')
    -- Un client voit le profil du shopper qui fait sa course : c'est à qui il
    -- confie son argent et son adresse.
    OR EXISTS (
      SELECT 1 FROM public.errands e
       WHERE e.runner_id = runner_profiles.user_id AND e.customer_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Ce que le périmètre change, dit à celui qui regarde
--
-- Un écran qui montre trois courses là où un collègue en voit trente ressemble
-- à une panne. Cette fonction dit la restriction, pour que la console puisse
-- l'annoncer plutôt que de laisser deviner.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.mon_perimetre()
RETURNS TABLE (
  restreint boolean,
  villes    text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    EXISTS (
      SELECT 1 FROM public.staff_assignments a
       WHERE a.user_id = auth.uid() AND a.scope_type = 'ville'
         AND (a.expire_le IS NULL OR a.expire_le > now())
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_assignments a
       WHERE a.user_id = auth.uid() AND a.scope_type = 'global'
         AND (a.expire_le IS NULL OR a.expire_le > now())
    )
    AND NOT public.has_role(auth.uid(), 'admin'::app_role),
    COALESCE(
      (SELECT array_agg(DISTINCT c.name ORDER BY c.name)
         FROM public.staff_assignments a
         JOIN public.service_cities c ON c.slug = a.scope_value
        WHERE a.user_id = auth.uid() AND a.scope_type = 'ville'
          AND (a.expire_le IS NULL OR a.expire_le > now())),
      ARRAY[]::text[]
    );
$fn$;

REVOKE ALL ON FUNCTION public.mon_perimetre() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mon_perimetre() TO authenticated;

COMMENT ON FUNCTION public.mon_perimetre() IS
  'Les villes auxquelles le lecteur est limite, s''il l''est. Sert a annoncer la restriction plutot qu''a la faire deviner.';

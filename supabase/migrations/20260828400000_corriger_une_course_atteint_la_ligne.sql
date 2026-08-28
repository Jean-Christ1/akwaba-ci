-- Corriger une course atteint enfin la ligne.
--
-- Trouvé par la recette de la portée, et c'est un cas instructif : le droit
-- « courses.corriger » était bien consulté, la mesure des droits morts le
-- comptait donc comme vivant, et il n'ouvrait pourtant rien.
--
-- La garde des colonnes privilégiées le consultait, mais la politique de
-- modification, elle, exigeait toujours l'un des deux rôles hérités. Le
-- personnel de la matrice n'atteignait donc jamais la ligne : la garde n'avait
-- même pas l'occasion de se prononcer, et la modification ne touchait aucune
-- ligne, sans message d'erreur.
--
-- Un refus silencieux est le pire des deux : la console affiche que le geste a
-- réussi, et rien n'a changé.
--
-- La leçon est portée dans l'audit : consulter un droit ne suffit pas, encore
-- faut-il que la porte d'entrée le laisse passer.

DROP POLICY IF EXISTS "Participants update errand" ON public.errands;
CREATE POLICY "Participants update errand" ON public.errands
  FOR UPDATE TO authenticated
  USING (
    customer_id = auth.uid()
    OR runner_id = auth.uid()
    OR public.has_scoped_permission(auth.uid(), 'courses.corriger', city)
  );

-- Ce que chacun peut réellement changer reste décidé par
-- guard_errand_privileged_columns : la politique ouvre la ligne, la garde
-- décide des colonnes. Les deux sont nécessaires, et aucune ne remplace
-- l'autre.

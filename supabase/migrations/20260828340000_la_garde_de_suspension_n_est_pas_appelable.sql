-- Une fonction de déclencheur n'a pas à être appelable.
--
-- Relevé par l'audit dans la foulée : guard_course_compte_suspendu est
-- SECURITY DEFINER et reste exécutable par PUBLIC, comme toute fonction créée
-- sans retrait explicite. Elle ne sert à rien appelée à la main, un déclencheur
-- lui passant NEW et OLD que personne ne peut forger depuis le client, mais la
-- règle du dépôt est de ne laisser aucune fonction privilégiée ouverte par
-- défaut : c'est la posture qui protège, pas l'analyse au cas par cas.

REVOKE ALL ON FUNCTION public.guard_course_compte_suspendu() FROM PUBLIC;

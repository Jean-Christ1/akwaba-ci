-- Le porteur WhatsApp et l'expiration des pièces entrent dans l'ordonnanceur.
--
-- Deux fonctions écrites récemment n'étaient appelées par personne. Une
-- fonction que rien ne déclenche ne fait rien : elle dort jusqu'au jour où
-- l'on découvre, en production, ce qu'elle aurait dû faire.
--
-- Le porteur WhatsApp part toutes les deux minutes. C'est le rythme d'un
-- service de courses : un shopper qui accepte une mission doit l'apprendre
-- avant d'avoir changé d'avis, et un client dont le panier attend son accord
-- ne peut pas patienter un quart d'heure.
--
-- L'expiration des pièces passe une fois par jour, tôt. Elle retire
-- l'habilitation d'un shopper dont la pièce a expiré : sans elle, un dossier
-- validé une fois le restait indéfiniment, la pièce périmait, et personne ne
-- s'en apercevait.

-- ---------------------------------------------------------------------------
-- Le portage des messages WhatsApp
-- ---------------------------------------------------------------------------

SELECT cron.unschedule(jobid)
  FROM cron.job
 WHERE jobname IN ('akwaba-portage-whatsapp', 'akwaba-expiration-pieces');

SELECT cron.schedule(
  'akwaba-portage-whatsapp',
  '*/2 * * * *',
  $$SELECT public.whatsapp_porter_la_file(30)$$
);

-- ---------------------------------------------------------------------------
-- L'expiration des pièces d'identité
--
-- À cinq heures du matin, heure du serveur : l'habilitation change avant que
-- les courses de la journée ne commencent, et non au milieu d'une mission.
-- ---------------------------------------------------------------------------

SELECT cron.schedule(
  'akwaba-expiration-pieces',
  '0 5 * * *',
  $$SELECT public.runner_expire_identity_documents()$$
);

-- ---------------------------------------------------------------------------
-- Ce que l'exploitation doit pouvoir lire
--
-- taches_planifiees() rend l'historique des travaux. Le nom des nôtres y
-- apparaît désormais, ce qui permet de constater qu'ils tournent plutôt que de
-- le supposer.
-- ---------------------------------------------------------------------------

COMMENT ON FUNCTION public.whatsapp_porter_la_file(integer) IS
  'Porte la file WhatsApp vers Twilio. Appelee toutes les deux minutes par pg_cron (akwaba-portage-whatsapp).';

COMMENT ON FUNCTION public.runner_expire_identity_documents() IS
  'Retire l''habilitation des shoppers dont la piece a expire. Appelee chaque jour a 5h par pg_cron (akwaba-expiration-pieces).';

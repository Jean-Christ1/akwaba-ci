-- ---------------------------------------------------------------------------
-- Notifications hors application.
--
-- Jusqu'ici, rien ne prévenait personne. Un client publiait une course et
-- devait revenir voir si une offre était arrivée. Un shopper ne savait qu'il
-- avait été retenu qu'en rouvrant l'application. Un marché où personne n'est
-- prévenu ne fonctionne pas : les offres arrivent trop tard, les courses
-- restent ouvertes, et les deux parties concluent que le service est mort.
--
-- Le choix d'architecture tient en une phrase : la base dépose ce qu'il faut
-- dire, un envoyeur le porte. Écrire l'envoi directement dans les fonctions du
-- moteur aurait lié la clôture d'une course à la disponibilité d'un service de
-- courriel, si bien qu'une panne de messagerie aurait empêché de payer.
--
-- Ce qui est déposé est donc une intention d'envoi, durable, rejouable et
-- traçable. Ce qui l'envoie est remplaçable sans toucher au métier.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_channel') THEN
    CREATE TYPE public.notification_channel AS ENUM ('email');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_state') THEN
    CREATE TYPE public.notification_state AS ENUM ('pending', 'sent', 'failed', 'skipped');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  errand_id    uuid REFERENCES public.errands(id) ON DELETE CASCADE,
  channel      notification_channel NOT NULL DEFAULT 'email',
  event        text NOT NULL,
  subject      text NOT NULL,
  body         text NOT NULL,
  state        notification_state NOT NULL DEFAULT 'pending',
  attempts     integer NOT NULL DEFAULT 0,
  last_error   text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  sent_at      timestamptz,
  CONSTRAINT notification_outbox_event_len CHECK (char_length(event) BETWEEN 3 AND 60)
);

COMMENT ON TABLE public.notification_outbox IS
  'File des notifications a envoyer. La base depose, un envoyeur porte : une panne de messagerie ne bloque jamais le metier.';

-- Une même cause ne produit qu'un envoi : republier une offre ou rejouer une
-- clôture ne doit pas inonder la boîte du destinataire.
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_unique_event
  ON public.notification_outbox (errand_id, user_id, event)
  WHERE errand_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_outbox_pending
  ON public.notification_outbox (created_at)
  WHERE state = 'pending';

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_outbox FORCE ROW LEVEL SECURITY;

REVOKE ALL ON public.notification_outbox FROM anon, authenticated;

-- Seul le personnel consulte la file, pour diagnostiquer un envoi qui n'est
-- pas parti. L'envoyeur, lui, passe par la clé de service.
GRANT SELECT ON public.notification_outbox TO authenticated;

CREATE POLICY "Staff read outbox"
  ON public.notification_outbox FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
  );

-- ---------------------------------------------------------------------------
-- Déposer une notification.
--
-- La fonction est volontairement tolérante : une notification qui ne peut pas
-- être déposée ne doit jamais faire échouer l'opération métier qui l'a
-- provoquée. Mieux vaut un client non prévenu qu'une course impossible à
-- clôturer.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_enqueue(
  p_user_id   uuid,
  p_errand_id uuid,
  p_event     text,
  p_subject   text,
  p_body      text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.notification_outbox (user_id, errand_id, event, subject, body)
  VALUES (p_user_id, p_errand_id, p_event, left(p_subject, 200), p_body)
  ON CONFLICT DO NOTHING;

EXCEPTION WHEN OTHERS THEN
  -- Journalisé sans être propagé : la notification est un service rendu en
  -- plus, jamais une condition du service principal.
  RAISE WARNING 'Notification % non deposee : %', p_event, SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_enqueue(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ce qui déclenche une notification.
--
-- Quatre moments où l'absence de nouvelle fait réellement perdre une course :
-- une offre arrive, un shopper est retenu, la course est livrée, un litige
-- s'ouvre. Le reste peut attendre l'ouverture de l'application.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_on_offer()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_errand public.errands;
BEGIN
  SELECT * INTO v_errand FROM public.errands WHERE id = NEW.errand_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  PERFORM public.notify_enqueue(
    v_errand.customer_id, v_errand.id, 'offer_received',
    'Une offre pour votre course',
    'Un shopper propose ' || NEW.price::text || ' F CFA pour votre course "'
      || left(v_errand.title, 80) || '". Ouvrez votre course pour comparer les offres et choisir.'
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_offer ON public.errand_offers;
CREATE TRIGGER trg_notify_offer
  AFTER INSERT ON public.errand_offers
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_offer();

CREATE OR REPLACE FUNCTION public.notify_on_errand_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Le shopper vient d'être retenu.
  IF NEW.runner_id IS NOT NULL AND OLD.runner_id IS NULL THEN
    PERFORM public.notify_enqueue(
      NEW.runner_id, NEW.id, 'errand_assigned',
      'Votre offre a été retenue',
      'Le client a retenu votre offre pour "' || left(NEW.title, 80)
        || '". Vous pouvez commencer la mission depuis votre espace shopper.'
    );
  END IF;

  -- La course vient d'être remise : le client doit confirmer et régler.
  IF NEW.status = 'delivered'::errand_status AND OLD.status <> 'delivered'::errand_status THEN
    PERFORM public.notify_enqueue(
      NEW.customer_id, NEW.id, 'errand_delivered',
      'Votre course a été livrée',
      'Votre course "' || left(NEW.title, 80)
        || '" est marquée comme livrée. Confirmez la réception pour clôturer.'
    );
  END IF;

  -- Un litige s'ouvre : les deux parties sont prévenues, sans quoi l'une
  -- découvre l'arbitrage sans avoir su qu'il était en cours.
  IF NEW.status = 'disputed'::errand_status AND OLD.status <> 'disputed'::errand_status THEN
    PERFORM public.notify_enqueue(
      NEW.customer_id, NEW.id, 'dispute_opened_customer',
      'Un litige est ouvert sur votre course',
      'Un litige a été ouvert sur "' || left(NEW.title, 80)
        || '". Un modérateur va l''instruire et vous tenir informé.'
    );
    PERFORM public.notify_enqueue(
      NEW.runner_id, NEW.id, 'dispute_opened_runner',
      'Un litige est ouvert sur une de vos missions',
      'Un litige a été ouvert sur "' || left(NEW.title, 80)
        || '". Vos gains sont gelés le temps de l''instruction.'
    );
  END IF;

  -- Un dépassement de budget attend l'accord du client : sans lui, la course
  -- ne peut plus avancer, et personne ne sait pourquoi.
  IF NEW.budget_overrun_pending AND NOT OLD.budget_overrun_pending THEN
    PERFORM public.notify_enqueue(
      NEW.customer_id, NEW.id, 'budget_overrun',
      'Votre accord est attendu sur un dépassement',
      'Les achats de votre course "' || left(NEW.title, 80)
        || '" dépassent le budget annoncé. Votre accord est nécessaire pour continuer.'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_errand ON public.errands;
CREATE TRIGGER trg_notify_errand
  AFTER UPDATE ON public.errands
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_errand_change();

-- ---------------------------------------------------------------------------
-- Ce que l'envoyeur consomme.
--
-- Il réclame un lot, le marque en cours par le nombre de tentatives, et rend
-- l'adresse du destinataire. Une notification qui a échoué cinq fois cesse
-- d'être reprise : elle reste en file, visible, pour être diagnostiquée.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_claim_batch(p_limit integer DEFAULT 20)
RETURNS TABLE (
  id      uuid,
  email   text,
  subject text,
  body    text,
  event   text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH pris AS (
    UPDATE public.notification_outbox o
    SET attempts = o.attempts + 1
    WHERE o.id IN (
      SELECT o2.id FROM public.notification_outbox o2
      WHERE o2.state = 'pending'::notification_state
        AND o2.attempts < 5
      ORDER BY o2.created_at
      LIMIT GREATEST(COALESCE(p_limit, 20), 1)
      FOR UPDATE SKIP LOCKED
    )
    RETURNING o.id, o.user_id, o.subject, o.body, o.event
  )
  SELECT p.id, u.email::text, p.subject, p.body, p.event
  FROM pris p
  JOIN auth.users u ON u.id = p.user_id
  WHERE u.email IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_claim_batch(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.notify_mark(
  p_id      uuid,
  p_state   text,
  p_error   text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_state NOT IN ('sent', 'failed', 'skipped') THEN
    RAISE EXCEPTION 'État de notification inconnu.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_outbox SET
    state      = p_state::notification_state,
    sent_at    = CASE WHEN p_state = 'sent' THEN now() ELSE sent_at END,
    last_error = left(p_error, 500)
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.notify_mark(uuid, text, text) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Ce que l'exploitant voit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.notification_health
WITH (security_invoker = on)
AS
SELECT
  state::text                                   AS etat,
  count(*)::int                                 AS nombre,
  min(created_at)                               AS plus_ancienne,
  max(created_at)                               AS plus_recente,
  count(*) FILTER (WHERE attempts >= 5)::int    AS abandonnees
FROM public.notification_outbox
GROUP BY state;

GRANT SELECT ON public.notification_health TO authenticated;

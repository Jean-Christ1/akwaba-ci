
DO $$ BEGIN
  CREATE TYPE public.moderation_action AS ENUM ('approved','rejected','pending','note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.place_moderation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  place_id uuid NOT NULL,
  moderator_id uuid NOT NULL,
  action public.moderation_action NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pme_place ON public.place_moderation_events(place_id, created_at DESC);

ALTER TABLE public.place_moderation_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Owner, moderators and admins read events" ON public.place_moderation_events;
CREATE POLICY "Owner, moderators and admins read events"
ON public.place_moderation_events FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'moderator') OR
  EXISTS (SELECT 1 FROM public.places p WHERE p.id = place_moderation_events.place_id AND p.owner_id = auth.uid())
);

DROP POLICY IF EXISTS "Moderators and admins insert events" ON public.place_moderation_events;
CREATE POLICY "Moderators and admins insert events"
ON public.place_moderation_events FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'moderator'))
  AND moderator_id = auth.uid()
);

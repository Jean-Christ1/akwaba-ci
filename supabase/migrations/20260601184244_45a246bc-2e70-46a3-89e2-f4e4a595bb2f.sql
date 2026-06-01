ALTER TABLE public.places REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.places;
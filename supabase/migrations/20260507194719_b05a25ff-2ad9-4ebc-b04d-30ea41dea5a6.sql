-- Lock down SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

-- Tighten lead insert (basic validation, prevents abuse)
DROP POLICY "Anyone can submit a lead" ON public.leads;
CREATE POLICY "Anyone can submit a valid lead"
  ON public.leads FOR INSERT
  WITH CHECK (
    char_length(full_name) BETWEEN 2 AND 120
    AND char_length(email) BETWEEN 5 AND 255
    AND email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    AND char_length(message) BETWEEN 5 AND 2000
    AND (user_id IS NULL OR user_id = auth.uid())
  );

-- Restrict storage listing on place-images (read by exact path only via public URL still works)
DROP POLICY "Place images are publicly readable" ON storage.objects;
CREATE POLICY "Place images readable by path"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'place-images' AND auth.role() IN ('anon','authenticated'));
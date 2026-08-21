
-- Restrict profile reads to the owner (phone column was publicly exposed)
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
USING (auth.uid() = id);

-- Restrict place-images uploads so users can only upload under their own user_id folder
DROP POLICY IF EXISTS "Authenticated users can upload place images" ON storage.objects;
CREATE POLICY "Users can upload place images to own folder"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'place-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

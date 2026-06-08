DROP POLICY IF EXISTS "Authenticated users can upload place images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated upload place-images" ON storage.objects;
DROP POLICY IF EXISTS "place-images authenticated insert" ON storage.objects;

CREATE POLICY "Users can upload to their own folder in place-images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'place-images'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
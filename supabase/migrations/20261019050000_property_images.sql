-- Images for a property.
--
-- WRITTEN, NOT RUN. Needs the owner's approval before it touches production,
-- and the bucket half needs it twice over: a public bucket is a decision about
-- what the internet can read.
--
-- `properties.photo_url` already exists (20260907000000) and is unused. This
-- does not add a second column for the same thing — it gives that one a job,
-- and adds the bucket behind it.
--
-- A URL rather than a blob reference, deliberately: the form accepts either an
-- upload or a pasted image URL, and a listing photo on Zillow's CDN is a
-- perfectly good picture of the house. One column holds both, and the storage
-- bucket is only involved when the user actually uploads.

-- ─────────────────────────────────────────────────────────────────────────────
-- The bucket
-- ─────────────────────────────────────────────────────────────────────────────
-- Public read. These are photos of houses from public listings, not documents,
-- and a signed URL per thumbnail on a list of twenty houses is twenty round
-- trips for no privacy gained.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'property-images',
  'property-images',
  true,
  5242880,  -- 5MB. A phone photo of a kitchen, not a RAW file.
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Writes are owner-only, and scoped by the first path segment being the
-- uploader's user id — so one signed-in user cannot overwrite another's
-- photos even though everyone can read them.

CREATE POLICY "property images: owner can upload"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'property-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property images: owner can replace"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'property-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property images: owner can remove"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'property-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "property images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'property-images');

-- Down path, for the owner to run if this is rolled back:
--
-- DROP POLICY IF EXISTS "property images: owner can upload"  ON storage.objects;
-- DROP POLICY IF EXISTS "property images: owner can replace" ON storage.objects;
-- DROP POLICY IF EXISTS "property images: owner can remove"  ON storage.objects;
-- DROP POLICY IF EXISTS "property images: public read"       ON storage.objects;
-- DELETE FROM storage.buckets WHERE id = 'property-images';

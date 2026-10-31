BEGIN;
CREATE OR REPLACE FUNCTION public.media_file_capabilities()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT media_private.account_enabled() THEN RAISE EXCEPTION 'Account authorization required' USING ERRCODE = '42501'; END IF;
  RETURN pg_catalog.jsonb_build_object('protocol', 1, 'privateBucket', 'aiao-media-images', 'maxBytes', 16777216, 'resumable', true, 'metadataOnly', false);
END;
$$;
REVOKE ALL ON FUNCTION public.media_file_capabilities() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_file_capabilities() TO authenticated;
CREATE TABLE IF NOT EXISTS public.media_file_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "workspaceId" uuid NOT NULL REFERENCES public.media_workspaces(id) ON DELETE CASCADE,
  "sourceId" text NOT NULL,
  version text NOT NULL,
  path text NOT NULL,
  "mimeType" text NOT NULL CHECK ("mimeType" IN ('image/png', 'image/jpeg')),
  width integer NOT NULL CHECK (width > 0 AND width <= 4096),
  height integer NOT NULL CHECK (height > 0 AND height <= 4096),
  bytes integer NOT NULL CHECK (bytes > 0 AND bytes <= 16777216),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  status text NOT NULL CHECK (status IN ('pending', 'uploaded', 'deleted', 'needs_review')),
  deleted boolean NOT NULL DEFAULT false,
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  "baseRevision" bigint NOT NULL DEFAULT 0 CHECK ("baseRevision" >= 0),
  "createdBy" uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  "updatedBy" uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
  "createdAt" timestamptz(3) NOT NULL DEFAULT now(),
  "updatedAt" timestamptz(3) NOT NULL DEFAULT now(),
  UNIQUE ("workspaceId", "sourceId", version),
  UNIQUE ("workspaceId", path)
);
ALTER TABLE public.media_file_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_file_records FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.media_file_records TO authenticated;
DROP POLICY IF EXISTS media_file_owner ON public.media_file_records;
CREATE POLICY media_file_owner ON public.media_file_records FOR ALL TO authenticated
  USING ("createdBy" = (SELECT auth.uid())::uuid AND media_private.owns_workspace("workspaceId"))
  WITH CHECK ("createdBy" = (SELECT auth.uid())::uuid AND "updatedBy" = (SELECT auth.uid())::uuid AND media_private.owns_workspace("workspaceId"));

CREATE OR REPLACE FUNCTION media_private.validate_file_record()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.id <> OLD.id OR NEW."workspaceId" <> OLD."workspaceId" OR NEW."sourceId" <> OLD."sourceId" OR NEW.version <> OLD.version OR NEW."createdBy" <> OLD."createdBy" THEN
      RAISE EXCEPTION 'File identity is immutable' USING ERRCODE = '42501';
    END IF;
    IF NEW."baseRevision" <> OLD.revision OR NEW.revision <= OLD.revision THEN
      RAISE EXCEPTION 'File revision conflict' USING ERRCODE = 'PT409';
    END IF;
    NEW."createdAt" := OLD."createdAt";
  ELSIF NEW.revision <> 1 OR NEW."baseRevision" <> 0 THEN
    RAISE EXCEPTION 'Invalid initial file revision' USING ERRCODE = '22023';
  END IF;
  IF NEW.path !~ ('^' || auth.uid()::text || '/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg)$') THEN
    RAISE EXCEPTION 'Invalid private file path' USING ERRCODE = '22023';
  END IF;
  NEW."updatedAt" := pg_catalog.now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS media_file_contract ON public.media_file_records;
CREATE TRIGGER media_file_contract BEFORE INSERT OR UPDATE ON public.media_file_records
  FOR EACH ROW EXECUTE FUNCTION media_private.validate_file_record();

-- The local stack runs the Supabase Postgres image without the separate Storage API.
-- Keep the Storage catalog present so the same policies and bucket contract apply in
-- local CI as they do in a hosted Supabase project.
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS storage.buckets (
  id text PRIMARY KEY,
  name text NOT NULL UNIQUE,
  public boolean NOT NULL DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
CREATE TABLE IF NOT EXISTS storage.objects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bucket_id text NOT NULL REFERENCES storage.buckets(id) ON DELETE CASCADE,
  name text NOT NULL,
  owner uuid,
  metadata jsonb,
  UNIQUE (bucket_id, name)
);
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('aiao-media-images', 'aiao-media-images', false, 16777216, ARRAY['image/png', 'image/jpeg']::text[])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 16777216, allowed_mime_types = ARRAY['image/png', 'image/jpeg']::text[];
DROP POLICY IF EXISTS media_image_insert ON storage.objects;
CREATE POLICY media_image_insert ON storage.objects FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'aiao-media-images' AND split_part(name, '/', 1) = (SELECT auth.uid())::text AND
  media_private.owns_workspace(split_part(name, '/', 2)::uuid)
);
DROP POLICY IF EXISTS media_image_select ON storage.objects;
CREATE POLICY media_image_select ON storage.objects FOR SELECT TO authenticated USING (
  bucket_id = 'aiao-media-images' AND split_part(name, '/', 1) = (SELECT auth.uid())::text AND
  media_private.owns_workspace(split_part(name, '/', 2)::uuid)
);
DROP POLICY IF EXISTS media_image_update ON storage.objects;
CREATE POLICY media_image_update ON storage.objects FOR UPDATE TO authenticated USING (
  bucket_id = 'aiao-media-images' AND split_part(name, '/', 1) = (SELECT auth.uid())::text AND
  media_private.owns_workspace(split_part(name, '/', 2)::uuid)
) WITH CHECK (
  bucket_id = 'aiao-media-images' AND split_part(name, '/', 1) = (SELECT auth.uid())::text AND
  media_private.owns_workspace(split_part(name, '/', 2)::uuid)
);
DROP POLICY IF EXISTS media_image_delete ON storage.objects;
CREATE POLICY media_image_delete ON storage.objects FOR DELETE TO authenticated USING (
  bucket_id = 'aiao-media-images' AND split_part(name, '/', 1) = (SELECT auth.uid())::text AND
  media_private.owns_workspace(split_part(name, '/', 2)::uuid)
);
NOTIFY pgrst, 'reload schema';
COMMIT;

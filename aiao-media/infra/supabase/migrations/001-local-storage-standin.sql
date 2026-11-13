-- Local development only. The local Compose stack runs the Supabase Postgres image without the Storage API,
-- so storage.buckets and storage.objects do not exist. This minimal catalog lets 010-image-storage.sql
-- apply the same bucket row and policies locally as in a hosted project.
-- Hosted projects get these tables from the Storage service and do not allow creating them
-- (Supabase, 2025-04-21), so this file is deliberately excluded from the production bundle.
BEGIN;
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
COMMIT;

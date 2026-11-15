BEGIN;

CREATE SCHEMA IF NOT EXISTS pgmq;
DO $aiao_media_pgmq_extension$
BEGIN
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgmq WITH SCHEMA pgmq';
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE <> '0A000' THEN RAISE; END IF;
  END;
END
$aiao_media_pgmq_extension$;
DO $aiao_media_pgmq_queue$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pgmq') THEN
    EXECUTE $$SELECT pgmq.create('media_generation_poc')$$;
  END IF;
END
$aiao_media_pgmq_queue$;

CREATE TABLE IF NOT EXISTS public.media_pgmq_generation_poc_config (
  queue_name text PRIMARY KEY CHECK (queue_name = 'media_generation_poc'),
  visibility_timeout_seconds integer NOT NULL CHECK (visibility_timeout_seconds BETWEEN 1 AND 86400),
  max_read_count integer NOT NULL CHECK (max_read_count BETWEEN 1 AND 100),
  result_retention_seconds bigint NOT NULL CHECK (result_retention_seconds BETWEEN 60 AND 2592000),
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.media_pgmq_generation_poc_config(
  queue_name,
  visibility_timeout_seconds,
  max_read_count,
  result_retention_seconds,
  enabled
)
VALUES ('media_generation_poc', 60, 5, 86400, false)
ON CONFLICT (queue_name) DO NOTHING;

ALTER TABLE public.media_pgmq_generation_poc_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_pgmq_generation_poc_config FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.media_pgmq_generation_poc_config TO service_role;
GRANT INSERT, UPDATE, DELETE ON public.media_pgmq_generation_poc_config TO service_role;

CREATE OR REPLACE FUNCTION public.media_pgmq_generation_poc_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $metrics$
DECLARE
  configured jsonb;
  queue_metrics jsonb := '[]'::jsonb;
BEGIN
  SELECT pg_catalog.to_jsonb(config)
  INTO configured
  FROM public.media_pgmq_generation_poc_config config
  WHERE config.queue_name = 'media_generation_poc';

  IF EXISTS (SELECT 1 FROM pg_catalog.pg_extension WHERE extname = 'pgmq') THEN
    BEGIN
      EXECUTE $$
        SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(metrics)), '[]'::jsonb)
        FROM pgmq.metrics('media_generation_poc') metrics
      $$ INTO queue_metrics;
    EXCEPTION WHEN undefined_function OR undefined_table THEN
      queue_metrics := '[]'::jsonb;
    END;
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'queue', 'media_generation_poc',
    'config', COALESCE(configured, '{}'::jsonb),
    'metrics', queue_metrics
  );
END;
$metrics$;

REVOKE ALL ON FUNCTION public.media_pgmq_generation_poc_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_pgmq_generation_poc_metrics() TO service_role;

CREATE OR REPLACE FUNCTION public.media_enqueue_generation_poc(
  p_task_id uuid,
  p_task_revision bigint,
  p_kind text DEFAULT 'image-generation'
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE message_id bigint;
BEGIN
  IF NOT media_private.account_enabled() THEN
    RAISE EXCEPTION 'Account authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_task_id IS NULL OR p_task_revision IS NULL OR p_task_revision <= 0 OR p_kind <> 'image-generation' THEN
    RAISE EXCEPTION 'Invalid PGMQ generation message' USING ERRCODE = '22023';
  END IF;
  SELECT pgmq.send(
    'media_generation_poc',
    pg_catalog.jsonb_build_object('taskId', p_task_id, 'taskRevision', p_task_revision, 'kind', p_kind)
  ) INTO message_id;
  RETURN message_id;
END;
$$;
REVOKE ALL ON FUNCTION public.media_enqueue_generation_poc(uuid, bigint, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_enqueue_generation_poc(uuid, bigint, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

BEGIN;

-- 媒体供应商配置只允许服务端读取。浏览器只收到去除地址、上游型号和 Key 的目录摘要。
CREATE TABLE IF NOT EXISTS public.media_platform_configuration (
  id text PRIMARY KEY CHECK (id = 'default'),
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  models jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(models) = 'array'),
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(capabilities) = 'array'),
  last_request_id uuid,
  last_fingerprint text CHECK (last_fingerprint IS NULL OR last_fingerprint ~ '^[a-f0-9]{32}$'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.media_platform_configuration ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_platform_configuration FROM anon, authenticated;
GRANT ALL ON public.media_platform_configuration TO service_role;

CREATE OR REPLACE FUNCTION media_private.public_platform_configuration(p_models jsonb, p_capabilities jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT pg_catalog.jsonb_build_object(
    'models', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        (item - ARRAY['baseUrl', 'model', 'apiKey', 'secret'])
        || pg_catalog.jsonb_build_object(
          'credentialsConfigured',
          CASE WHEN pg_catalog.jsonb_typeof(item->'apiKey') = 'string' AND length(item->>'apiKey') > 0
            THEN true
            ELSE false
          END
        )
      )
      FROM pg_catalog.jsonb_array_elements(p_models) item
    ), '[]'::jsonb),
    'capabilities', COALESCE((
      SELECT pg_catalog.jsonb_agg(
        (item - ARRAY['protocol', 'baseUrl', 'model', 'apiKey', 'secret', 'path'])
        || pg_catalog.jsonb_build_object(
          'credentialsConfigured',
          CASE WHEN pg_catalog.jsonb_typeof(item->'apiKey') = 'string' AND length(item->>'apiKey') > 0
            THEN true
            ELSE false
          END
        )
      )
      FROM pg_catalog.jsonb_array_elements(p_capabilities) item
    ), '[]'::jsonb)
  );
$$;
REVOKE ALL ON FUNCTION media_private.public_platform_configuration(jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION media_private.public_platform_configuration(jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.media_admin_platform_configuration(
  p_actor uuid,
  p_revision bigint,
  p_request_id uuid,
  p_models jsonb,
  p_capabilities jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_row public.media_platform_configuration;
  next_revision bigint;
  fingerprint text;
  result jsonb;
BEGIN
  IF NOT public.media_admin_authorized(p_actor) THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_revision IS NULL OR p_revision < 0 OR p_request_id IS NULL OR
     pg_catalog.jsonb_typeof(p_models) <> 'array' OR pg_catalog.jsonb_typeof(p_capabilities) <> 'array' OR
     pg_catalog.jsonb_array_length(p_models) > 20 OR pg_catalog.jsonb_array_length(p_capabilities) > 200 THEN
    RAISE EXCEPTION 'Invalid platform configuration' USING ERRCODE = '22023';
  END IF;

  fingerprint := pg_catalog.md5(p_models::text || ':' || p_capabilities::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-platform-configuration', 0));
  SELECT * INTO current_row FROM public.media_platform_configuration WHERE id = 'default' FOR UPDATE;

  IF current_row.last_request_id = p_request_id THEN
    IF current_row.last_fingerprint IS DISTINCT FROM fingerprint THEN
      RAISE EXCEPTION 'Request ID reused' USING ERRCODE = '22023';
    END IF;
    RETURN pg_catalog.jsonb_build_object(
      'revision', current_row.revision,
      'modelCount', pg_catalog.jsonb_array_length(current_row.models),
      'capabilityCount', pg_catalog.jsonb_array_length(current_row.capabilities)
    );
  END IF;

  IF COALESCE(current_row.revision, 0) <> p_revision THEN
    RAISE EXCEPTION 'Platform configuration revision conflict' USING ERRCODE = 'PT409';
  END IF;

  next_revision := p_revision + 1;
  INSERT INTO public.media_platform_configuration(
    id, revision, models, capabilities, last_request_id, last_fingerprint, updated_at, updated_by
  )
  VALUES ('default', next_revision, p_models, p_capabilities, p_request_id, fingerprint, pg_catalog.now(), p_actor)
  ON CONFLICT (id) DO UPDATE SET
    revision = EXCLUDED.revision,
    models = EXCLUDED.models,
    capabilities = EXCLUDED.capabilities,
    last_request_id = EXCLUDED.last_request_id,
    last_fingerprint = EXCLUDED.last_fingerprint,
    updated_at = EXCLUDED.updated_at,
    updated_by = EXCLUDED.updated_by;

  result := pg_catalog.jsonb_build_object(
    'revision', next_revision,
    'modelCount', pg_catalog.jsonb_array_length(p_models),
    'capabilityCount', pg_catalog.jsonb_array_length(p_capabilities)
  );
  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, before_data, after_data)
  VALUES (
    p_actor,
    'platform-configuration',
    'default',
    p_request_id,
    CASE WHEN current_row.id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('revision', current_row.revision) END,
    result
  );
  RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_platform_configuration(uuid, bigint, uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_platform_configuration(uuid, bigint, uuid, jsonb, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.media_admin_platform_configuration_self_read()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE current_row public.media_platform_configuration;
BEGIN
  IF NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO current_row FROM public.media_platform_configuration WHERE id = 'default';
  IF current_row.id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('revision', 0, 'models', '[]'::jsonb, 'capabilities', '[]'::jsonb);
  END IF;
  RETURN media_private.public_platform_configuration(current_row.models, current_row.capabilities)
    || pg_catalog.jsonb_build_object('revision', current_row.revision);
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_platform_configuration_self_read() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_platform_configuration_self_read() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.media_admin_platform_configuration_self_write(
  p_revision bigint,
  p_request_id uuid,
  p_models jsonb,
  p_capabilities jsonb
)
RETURNS jsonb
LANGUAGE sql
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT public.media_admin_platform_configuration(auth.uid(), p_revision, p_request_id, p_models, p_capabilities);
$$;
REVOKE ALL ON FUNCTION public.media_admin_platform_configuration_self_write(bigint, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_platform_configuration_self_write(bigint, uuid, jsonb, jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

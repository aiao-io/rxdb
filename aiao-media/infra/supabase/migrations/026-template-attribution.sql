BEGIN;

ALTER TABLE public.media_prompt_templates
  ADD COLUMN IF NOT EXISTS image text,
  ADD COLUMN IF NOT EXISTS alt text,
  ADD COLUMN IF NOT EXISTS author text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS rights text;

CREATE OR REPLACE FUNCTION media_private.template_public_payload(v jsonb, previous jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  result jsonb;
  field text;
BEGIN
  result := jsonb_build_object(
    'referenceModel', NULL,
    'needsReference', false, 'featuredRank', NULL
  ) || COALESCE(previous, '{}'::jsonb) || jsonb_build_object(
    'id', v->>'key', 'title', v->'title', 'prompt', v->'prompt',
    'purpose', COALESCE(NULLIF(v->>'purpose', ''), '创意设计'),
    'style', COALESCE(NULLIF(v->>'style', ''), '通用'),
    'tags', COALESCE(NULLIF(v->'tags', 'null'::jsonb), '[]'::jsonb),
    'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD')
  );
  FOREACH field IN ARRAY ARRAY['image', 'alt', 'author', 'source', 'rights'] LOOP
    IF v->field IS NOT NULL AND v->field <> 'null'::jsonb THEN
      result := jsonb_set(result, ARRAY[field], v->field);
    END IF;
  END LOOP;
  IF previous->>'prompt' IS DISTINCT FROM v->>'prompt' THEN
    result := result - 'templateDocument' - 'fields';
  END IF;
  FOREACH field IN ARRAY ARRAY['title', 'prompt', 'style', 'purpose', 'image', 'alt', 'author', 'source', 'rights'] LOOP
    IF jsonb_typeof(result->field) IS DISTINCT FROM 'string' OR result->>field !~ '[^[:space:]]'
      OR media_private.js_length(result->>field) > 10000 THEN
      RAISE EXCEPTION '请补全模板发布字段：%', field USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF jsonb_typeof(result->'tags') <> 'array' OR jsonb_array_length(result->'tags') > 20 OR EXISTS (
    SELECT FROM jsonb_array_elements(result->'tags') tag WHERE jsonb_typeof(tag) <> 'string'
      OR (tag #>> '{}') !~ '[^[:space:]]' OR media_private.js_length(tag #>> '{}') > 60
  ) OR (NOT result ? 'templateDocument' AND cardinality(string_to_array(result->>'prompt', chr(10))) > 1000) THEN
    RAISE EXCEPTION 'Invalid template tags or prompt' USING ERRCODE = '22023';
  END IF;
  IF NOT (
    (result->>'rights' = 'aiao-original-text-and-svg' AND result->>'image' ~ '^/prompt-art/[a-z0-9-]+[.]svg$')
    OR (result->>'rights' = 'community-reference' AND result->>'image' ~ '^/image-examples/[a-z0-9-]+[.]jpg$'
      AND media_private.js_length(result->>'source') <= 2048
      AND result->>'source' ~* '^https://(github[.]com|x[.]com)(/[^[:space:]?#\\]*)?$')
  ) THEN
    RAISE EXCEPTION '封面路径或来源与使用依据不符。' USING ERRCODE = '22023';
  END IF;
  RETURN result;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

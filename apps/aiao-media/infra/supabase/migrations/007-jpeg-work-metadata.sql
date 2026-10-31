BEGIN;
CREATE OR REPLACE FUNCTION media_private.valid_record_payload(kind text, payload text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE v jsonb := payload::jsonb;
BEGIN
  IF v->'version' IS DISTINCT FROM '1'::jsonb THEN RETURN false; END IF;
  IF kind = 'draft' THEN RETURN media_private.json_fields(v, ARRAY['version','state']) AND media_private.valid_studio(v->'state'); END IF;
  IF kind = 'provider' THEN RETURN media_private.json_fields(v, ARRAY['version','name','baseUrl','model','mode']) AND
    length(v->>'name') BETWEEN 1 AND 80 AND v->>'model' ~ '^[a-zA-Z0-9._:-]{1,128}$'; END IF;
  RETURN media_private.json_fields(v, ARRAY['version','jobId','prompt','modelId','providerInstanceId','mimeType','width','height','bytes','sha256','createdAt']) AND
    v->>'mimeType' IN ('image/png', 'image/jpeg') AND length(v->>'modelId') BETWEEN 1 AND 128 AND v->>'sha256' ~ '^[a-f0-9]{64}$' AND
    (v->>'width')::integer BETWEEN 1 AND 4096 AND (v->>'height')::integer BETWEEN 1 AND 4096 AND
    (v->>'bytes')::integer BETWEEN 1 AND 16777216 AND length(v->>'prompt') BETWEEN 1 AND 4000 AND
    (v->>'jobId')::uuid IS NOT NULL AND (v->>'providerInstanceId')::uuid IS NOT NULL AND (v->>'createdAt')::timestamptz IS NOT NULL;
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;

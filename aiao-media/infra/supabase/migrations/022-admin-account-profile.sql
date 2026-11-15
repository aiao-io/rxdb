BEGIN;

CREATE TABLE IF NOT EXISTS public.media_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  revision bigint NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at timestamptz,
  CHECK ((display_name IS NULL AND revision = 0 AND updated_at IS NULL)
    OR (display_name IS NOT NULL AND revision > 0 AND updated_at IS NOT NULL))
);
INSERT INTO public.media_profiles(user_id)
  SELECT user_id FROM public.media_admin_memberships ON CONFLICT DO NOTHING;
ALTER TABLE public.media_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.media_profiles TO authenticated;
GRANT ALL ON public.media_profiles TO service_role;
DROP POLICY IF EXISTS media_admin_own_profile ON public.media_profiles;
CREATE POLICY media_admin_own_profile ON public.media_profiles FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT public.media_admin_authorized()));

CREATE OR REPLACE FUNCTION public.media_admin_profile()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  profile public.media_profiles;
BEGIN
  IF NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO profile FROM public.media_profiles WHERE user_id = auth.uid();
  RETURN jsonb_build_object(
    'userId', auth.uid(), 'displayName', profile.display_name,
    'revision', COALESCE(profile.revision, 0), 'updatedAt', profile.updated_at,
    'adminEnabled', true, 'accessDisabled', false
  );
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_profile() TO authenticated;

CREATE OR REPLACE FUNCTION public.media_admin_update_profile(
  p_display_name text,
  p_expected_revision bigint,
  p_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor uuid := auth.uid();
  name text;
  profile public.media_profiles;
  previous public.media_admin_audit;
  confirmed jsonb;
BEGIN
  PERFORM 1 FROM public.media_admin_memberships WHERE user_id = actor FOR SHARE;
  PERFORM 1 FROM public.media_accounts WHERE user_id = actor FOR SHARE;
  IF NOT public.media_admin_authorized() THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_display_name IS NULL OR p_display_name ~ U&'[\0001-\001F\007F-\009F\200B\200E\200F\202A-\202E\2060-\206F\FEFF]' THEN
    RAISE EXCEPTION 'Invalid display name characters' USING ERRCODE = '22023';
  END IF;
  name := btrim(p_display_name, U&'\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000');
  IF char_length(name) NOT BETWEEN 1 AND 40 OR p_expected_revision IS NULL OR p_expected_revision < 0 OR p_request_id IS NULL THEN
    RAISE EXCEPTION 'Invalid profile request' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.media_profiles(user_id) VALUES (actor) ON CONFLICT DO NOTHING;
  SELECT * INTO profile FROM public.media_profiles WHERE user_id = actor FOR UPDATE;
  SELECT * INTO previous FROM public.media_admin_audit WHERE actor_id = actor AND request_id = p_request_id;
  IF FOUND THEN
    IF previous.action <> 'profile-update' OR previous.after_data->>'displayName' <> name
      OR (previous.before_data->>'revision')::bigint <> p_expected_revision THEN
      RAISE EXCEPTION 'Profile request conflict' USING ERRCODE = 'PT409';
    END IF;
    RETURN previous.after_data - 'result';
  END IF;
  IF profile.revision <> p_expected_revision THEN
    RAISE EXCEPTION 'Profile revision conflict' USING ERRCODE = 'PT409';
  END IF;
  UPDATE public.media_profiles SET display_name = name, revision = revision + 1, updated_at = now()
    WHERE user_id = actor;
  confirmed := public.media_admin_profile();
  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, before_data, after_data)
    VALUES (actor, 'profile-update', actor::text, p_request_id,
      jsonb_build_object('displayName', profile.display_name, 'revision', profile.revision),
      confirmed || jsonb_build_object('result', 'saved'));
  RETURN confirmed;
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_update_profile(text, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_update_profile(text, bigint, uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

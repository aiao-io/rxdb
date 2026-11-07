BEGIN;
ALTER TABLE public.media_accounts ADD COLUMN IF NOT EXISTS auth_state text NOT NULL DEFAULT 'unchanged'
  CHECK (auth_state IN ('unchanged', 'pending', 'applied'));

CREATE OR REPLACE FUNCTION public.media_admin_authorized(p_actor uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.media_admin_memberships m WHERE m.user_id = p_actor AND m.enabled)
    AND NOT EXISTS (SELECT 1 FROM public.media_accounts a WHERE a.user_id = p_actor AND a.disabled);
$$;
REVOKE ALL ON FUNCTION public.media_admin_authorized(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_authorized(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.media_admin_set_account(
  p_actor uuid, p_target uuid, p_revision bigint, p_disabled boolean, p_request_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_before public.media_accounts; v_after public.media_accounts; v_receipt public.media_admin_audit; v_admins bigint;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-admin-memberships', 0));
  IF NOT public.media_admin_authorized(p_actor) THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NULL OR p_target IS NULL OR p_disabled IS NULL OR p_revision IS NULL THEN
    RAISE EXCEPTION 'Invalid account operation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_receipt FROM public.media_admin_audit WHERE actor_id = p_actor AND request_id = p_request_id;
  IF v_receipt.id IS NOT NULL THEN
    IF v_receipt.action <> 'account-state' OR v_receipt.target_id <> p_target::text OR
      (v_receipt.after_data->>'disabled')::boolean IS DISTINCT FROM p_disabled THEN
      RAISE EXCEPTION 'Operation ID reused' USING ERRCODE = '22023';
    END IF;
    RETURN v_receipt.after_data;
  END IF;
  SELECT * INTO v_before FROM public.media_accounts WHERE user_id = p_target FOR UPDATE;
  IF COALESCE(v_before.revision, 0) <> p_revision THEN
    RAISE EXCEPTION 'Account revision conflict' USING ERRCODE = 'PT409';
  END IF;
  IF p_disabled AND public.media_admin_authorized(p_target) THEN
    SELECT count(*) INTO v_admins FROM public.media_admin_memberships m
      WHERE m.enabled AND NOT EXISTS (SELECT 1 FROM public.media_accounts a WHERE a.user_id = m.user_id AND a.disabled);
    IF v_admins <= 1 THEN RAISE EXCEPTION 'The last administrator must remain enabled' USING ERRCODE = '23514'; END IF;
  END IF;
  INSERT INTO public.media_accounts(user_id, disabled, revision, auth_state)
    VALUES (p_target, p_disabled, 1, 'pending')
    ON CONFLICT (user_id) DO UPDATE SET disabled = p_disabled, revision = public.media_accounts.revision + 1,
      auth_state = 'pending', updated_at = pg_catalog.now() RETURNING * INTO v_after;
  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, before_data, after_data)
    VALUES (p_actor, 'account-state', p_target::text, p_request_id, pg_catalog.to_jsonb(v_before), pg_catalog.to_jsonb(v_after));
  RETURN pg_catalog.to_jsonb(v_after);
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_set_account(uuid, uuid, bigint, boolean, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_set_account(uuid, uuid, bigint, boolean, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.media_admin_auth_applied(p_actor uuid, p_target uuid, p_revision bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF NOT public.media_admin_authorized(p_actor) THEN RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501'; END IF;
  UPDATE public.media_accounts SET auth_state = 'applied' WHERE user_id = p_target AND revision = p_revision;
  RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_auth_applied(uuid, uuid, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_auth_applied(uuid, uuid, bigint) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

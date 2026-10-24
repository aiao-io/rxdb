BEGIN;
CREATE OR REPLACE FUNCTION public.media_trusted_membership(p_target uuid, p_enabled boolean, p_revision bigint, p_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE old_row public.media_admin_memberships; new_row public.media_admin_memberships; receipt public.media_admin_audit; admins bigint;
  operator_id constant uuid := '00000000-0000-0000-0000-000000000000';
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('media-admin-memberships',0));
  IF p_target IS NULL OR p_enabled IS NULL OR p_revision IS NULL OR p_request_id IS NULL THEN RAISE EXCEPTION 'Invalid trusted operation' USING ERRCODE='22023'; END IF;
  SELECT * INTO receipt FROM public.media_admin_audit WHERE actor_id=operator_id AND request_id=p_request_id;
  IF receipt.id IS NOT NULL THEN
    IF receipt.action<>'trusted-membership' OR receipt.target_id<>p_target::text OR (receipt.after_data->>'enabled')::boolean IS DISTINCT FROM p_enabled THEN RAISE EXCEPTION 'Operation ID reused' USING ERRCODE='22023'; END IF;
    RETURN receipt.after_data;
  END IF;
  SELECT * INTO old_row FROM public.media_admin_memberships WHERE user_id=p_target FOR UPDATE;
  IF COALESCE(old_row.revision,0)<>p_revision THEN RAISE EXCEPTION 'Membership revision conflict' USING ERRCODE='PT409'; END IF;
  IF NOT p_enabled AND public.media_admin_authorized(p_target) THEN
    SELECT count(*) INTO admins FROM public.media_admin_memberships m WHERE m.enabled AND NOT EXISTS (SELECT 1 FROM public.media_accounts a WHERE a.user_id=m.user_id AND a.disabled);
    IF admins<=1 THEN RAISE EXCEPTION 'Last administrator must remain enabled' USING ERRCODE='23514'; END IF;
  END IF;
  INSERT INTO public.media_admin_memberships(user_id,enabled,revision) VALUES(p_target,p_enabled,1)
    ON CONFLICT(user_id) DO UPDATE SET enabled=p_enabled,revision=public.media_admin_memberships.revision+1 RETURNING * INTO new_row;
  INSERT INTO public.media_admin_audit(actor_id,action,target_id,request_id,before_data,after_data)
    VALUES(operator_id,'trusted-membership',p_target::text,p_request_id,pg_catalog.to_jsonb(old_row),pg_catalog.to_jsonb(new_row));
  RETURN pg_catalog.to_jsonb(new_row);
END;
$$;
REVOKE ALL ON FUNCTION public.media_trusted_membership(uuid,boolean,bigint,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.media_trusted_membership(uuid,boolean,bigint,uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

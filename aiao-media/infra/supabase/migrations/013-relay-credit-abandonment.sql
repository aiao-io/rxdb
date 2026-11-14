BEGIN;
CREATE OR REPLACE FUNCTION public.media_abort_credits(
  p_owner uuid, p_task uuid, p_cost integer, p_fingerprint text, p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hold public.media_credit_reservations;
BEGIN
  IF p_owner IS NULL OR p_task IS NULL OR p_cost IS NULL OR p_cost <= 0 OR
    p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid credit abandonment' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_task::text, 12));
  SELECT * INTO v_hold FROM public.media_credit_reservations WHERE task_id = p_task FOR UPDATE;
  IF v_hold.task_id IS NULL THEN
    INSERT INTO public.media_credit_reservations(task_id, user_id, cost, fingerprint, token_hash, state)
      VALUES (p_task, p_owner, p_cost, p_fingerprint, p_token_hash, 'released') RETURNING * INTO v_hold;
    RETURN pg_catalog.to_jsonb(v_hold);
  END IF;
  IF v_hold.user_id <> p_owner OR v_hold.cost <> p_cost OR v_hold.fingerprint <> p_fingerprint OR v_hold.token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'Task ID reused' USING ERRCODE = 'PT409';
  END IF;
  IF v_hold.state = 'reserved' THEN RETURN public.media_settle_credits(p_task, false); END IF;
  RETURN pg_catalog.to_jsonb(v_hold);
END;
$$;
REVOKE ALL ON FUNCTION public.media_abort_credits(uuid, uuid, integer, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_abort_credits(uuid, uuid, integer, text, text) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

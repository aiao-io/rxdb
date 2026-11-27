BEGIN;
CREATE TABLE IF NOT EXISTS public.media_credit_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
  reserved integer NOT NULL DEFAULT 0 CHECK (reserved >= 0 AND reserved <= balance)
);
CREATE TABLE IF NOT EXISTS public.media_credit_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  delta integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  source text NOT NULL CHECK (source IN ('admin', 'generation')),
  request_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, request_id)
);
CREATE INDEX IF NOT EXISTS media_credit_ledger_user ON public.media_credit_ledger(user_id, id DESC);
CREATE TABLE IF NOT EXISTS public.media_credit_reservations (
  task_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cost integer NOT NULL CHECK (cost > 0),
  fingerprint text NOT NULL,
  token_hash text NOT NULL,
  state text NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'released', 'charged')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.media_credit_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.media_credit_accounts, public.media_credit_ledger, public.media_credit_reservations
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.media_credit_accounts, public.media_credit_ledger TO authenticated, service_role;
GRANT SELECT ON public.media_credit_reservations TO service_role;
DROP POLICY IF EXISTS media_self_credits ON public.media_credit_accounts;
CREATE POLICY media_self_credits ON public.media_credit_accounts FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT media_private.account_enabled()));
DROP POLICY IF EXISTS media_self_credit_entries ON public.media_credit_ledger;
CREATE POLICY media_self_credit_entries ON public.media_credit_ledger FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()) AND (SELECT media_private.account_enabled()));

CREATE OR REPLACE FUNCTION public.media_admin_adjust_credits(
  p_actor uuid, p_target uuid, p_delta integer, p_reason text, p_request_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account public.media_credit_accounts; v_entry public.media_credit_ledger;
BEGIN
  IF NOT public.media_admin_authorized(p_actor) THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_target IS NULL OR p_request_id IS NULL OR p_delta IS NULL OR p_delta = 0 OR
    p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 500 THEN
    RAISE EXCEPTION 'Invalid credit adjustment' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_request_id::text, 12));
  SELECT * INTO v_entry FROM public.media_credit_ledger WHERE source = 'admin' AND request_id = p_request_id;
  IF v_entry.id IS NOT NULL THEN
    IF v_entry.user_id <> p_target OR v_entry.actor_id <> p_actor OR v_entry.delta <> p_delta OR v_entry.reason <> btrim(p_reason) THEN
      RAISE EXCEPTION 'Operation ID reused' USING ERRCODE = 'PT409';
    END IF;
    RETURN pg_catalog.to_jsonb(v_entry);
  END IF;
  INSERT INTO public.media_credit_accounts(user_id) VALUES (p_target) ON CONFLICT DO NOTHING;
  SELECT * INTO v_account FROM public.media_credit_accounts WHERE user_id = p_target FOR UPDATE;
  IF v_account.balance::bigint + p_delta < v_account.reserved THEN
    RAISE EXCEPTION 'Insufficient available credits' USING ERRCODE = 'PT402';
  END IF;
  IF v_account.balance::bigint + p_delta > 2147483647 THEN
    RAISE EXCEPTION 'Credit balance limit exceeded' USING ERRCODE = '22023';
  END IF;
  UPDATE public.media_credit_accounts SET balance = balance + p_delta WHERE user_id = p_target RETURNING * INTO v_account;
  INSERT INTO public.media_credit_ledger(user_id, actor_id, delta, balance_after, reason, source, request_id)
    VALUES (p_target, p_actor, p_delta, v_account.balance, btrim(p_reason), 'admin', p_request_id) RETURNING * INTO v_entry;
  INSERT INTO public.media_admin_audit(actor_id, action, target_id, request_id, after_data)
    VALUES (p_actor, 'credits-adjust', p_target::text, p_request_id, pg_catalog.to_jsonb(v_entry));
  RETURN pg_catalog.to_jsonb(v_entry);
END;
$$;

CREATE OR REPLACE FUNCTION public.media_reserve_credits(
  p_owner uuid, p_task uuid, p_cost integer, p_fingerprint text, p_token_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_account public.media_credit_accounts; v_hold public.media_credit_reservations;
BEGIN
  IF p_owner IS NULL OR p_task IS NULL OR p_cost IS NULL OR p_cost <= 0 OR
    p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' OR p_token_hash IS NULL OR p_token_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'Invalid credit reservation' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.media_accounts WHERE user_id = p_owner AND disabled) THEN
    RAISE EXCEPTION 'Account disabled' USING ERRCODE = '42501';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_task::text, 12));
  SELECT * INTO v_hold FROM public.media_credit_reservations WHERE task_id = p_task;
  IF v_hold.task_id IS NOT NULL THEN
    IF v_hold.user_id <> p_owner OR v_hold.cost <> p_cost OR v_hold.fingerprint <> p_fingerprint OR v_hold.token_hash <> p_token_hash THEN
      RAISE EXCEPTION 'Task ID reused' USING ERRCODE = 'PT409';
    END IF;
    RETURN pg_catalog.to_jsonb(v_hold);
  END IF;
  INSERT INTO public.media_credit_accounts(user_id) VALUES (p_owner) ON CONFLICT DO NOTHING;
  SELECT * INTO v_account FROM public.media_credit_accounts WHERE user_id = p_owner FOR UPDATE;
  IF v_account.balance - v_account.reserved < p_cost THEN
    RAISE EXCEPTION 'Insufficient available credits' USING ERRCODE = 'PT402';
  END IF;
  UPDATE public.media_credit_accounts SET reserved = reserved + p_cost WHERE user_id = p_owner;
  INSERT INTO public.media_credit_reservations(task_id, user_id, cost, fingerprint, token_hash)
    VALUES (p_task, p_owner, p_cost, p_fingerprint, p_token_hash) RETURNING * INTO v_hold;
  RETURN pg_catalog.to_jsonb(v_hold);
END;
$$;

CREATE OR REPLACE FUNCTION public.media_settle_credits(p_task uuid, p_received boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hold public.media_credit_reservations; v_balance integer; v_state text;
BEGIN
  IF p_task IS NULL OR p_received IS NULL THEN RAISE EXCEPTION 'Invalid settlement' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_hold FROM public.media_credit_reservations WHERE task_id = p_task FOR UPDATE;
  IF v_hold.task_id IS NULL THEN RAISE EXCEPTION 'Task not found' USING ERRCODE = 'PT404'; END IF;
  v_state := CASE WHEN p_received THEN 'charged' ELSE 'released' END;
  IF v_hold.state = v_state THEN RETURN pg_catalog.to_jsonb(v_hold); END IF;
  IF v_hold.state <> 'reserved' THEN RAISE EXCEPTION 'Task settlement conflict' USING ERRCODE = 'PT409'; END IF;
  UPDATE public.media_credit_accounts SET reserved = reserved - v_hold.cost,
    balance = balance - CASE WHEN p_received THEN v_hold.cost ELSE 0 END
    WHERE user_id = v_hold.user_id RETURNING balance INTO v_balance;
  IF p_received THEN
    INSERT INTO public.media_credit_ledger(user_id, actor_id, delta, balance_after, reason, source, request_id)
      VALUES (v_hold.user_id, v_hold.user_id, -v_hold.cost, v_balance, '图片生成', 'generation', p_task);
  END IF;
  UPDATE public.media_credit_reservations SET state = v_state WHERE task_id = p_task RETURNING * INTO v_hold;
  RETURN pg_catalog.to_jsonb(v_hold);
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_adjust_credits(uuid, uuid, integer, text, uuid),
  public.media_reserve_credits(uuid, uuid, integer, text, text), public.media_settle_credits(uuid, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_adjust_credits(uuid, uuid, integer, text, uuid),
  public.media_reserve_credits(uuid, uuid, integer, text, text), public.media_settle_credits(uuid, boolean) TO service_role;
CREATE OR REPLACE FUNCTION public.media_admin_search_users(p_actor uuid, p_query text, p_page integer, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_result jsonb;
BEGIN
  IF NOT public.media_admin_authorized(p_actor) THEN
    RAISE EXCEPTION 'Administrator authorization required' USING ERRCODE = '42501';
  END IF;
  IF p_query IS NULL OR length(btrim(p_query)) NOT BETWEEN 1 AND 254 OR
    p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid user search' USING ERRCODE = '22023';
  END IF;
  WITH matching AS (
    SELECT id, email FROM auth.users
    WHERE position(lower(btrim(p_query)) in lower(coalesce(email, ''))) > 0 OR position(btrim(p_query) in id::text) > 0
  ), page AS (
    SELECT id, email FROM matching ORDER BY email, id LIMIT p_limit OFFSET (p_page - 1) * p_limit
  )
  SELECT pg_catalog.jsonb_build_object('total', (SELECT count(*) FROM matching),
    'users', coalesce((SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(page)) FROM page), '[]'::jsonb)) INTO v_result;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.media_admin_search_users(uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.media_admin_search_users(uuid, text, integer, integer) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;

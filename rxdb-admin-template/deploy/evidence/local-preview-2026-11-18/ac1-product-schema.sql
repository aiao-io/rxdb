--
-- PostgreSQL database dump
--

\restrict admintemplatemigrationcheck

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: admin_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA admin_private;


ALTER SCHEMA admin_private OWNER TO postgres;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA public;


ALTER SCHEMA public OWNER TO pg_database_owner;

--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: archive_audit(interval, integer, integer); Type: FUNCTION; Schema: admin_private; Owner: postgres
--

CREATE FUNCTION admin_private.archive_audit(p_older_than interval DEFAULT NULL::interval, p_keep_latest integer DEFAULT NULL::integer, p_batch integer DEFAULT 5000) RETURNS integer
    LANGUAGE plpgsql
    SET search_path TO ''
    AS $$
DECLARE
  moved integer;
BEGIN
  IF p_older_than IS NULL AND p_keep_latest IS NULL THEN
    RAISE EXCEPTION 'admin_private.archive_audit needs p_older_than, p_keep_latest or both' USING ERRCODE = '22023';
  END IF;
  IF p_older_than <= interval '0' OR p_keep_latest < 0 OR p_batch IS NULL OR p_batch < 1 THEN
    RAISE EXCEPTION 'admin_private.archive_audit needs a positive age, a non-negative count and a positive batch'
      USING ERRCODE = '22023';
  END IF;
  WITH boundaries AS (
    -- 每个工作区热表里第 p_keep_latest + 1 新的事件的 seq：它与更早的事件都不在保留窗口之内（索引逆序扫描，不读整表）
    SELECT w.team_id, w.app_id,
      (SELECT h.seq FROM public.admin_audit h WHERE h.team_id = w.team_id AND h.app_id = w.app_id
        ORDER BY h.seq DESC OFFSET p_keep_latest LIMIT 1) AS seq
    FROM admin_private.workspaces w
    WHERE p_keep_latest IS NOT NULL
  ), picked AS (
    SELECT a.team_id, a.app_id, a.id
    FROM public.admin_audit a
    LEFT JOIN boundaries b ON b.team_id = a.team_id AND b.app_id = a.app_id
    WHERE (p_older_than IS NOT NULL AND a.created_at < now() - p_older_than)
      OR (b.seq IS NOT NULL AND a.seq <= b.seq)
    ORDER BY a.seq
    LIMIT p_batch
    FOR UPDATE OF a SKIP LOCKED
  ), removed AS (
    DELETE FROM public.admin_audit a USING picked p
    WHERE a.team_id = p.team_id AND a.app_id = p.app_id AND a.id = p.id
    RETURNING a.team_id, a.app_id, a.id, a.actor_id, a.action, a.details, a.created_at, a.seq, a.pr_id, a.thread_id
  )
  INSERT INTO admin_private.audit_archive(team_id, app_id, id, actor_id, action, details, created_at, seq, pr_id, thread_id)
  SELECT r.team_id, r.app_id, r.id, r.actor_id, r.action, r.details, r.created_at, r.seq, r.pr_id, r.thread_id
  FROM removed r;
  GET DIAGNOSTICS moved = ROW_COUNT;
  RETURN moved;
END $$;


ALTER FUNCTION admin_private.archive_audit(p_older_than interval, p_keep_latest integer, p_batch integer) OWNER TO postgres;

--
-- Name: broadcast(jsonb, text, text); Type: FUNCTION; Schema: admin_private; Owner: postgres
--

CREATE FUNCTION admin_private.broadcast(payload jsonb, event text, topic text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO ''
    AS $_$
BEGIN
  IF topic IS NULL OR topic !~ '^collab:[^:]+:[^:]+$' OR event IS NULL OR event NOT IN ('changed', 'revoked') THEN
    RAISE EXCEPTION 'admin_private.broadcast only sends collaboration invalidations' USING ERRCODE = '42501';
  END IF;
  PERFORM realtime.send(payload, event, topic, true);
END $_$;


ALTER FUNCTION admin_private.broadcast(payload jsonb, event text, topic text) OWNER TO postgres;

--
-- Name: can_manage(text, text); Type: FUNCTION; Schema: admin_private; Owner: postgres
--

CREATE FUNCTION admin_private.can_manage(wanted_team text, wanted_app text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM admin_private.memberships m WHERE m.team_id = wanted_team
    AND m.app_id = wanted_app AND m.user_id = auth.uid()::text AND m.can_read AND 'manage' = ANY (m.permissions))
$$;


ALTER FUNCTION admin_private.can_manage(wanted_team text, wanted_app text) OWNER TO postgres;

--
-- Name: can_read(text, text); Type: FUNCTION; Schema: admin_private; Owner: postgres
--

CREATE FUNCTION admin_private.can_read(wanted_team text, wanted_app text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM admin_private.memberships m WHERE m.team_id = wanted_team
    AND m.app_id = wanted_app AND m.user_id = auth.uid()::text AND m.can_read)
$$;


ALTER FUNCTION admin_private.can_read(wanted_team text, wanted_app text) OWNER TO postgres;

--
-- Name: can_read_topic(text); Type: FUNCTION; Schema: admin_private; Owner: postgres
--

CREATE FUNCTION admin_private.can_read_topic(wanted_topic text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT EXISTS (SELECT 1 FROM admin_private.memberships m WHERE m.user_id = auth.uid()::text AND m.can_read
    AND 'collab:' || m.team_id || ':' || m.app_id = wanted_topic)
$$;


ALTER FUNCTION admin_private.can_read_topic(wanted_topic text) OWNER TO postgres;

--
-- Name: admin_audit_page(text, text, bigint, integer, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_audit_page(p_team_id text, p_app_id text, p_before bigint, p_limit integer, p_pr_id text DEFAULT NULL::text, p_thread_id text DEFAULT NULL::text) RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
DECLARE
  v_before bigint := coalesce(p_before, 9223372036854775807);
  v_page jsonb;
BEGIN
  IF NOT admin_private.can_read(p_team_id, p_app_id) THEN
    RETURN NULL;
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 101 THEN
    RAISE EXCEPTION 'admin_audit_page reads 1 to 101 events per page' USING ERRCODE = '22023';
  END IF;
  IF p_pr_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'seq', e.seq, 'details', e.details) ORDER BY e.seq DESC), '[]')
    INTO v_page
    FROM (
      SELECT u.id, u.seq, u.details FROM (
        (SELECT a.id, a.seq, a.details FROM public.admin_audit a
          WHERE a.team_id = p_team_id AND a.app_id = p_app_id AND a.pr_id = p_pr_id AND a.seq < v_before
            AND (p_thread_id IS NULL OR a.thread_id = p_thread_id)
          ORDER BY a.seq DESC LIMIT p_limit)
        UNION ALL
        (SELECT r.id, r.seq, r.details FROM admin_private.audit_archive r
          WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.pr_id = p_pr_id AND r.seq < v_before
            AND (p_thread_id IS NULL OR r.thread_id = p_thread_id)
          ORDER BY r.seq DESC LIMIT p_limit)
      ) u ORDER BY u.seq DESC LIMIT p_limit
    ) e;
  ELSIF p_thread_id IS NOT NULL THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'seq', e.seq, 'details', e.details) ORDER BY e.seq DESC), '[]')
    INTO v_page
    FROM (
      SELECT u.id, u.seq, u.details FROM (
        (SELECT a.id, a.seq, a.details FROM public.admin_audit a
          WHERE a.team_id = p_team_id AND a.app_id = p_app_id AND a.thread_id = p_thread_id AND a.seq < v_before
          ORDER BY a.seq DESC LIMIT p_limit)
        UNION ALL
        (SELECT r.id, r.seq, r.details FROM admin_private.audit_archive r
          WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.thread_id = p_thread_id AND r.seq < v_before
          ORDER BY r.seq DESC LIMIT p_limit)
      ) u ORDER BY u.seq DESC LIMIT p_limit
    ) e;
  ELSE
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'seq', e.seq, 'details', e.details) ORDER BY e.seq DESC), '[]')
    INTO v_page
    FROM (
      SELECT u.id, u.seq, u.details FROM (
        (SELECT a.id, a.seq, a.details FROM public.admin_audit a
          WHERE a.team_id = p_team_id AND a.app_id = p_app_id AND a.seq < v_before
          ORDER BY a.seq DESC LIMIT p_limit)
        UNION ALL
        (SELECT r.id, r.seq, r.details FROM admin_private.audit_archive r
          WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.seq < v_before
          ORDER BY r.seq DESC LIMIT p_limit)
      ) u ORDER BY u.seq DESC LIMIT p_limit
    ) e;
  END IF;
  RETURN v_page;
END $$;


ALTER FUNCTION public.admin_audit_page(p_team_id text, p_app_id text, p_before bigint, p_limit integer, p_pr_id text, p_thread_id text) OWNER TO postgres;

--
-- Name: admin_commit_changes(text, text, text[], text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_commit_changes(p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    SELECT coalesce(jsonb_agg(jsonb_build_object('commit_id', x.commit_id, 'sequence', x.sequence,
        'unit_id', x.unit_id, 'transaction_id', x.transaction_id, 'namespace', x.namespace, 'entity', x.entity,
        'entity_id', x.entity_id, 'operation', x.operation, 'patch', x.patch, 'inverse_patch', x.inverse_patch,
        'origin', x.origin) ORDER BY x.commit_id, x.sequence), '[]'::jsonb)
    FROM admin_private.commit_changes x
    WHERE x.team_id = p_team_id AND x.app_id = p_app_id AND x.commit_id = ANY (p_commit_ids)
      AND (p_record_ids IS NULL OR x.entity_id = ANY (p_record_ids))
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;


ALTER FUNCTION public.admin_commit_changes(p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[]) OWNER TO postgres;

--
-- Name: admin_commit_exchange(text, text, text, text[], integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_commit_exchange(p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  WITH RECURSIVE
  branch AS (
    SELECT r.head FROM admin_private.refs r
    WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.ref = p_ref
  ),
  known AS (
    SELECT c.id, c.parent_ids FROM admin_private.commits c
    WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = ANY (coalesce(p_known, '{}'::text[]))
    UNION
    SELECT c.id, c.parent_ids FROM known k
    CROSS JOIN LATERAL unnest(k.parent_ids) AS parent(id)
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = parent.id
  ),
  mainline AS (
    SELECT c.id, c.parent_ids, 0 AS depth FROM admin_private.commits c
    JOIN branch ON c.id = branch.head
    WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
    UNION ALL
    SELECT c.id, c.parent_ids, m.depth + 1 FROM mainline m
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = m.parent_ids[1]
    WHERE NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
  ),
  side AS (
    SELECT m.depth AS owner, c.id, c.parent_ids, 1 AS step FROM mainline m
    CROSS JOIN LATERAL unnest(m.parent_ids[2:]) AS parent(id)
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = parent.id
    WHERE NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
      AND NOT EXISTS (SELECT 1 FROM mainline x WHERE x.id = c.id)
    UNION
    SELECT s.owner, c.id, c.parent_ids, s.step + 1 FROM side s
    CROSS JOIN LATERAL unnest(s.parent_ids) AS parent(id)
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = parent.id
    WHERE NOT EXISTS (SELECT 1 FROM known WHERE known.id = c.id)
      AND NOT EXISTS (SELECT 1 FROM mainline x WHERE x.id = c.id)
  ),
  -- 侧枝提交归到最早把它带进来的主线提交（离头最远，depth 最大）；组内按到那个合并提交的最长距离由远到近，父因此先于子
  side_group AS (
    SELECT id, max(owner) AS owner FROM side GROUP BY id
  ),
  ordered AS (
    SELECT s.id, g.owner AS grp, max(s.step) AS rank FROM side s
    JOIN side_group g ON g.id = s.id AND g.owner = s.owner
    GROUP BY s.id, g.owner
    UNION ALL
    SELECT id, depth, 0 FROM mainline
  ),
  numbered AS (
    SELECT id, row_number() OVER (ORDER BY grp DESC, rank DESC) AS position,
      count(*) OVER (ORDER BY grp DESC) AS through_group
    FROM ordered
  ),
  page AS (
    SELECT id, position FROM numbered
    WHERE through_group <= greatest(greatest(1, least(p_limit, 100)), (SELECT min(through_group) FROM numbered))
  )
  SELECT jsonb_build_object(
    'head', (SELECT head FROM branch),
    'more', (SELECT count(*) FROM numbered) > (SELECT count(*) FROM page),
    'commits', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
          'commitId', c.id, 'parentIds', to_jsonb(c.parent_ids), 'kind', c.kind, 'message', c.message,
          'authorId', c.author_id,
          'createdAt', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'contentFingerprint', c.content_fingerprint,
          'units', coalesce((
            SELECT jsonb_agg(jsonb_build_object('unitId', x.unit_id, 'transactionId', x.transaction_id,
                'namespace', x.namespace, 'entity', x.entity, 'entityId', x.entity_id, 'operation', x.operation,
                'patch', x.patch, 'inversePatch', x.inverse_patch, 'origin', x.origin) ORDER BY x.sequence)
            FROM admin_private.commit_changes x
            WHERE x.team_id = p_team_id AND x.app_id = p_app_id AND x.commit_id = c.id), '[]'::jsonb))
        ORDER BY page.position)
      FROM page
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = page.id), '[]'::jsonb))
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;


ALTER FUNCTION public.admin_commit_exchange(p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer) OWNER TO postgres;

--
-- Name: admin_commit_history(text, text, text, text, integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_commit_history(p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.first_parent, 1 AS depth FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_from AND p_limit >= 1
        AND c.id IS DISTINCT FROM p_until
      UNION ALL
      SELECT c.id, c.first_parent, chain.depth + 1 FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.first_parent
      WHERE chain.depth < least(p_limit, 101) AND c.id IS DISTINCT FROM p_until
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'parent_ids', to_jsonb(c.parent_ids), 'kind', c.kind,
        'author_id', c.author_id, 'message', c.message, 'candidate_id', c.candidate_id,
        'created_at', to_char(c.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) ORDER BY chain.depth),
      '[]'::jsonb)
    FROM chain
    JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.id
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;


ALTER FUNCTION public.admin_commit_history(p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer) OWNER TO postgres;

--
-- Name: admin_commit_lineage(text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.first_parent AS parent_id, c.kind FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_id
      UNION
      SELECT c.id, c.first_parent, c.kind FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE chain.kind = 'normal'
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'kind', kind)), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;


ALTER FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text) OWNER TO postgres;

--
-- Name: admin_commit_path(text, text, text, text); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT (
    WITH RECURSIVE chain AS (
      SELECT c.id, c.first_parent AS parent_id, c.kind FROM admin_private.commits c
      WHERE c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = p_from AND c.id IS DISTINCT FROM p_until
      UNION
      SELECT c.id, c.first_parent, c.kind FROM chain
      JOIN admin_private.commits c ON c.team_id = p_team_id AND c.app_id = p_app_id AND c.id = chain.parent_id
      WHERE c.id IS DISTINCT FROM p_until
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'parent_id', parent_id, 'kind', kind)), '[]'::jsonb)
    FROM chain
  )
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;


ALTER FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text) OWNER TO postgres;

--
-- Name: admin_shared_records(text, text, text[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION public.admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[] DEFAULT NULL::text[]) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO ''
    AS $$
  SELECT jsonb_build_object(
    'head', (SELECT r.head FROM admin_private.refs r
      WHERE r.team_id = p_team_id AND r.app_id = p_app_id AND r.ref = 'shared'),
    'records', (SELECT coalesce(jsonb_agg(jsonb_build_object('record_id', s.record_id, 'entity', s.entity,
        'fields', s.fields) ORDER BY s.record_id), '[]'::jsonb)
      FROM public.shared_records s
      WHERE s.team_id = p_team_id AND s.app_id = p_app_id
        AND (p_record_ids IS NULL OR s.record_id = ANY (p_record_ids))))
  WHERE admin_private.can_read(p_team_id, p_app_id)
$$;


ALTER FUNCTION public.admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[]) OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_archive; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.audit_archive (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    details jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    seq bigint NOT NULL,
    pr_id text,
    thread_id text,
    archived_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE admin_private.audit_archive OWNER TO postgres;

--
-- Name: candidates; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.candidates (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    pr_id text NOT NULL,
    base text,
    source text NOT NULL,
    target text,
    schema_version integer NOT NULL,
    policy_version integer NOT NULL,
    resolutions jsonb NOT NULL,
    conflicts jsonb NOT NULL,
    checks jsonb NOT NULL,
    actor_id text NOT NULL,
    at bigint NOT NULL,
    changes jsonb NOT NULL,
    seq bigint NOT NULL
);


ALTER TABLE admin_private.candidates OWNER TO postgres;

--
-- Name: candidates_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.candidates ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.candidates_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: comments; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.comments (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    thread_id text NOT NULL,
    author_id text NOT NULL,
    body text NOT NULL,
    deleted boolean NOT NULL,
    revision integer NOT NULL,
    at bigint NOT NULL,
    seq bigint NOT NULL
);


ALTER TABLE admin_private.comments OWNER TO postgres;

--
-- Name: comments_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.comments ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.comments_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: commit_changes; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.commit_changes (
    team_id text NOT NULL,
    app_id text NOT NULL,
    commit_id text NOT NULL,
    sequence integer NOT NULL,
    namespace text NOT NULL,
    entity text NOT NULL,
    entity_id text NOT NULL,
    operation text NOT NULL,
    patch jsonb,
    inverse_patch jsonb,
    unit_id text NOT NULL,
    transaction_id text,
    origin text NOT NULL,
    CONSTRAINT commit_changes_check CHECK ((((operation = 'insert'::text) AND (patch IS NOT NULL) AND (inverse_patch IS NULL)) OR ((operation = 'update'::text) AND (patch IS NOT NULL) AND (inverse_patch IS NOT NULL)) OR ((operation = 'delete'::text) AND (patch IS NULL) AND (inverse_patch IS NOT NULL)))),
    CONSTRAINT commit_changes_origin CHECK ((origin = ANY (ARRAY['local'::text, 'remote_sync'::text])))
);


ALTER TABLE admin_private.commit_changes OWNER TO postgres;

--
-- Name: commits; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.commits (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    author_id text,
    message text NOT NULL,
    candidate_id text,
    content_fingerprint text NOT NULL,
    seq bigint NOT NULL,
    created_at timestamp with time zone NOT NULL,
    parent_ids text[] NOT NULL,
    kind text NOT NULL,
    first_parent text GENERATED ALWAYS AS (parent_ids[1]) STORED,
    merge_parent text GENERATED ALWAYS AS (parent_ids[2]) STORED,
    CONSTRAINT commits_exchange_shape CHECK ((((kind = 'normal'::text) AND (cardinality(parent_ids) = 1) AND (author_id IS NOT NULL) AND (candidate_id IS NULL)) OR ((kind = 'merge'::text) AND (cardinality(parent_ids) = 2) AND (parent_ids[1] <> parent_ids[2]) AND (author_id IS NOT NULL) AND (candidate_id IS NOT NULL)) OR ((kind = 'baseline'::text) AND (cardinality(parent_ids) = 0) AND (author_id IS NULL) AND (candidate_id IS NULL)))),
    CONSTRAINT commits_fingerprint_check CHECK ((content_fingerprint ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT commits_message_present CHECK ((btrim(message) <> ''::text))
);


ALTER TABLE admin_private.commits OWNER TO postgres;

--
-- Name: commits_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.commits ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.commits_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invitations; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.invitations (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    email text NOT NULL,
    permissions text[] NOT NULL,
    inviter_id text NOT NULL,
    token_hash text NOT NULL,
    version integer NOT NULL,
    expires_at bigint NOT NULL,
    state text NOT NULL,
    accepted_by text,
    seq bigint NOT NULL,
    CONSTRAINT invitations_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'revoked'::text, 'accepted'::text])))
);


ALTER TABLE admin_private.invitations OWNER TO postgres;

--
-- Name: invitations_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.invitations ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.invitations_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: memberships; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.memberships (
    team_id text NOT NULL,
    app_id text NOT NULL,
    user_id text NOT NULL,
    email text DEFAULT ''::text NOT NULL,
    permissions text[] DEFAULT '{}'::text[] NOT NULL,
    generation integer DEFAULT 0 NOT NULL,
    active boolean DEFAULT false NOT NULL,
    seq bigint NOT NULL,
    can_read boolean GENERATED ALWAYS AS ((active AND ('read'::text = ANY (permissions)))) STORED
);


ALTER TABLE admin_private.memberships OWNER TO postgres;

--
-- Name: memberships_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.memberships ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.memberships_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: notifications; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.notifications (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    user_id text NOT NULL,
    pr_id text NOT NULL,
    thread_id text,
    candidate_id text,
    read boolean NOT NULL,
    at bigint NOT NULL,
    seq bigint NOT NULL
);


ALTER TABLE admin_private.notifications OWNER TO postgres;

--
-- Name: notifications_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.notifications ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.notifications_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: operations; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.operations (
    team_id text NOT NULL,
    app_id text NOT NULL,
    operation_id text NOT NULL,
    actor_id text NOT NULL,
    fingerprint text NOT NULL,
    result jsonb NOT NULL,
    at bigint NOT NULL
);


ALTER TABLE admin_private.operations OWNER TO postgres;

--
-- Name: policies; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.policies (
    team_id text NOT NULL,
    app_id text NOT NULL,
    version integer NOT NULL,
    stages jsonb NOT NULL,
    CONSTRAINT policies_stages_check CHECK ((jsonb_typeof(stages) = 'array'::text))
);


ALTER TABLE admin_private.policies OWNER TO postgres;

--
-- Name: prs; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.prs (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    task_id text NOT NULL,
    author_id text NOT NULL,
    title text NOT NULL,
    description text NOT NULL,
    target text NOT NULL,
    status text NOT NULL,
    revision integer NOT NULL,
    candidate_id text,
    subscribers text[] DEFAULT '{}'::text[] NOT NULL,
    seq bigint NOT NULL,
    CONSTRAINT prs_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'review'::text, 'closed'::text, 'merged'::text]))),
    CONSTRAINT prs_target_check CHECK ((target = 'shared'::text))
);


ALTER TABLE admin_private.prs OWNER TO postgres;

--
-- Name: prs_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.prs ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.prs_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: record_keys; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.record_keys (
    team_id text NOT NULL,
    app_id text NOT NULL,
    record_id text NOT NULL,
    kind text NOT NULL,
    entity text NOT NULL,
    field text NOT NULL,
    value text NOT NULL,
    CONSTRAINT record_keys_kind_check CHECK ((kind = ANY (ARRAY['unique'::text, 'reference'::text])))
);


ALTER TABLE admin_private.record_keys OWNER TO postgres;

--
-- Name: refs; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.refs (
    team_id text NOT NULL,
    app_id text NOT NULL,
    ref text NOT NULL,
    head text,
    revision bigint DEFAULT 0 NOT NULL,
    CONSTRAINT refs_ref_check CHECK (((ref = 'shared'::text) OR (ref ~~ 'tasks/%'::text)))
);


ALTER TABLE admin_private.refs OWNER TO postgres;

--
-- Name: reviews; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.reviews (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    pr_id text NOT NULL,
    reviewer_id text NOT NULL,
    source text,
    candidate_id text,
    stage_id text NOT NULL,
    decision text NOT NULL,
    generation integer NOT NULL,
    revision integer NOT NULL,
    reason text NOT NULL,
    at bigint NOT NULL,
    dismissed_reviewer_id text,
    seq bigint NOT NULL,
    CONSTRAINT reviews_decision_check CHECK ((decision = ANY (ARRAY['approve'::text, 'request_changes'::text, 'dismiss'::text])))
);


ALTER TABLE admin_private.reviews OWNER TO postgres;

--
-- Name: reviews_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.reviews ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.reviews_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: schemas; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.schemas (
    team_id text NOT NULL,
    app_id text NOT NULL,
    version integer NOT NULL,
    manifest jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT schemas_manifest_check CHECK ((jsonb_typeof(manifest) = 'object'::text)),
    CONSTRAINT schemas_version_check CHECK ((version > 0))
);


ALTER TABLE admin_private.schemas OWNER TO postgres;

--
-- Name: tasks; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.tasks (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    owner_id text NOT NULL,
    base text,
    origin_task_id text,
    seq bigint NOT NULL
);


ALTER TABLE admin_private.tasks OWNER TO postgres;

--
-- Name: tasks_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.tasks ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.tasks_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: threads; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.threads (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    pr_id text NOT NULL,
    candidate_id text,
    record_id text,
    field text,
    required boolean NOT NULL,
    resolved boolean NOT NULL,
    resolved_candidate_id text,
    revision integer NOT NULL,
    seq bigint NOT NULL
);


ALTER TABLE admin_private.threads OWNER TO postgres;

--
-- Name: threads_seq_seq; Type: SEQUENCE; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.threads ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME admin_private.threads_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: workspaces; Type: TABLE; Schema: admin_private; Owner: postgres
--

CREATE TABLE admin_private.workspaces (
    team_id text NOT NULL,
    app_id text NOT NULL,
    name text DEFAULT ''::text NOT NULL,
    bootstrap_key text DEFAULT ''::text NOT NULL,
    initial_admin_id text DEFAULT ''::text NOT NULL,
    schema_version integer DEFAULT 1 NOT NULL,
    policy_version integer DEFAULT 1 NOT NULL,
    CONSTRAINT workspaces_topic_safe CHECK (((strpos(team_id, ':'::text) = 0) AND (strpos(app_id, ':'::text) = 0)))
);


ALTER TABLE admin_private.workspaces OWNER TO postgres;

--
-- Name: admin_audit; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_audit (
    team_id text NOT NULL,
    app_id text NOT NULL,
    id text NOT NULL,
    actor_id text NOT NULL,
    action text NOT NULL,
    details jsonb NOT NULL,
    created_at timestamp with time zone NOT NULL,
    seq bigint NOT NULL,
    pr_id text,
    thread_id text
);


ALTER TABLE public.admin_audit OWNER TO postgres;

--
-- Name: admin_audit_events; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_audit_events WITH (security_barrier='true') AS
 SELECT a.team_id,
    a.app_id,
    a.id,
    a.actor_id,
    a.action,
    a.details,
    a.created_at,
    a.seq,
    a.pr_id,
    a.thread_id
   FROM public.admin_audit a
  WHERE admin_private.can_read(a.team_id, a.app_id)
UNION ALL
 SELECT r.team_id,
    r.app_id,
    r.id,
    r.actor_id,
    r.action,
    r.details,
    r.created_at,
    r.seq,
    r.pr_id,
    r.thread_id
   FROM admin_private.audit_archive r
  WHERE admin_private.can_read(r.team_id, r.app_id);


ALTER VIEW public.admin_audit_events OWNER TO postgres;

--
-- Name: admin_audit_seq_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_audit ALTER COLUMN seq ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.admin_audit_seq_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: admin_candidates; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_candidates WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    pr_id,
    base,
    source,
    target,
    schema_version,
    policy_version,
    resolutions,
    conflicts,
    checks,
    actor_id,
    at,
    changes,
    seq
   FROM admin_private.candidates c
  WHERE admin_private.can_read(team_id, app_id);


ALTER VIEW public.admin_candidates OWNER TO postgres;

--
-- Name: admin_changes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_changes (
    team_id text NOT NULL,
    app_id text NOT NULL,
    merge_id text NOT NULL,
    record_id text NOT NULL,
    before_data jsonb,
    after_data jsonb
);


ALTER TABLE public.admin_changes OWNER TO postgres;

--
-- Name: admin_comments; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_comments WITH (security_barrier='true') AS
 SELECT c.team_id,
    c.app_id,
    c.id,
    c.thread_id,
    t.pr_id,
    c.author_id,
    c.body,
    c.deleted,
    c.revision,
    c.at,
    c.seq
   FROM (admin_private.comments c
     JOIN admin_private.threads t ON (((t.team_id = c.team_id) AND (t.app_id = c.app_id) AND (t.id = c.thread_id))))
  WHERE admin_private.can_read(c.team_id, c.app_id);


ALTER VIEW public.admin_comments OWNER TO postgres;

--
-- Name: admin_commits; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_commits WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    parent_ids,
    kind,
    author_id,
    message,
    candidate_id,
    to_char((created_at AT TIME ZONE 'UTC'::text), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'::text) AS created_at,
    seq
   FROM admin_private.commits c
  WHERE admin_private.can_read(team_id, app_id);


ALTER VIEW public.admin_commits OWNER TO postgres;

--
-- Name: admin_invitations; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_invitations WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    email,
    permissions,
    inviter_id,
    version,
    expires_at,
    state,
    accepted_by,
    seq
   FROM admin_private.invitations i
  WHERE admin_private.can_manage(team_id, app_id);


ALTER VIEW public.admin_invitations OWNER TO postgres;

--
-- Name: admin_members; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_members WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    user_id,
    email,
    permissions,
    generation,
    seq
   FROM admin_private.memberships m
  WHERE (active AND admin_private.can_read(team_id, app_id));


ALTER VIEW public.admin_members OWNER TO postgres;

--
-- Name: admin_notifications; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_notifications WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    user_id,
    pr_id,
    thread_id,
    candidate_id,
    read,
    at,
    seq
   FROM admin_private.notifications n
  WHERE ((user_id = (auth.uid())::text) AND admin_private.can_read(team_id, app_id));


ALTER VIEW public.admin_notifications OWNER TO postgres;

--
-- Name: admin_prs; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_prs WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    task_id,
    author_id,
    title,
    description,
    target,
    status,
    revision,
    candidate_id,
    subscribers,
    seq
   FROM admin_private.prs p
  WHERE admin_private.can_read(team_id, app_id);


ALTER VIEW public.admin_prs OWNER TO postgres;

--
-- Name: admin_receipts; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_receipts WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    operation_id,
    result
   FROM admin_private.operations o
  WHERE ((actor_id = (auth.uid())::text) AND (at > (((EXTRACT(epoch FROM now()) * (1000)::numeric))::bigint - '2592000000'::bigint)) AND admin_private.can_read(team_id, app_id));


ALTER VIEW public.admin_receipts OWNER TO postgres;

--
-- Name: admin_reviews; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_reviews WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    pr_id,
    reviewer_id,
    source,
    candidate_id,
    stage_id,
    decision,
    generation,
    revision,
    reason,
    at,
    dismissed_reviewer_id,
    seq
   FROM admin_private.reviews r
  WHERE admin_private.can_read(team_id, app_id);


ALTER VIEW public.admin_reviews OWNER TO postgres;

--
-- Name: admin_schemas; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_schemas WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    version,
    manifest,
    created_at
   FROM admin_private.schemas s
  WHERE admin_private.can_read(team_id, app_id);


ALTER VIEW public.admin_schemas OWNER TO postgres;

--
-- Name: admin_shared; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_shared (
    team_id text NOT NULL,
    app_id text NOT NULL,
    head text
);


ALTER TABLE public.admin_shared OWNER TO postgres;

--
-- Name: admin_tasks; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_tasks WITH (security_barrier='true') AS
 SELECT t.team_id,
    t.app_id,
    t.id,
    t.name,
    t.owner_id,
    t.base,
    t.origin_task_id,
    r.head,
    t.seq
   FROM (admin_private.tasks t
     JOIN admin_private.refs r ON (((r.team_id = t.team_id) AND (r.app_id = t.app_id) AND (r.ref = ('tasks/'::text || t.id)))))
  WHERE admin_private.can_read(t.team_id, t.app_id);


ALTER VIEW public.admin_tasks OWNER TO postgres;

--
-- Name: admin_threads; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_threads WITH (security_barrier='true') AS
 SELECT team_id,
    app_id,
    id,
    pr_id,
    candidate_id,
    record_id,
    field,
    required,
    resolved,
    resolved_candidate_id,
    revision,
    seq
   FROM admin_private.threads t
  WHERE admin_private.can_read(team_id, app_id);


ALTER VIEW public.admin_threads OWNER TO postgres;

--
-- Name: admin_workspace_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.admin_workspace_versions (
    team_id text NOT NULL,
    app_id text NOT NULL,
    revision bigint NOT NULL,
    audit_count bigint DEFAULT 0 NOT NULL
);


ALTER TABLE public.admin_workspace_versions OWNER TO postgres;

--
-- Name: admin_workspaces; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW public.admin_workspaces WITH (security_barrier='true') AS
 SELECT w.team_id,
    w.app_id,
    w.name,
    w.schema_version,
    w.policy_version,
    p.stages AS policy_stages,
    r.head,
    v.revision,
    v.audit_count,
    ( SELECT c.id
           FROM admin_private.commits c
          WHERE ((c.team_id = w.team_id) AND (c.app_id = w.app_id) AND (c.kind = 'baseline'::text))) AS root
   FROM ((((admin_private.memberships m
     JOIN admin_private.workspaces w ON (((w.team_id = m.team_id) AND (w.app_id = m.app_id))))
     JOIN admin_private.policies p ON (((p.team_id = w.team_id) AND (p.app_id = w.app_id) AND (p.version = w.policy_version))))
     JOIN admin_private.refs r ON (((r.team_id = w.team_id) AND (r.app_id = w.app_id) AND (r.ref = 'shared'::text))))
     JOIN public.admin_workspace_versions v ON (((v.team_id = w.team_id) AND (v.app_id = w.app_id))))
  WHERE ((m.user_id = (auth.uid())::text) AND m.can_read);


ALTER VIEW public.admin_workspaces OWNER TO postgres;

--
-- Name: shared_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.shared_records (
    team_id text NOT NULL,
    app_id text NOT NULL,
    record_id text NOT NULL,
    entity text NOT NULL,
    fields jsonb DEFAULT '{}'::jsonb NOT NULL,
    CONSTRAINT shared_records_fields_check CHECK ((jsonb_typeof(fields) = 'object'::text))
);


ALTER TABLE public.shared_records OWNER TO postgres;

--
-- Name: audit_archive audit_archive_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.audit_archive
    ADD CONSTRAINT audit_archive_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: candidates candidates_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.candidates
    ADD CONSTRAINT candidates_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.comments
    ADD CONSTRAINT comments_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: commit_changes commit_changes_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.commit_changes
    ADD CONSTRAINT commit_changes_pkey PRIMARY KEY (team_id, app_id, commit_id, sequence);


--
-- Name: commits commits_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.commits
    ADD CONSTRAINT commits_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.invitations
    ADD CONSTRAINT invitations_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: memberships memberships_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.memberships
    ADD CONSTRAINT memberships_pkey PRIMARY KEY (team_id, app_id, user_id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: operations operations_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.operations
    ADD CONSTRAINT operations_pkey PRIMARY KEY (team_id, app_id, operation_id);


--
-- Name: policies policies_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.policies
    ADD CONSTRAINT policies_pkey PRIMARY KEY (team_id, app_id, version);


--
-- Name: prs prs_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.prs
    ADD CONSTRAINT prs_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: record_keys record_keys_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.record_keys
    ADD CONSTRAINT record_keys_pkey PRIMARY KEY (team_id, app_id, record_id, kind, field);


--
-- Name: refs refs_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.refs
    ADD CONSTRAINT refs_pkey PRIMARY KEY (team_id, app_id, ref);


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.reviews
    ADD CONSTRAINT reviews_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: schemas schemas_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.schemas
    ADD CONSTRAINT schemas_pkey PRIMARY KEY (team_id, app_id, version);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: threads threads_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.threads
    ADD CONSTRAINT threads_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (team_id, app_id);


--
-- Name: admin_audit admin_audit_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_audit
    ADD CONSTRAINT admin_audit_pkey PRIMARY KEY (team_id, app_id, id);


--
-- Name: admin_changes admin_changes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_changes
    ADD CONSTRAINT admin_changes_pkey PRIMARY KEY (team_id, app_id, merge_id, record_id);


--
-- Name: admin_shared admin_shared_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_shared
    ADD CONSTRAINT admin_shared_pkey PRIMARY KEY (team_id, app_id);


--
-- Name: admin_workspace_versions admin_workspace_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_workspace_versions
    ADD CONSTRAINT admin_workspace_versions_pkey PRIMARY KEY (team_id, app_id);


--
-- Name: shared_records shared_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shared_records
    ADD CONSTRAINT shared_records_pkey PRIMARY KEY (team_id, app_id, record_id);


--
-- Name: audit_archive_order; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX audit_archive_order ON admin_private.audit_archive USING btree (team_id, app_id, seq);


--
-- Name: audit_archive_pr; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX audit_archive_pr ON admin_private.audit_archive USING btree (team_id, app_id, pr_id, seq) WHERE (pr_id IS NOT NULL);


--
-- Name: audit_archive_thread; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX audit_archive_thread ON admin_private.audit_archive USING btree (team_id, app_id, thread_id, seq) WHERE (thread_id IS NOT NULL);


--
-- Name: candidates_pr; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX candidates_pr ON admin_private.candidates USING btree (team_id, app_id, pr_id);


--
-- Name: comments_thread; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX comments_thread ON admin_private.comments USING btree (team_id, app_id, thread_id, seq);


--
-- Name: commits_root; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE UNIQUE INDEX commits_root ON admin_private.commits USING btree (team_id, app_id) WHERE (kind = 'baseline'::text);


--
-- Name: memberships_user; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX memberships_user ON admin_private.memberships USING btree (user_id);


--
-- Name: notifications_user; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX notifications_user ON admin_private.notifications USING btree (team_id, app_id, user_id, seq);


--
-- Name: operations_age; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX operations_age ON admin_private.operations USING btree (team_id, app_id, at);


--
-- Name: prs_order; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX prs_order ON admin_private.prs USING btree (team_id, app_id, seq);


--
-- Name: prs_task; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX prs_task ON admin_private.prs USING btree (team_id, app_id, task_id);


--
-- Name: record_keys_value; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX record_keys_value ON admin_private.record_keys USING btree (team_id, app_id, kind, value);


--
-- Name: reviews_pr; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX reviews_pr ON admin_private.reviews USING btree (team_id, app_id, pr_id, seq);


--
-- Name: tasks_owner; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX tasks_owner ON admin_private.tasks USING btree (team_id, app_id, owner_id, seq);


--
-- Name: threads_pr; Type: INDEX; Schema: admin_private; Owner: postgres
--

CREATE INDEX threads_pr ON admin_private.threads USING btree (team_id, app_id, pr_id, seq);


--
-- Name: admin_audit_age; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_audit_age ON public.admin_audit USING btree (created_at);


--
-- Name: admin_audit_order; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_audit_order ON public.admin_audit USING btree (team_id, app_id, seq);


--
-- Name: admin_audit_pr; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_audit_pr ON public.admin_audit USING btree (team_id, app_id, pr_id, seq) WHERE (pr_id IS NOT NULL);


--
-- Name: admin_audit_thread; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX admin_audit_thread ON public.admin_audit USING btree (team_id, app_id, thread_id, seq) WHERE (thread_id IS NOT NULL);


--
-- Name: audit_archive audit_archive_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.audit_archive
    ADD CONSTRAINT audit_archive_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: candidates candidates_team_id_app_id_pr_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.candidates
    ADD CONSTRAINT candidates_team_id_app_id_pr_id_fkey FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id);


--
-- Name: comments comments_team_id_app_id_thread_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.comments
    ADD CONSTRAINT comments_team_id_app_id_thread_id_fkey FOREIGN KEY (team_id, app_id, thread_id) REFERENCES admin_private.threads(team_id, app_id, id);


--
-- Name: commit_changes commit_changes_team_id_app_id_commit_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.commit_changes
    ADD CONSTRAINT commit_changes_team_id_app_id_commit_id_fkey FOREIGN KEY (team_id, app_id, commit_id) REFERENCES admin_private.commits(team_id, app_id, id);


--
-- Name: commits commits_first_parent_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.commits
    ADD CONSTRAINT commits_first_parent_fkey FOREIGN KEY (team_id, app_id, first_parent) REFERENCES admin_private.commits(team_id, app_id, id);


--
-- Name: commits commits_merge_parent_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.commits
    ADD CONSTRAINT commits_merge_parent_fkey FOREIGN KEY (team_id, app_id, merge_parent) REFERENCES admin_private.commits(team_id, app_id, id);


--
-- Name: commits commits_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.commits
    ADD CONSTRAINT commits_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: invitations invitations_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.invitations
    ADD CONSTRAINT invitations_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: memberships memberships_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.memberships
    ADD CONSTRAINT memberships_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: notifications notifications_team_id_app_id_pr_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.notifications
    ADD CONSTRAINT notifications_team_id_app_id_pr_id_fkey FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id);


--
-- Name: operations operations_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.operations
    ADD CONSTRAINT operations_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: policies policies_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.policies
    ADD CONSTRAINT policies_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: prs prs_team_id_app_id_task_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.prs
    ADD CONSTRAINT prs_team_id_app_id_task_id_fkey FOREIGN KEY (team_id, app_id, task_id) REFERENCES admin_private.tasks(team_id, app_id, id);


--
-- Name: record_keys record_keys_team_id_app_id_record_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.record_keys
    ADD CONSTRAINT record_keys_team_id_app_id_record_id_fkey FOREIGN KEY (team_id, app_id, record_id) REFERENCES public.shared_records(team_id, app_id, record_id) ON DELETE CASCADE;


--
-- Name: refs refs_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.refs
    ADD CONSTRAINT refs_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: refs refs_team_id_app_id_head_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.refs
    ADD CONSTRAINT refs_team_id_app_id_head_fkey FOREIGN KEY (team_id, app_id, head) REFERENCES admin_private.commits(team_id, app_id, id);


--
-- Name: reviews reviews_team_id_app_id_pr_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.reviews
    ADD CONSTRAINT reviews_team_id_app_id_pr_id_fkey FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id);


--
-- Name: schemas schemas_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.schemas
    ADD CONSTRAINT schemas_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: tasks tasks_team_id_app_id_base_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.tasks
    ADD CONSTRAINT tasks_team_id_app_id_base_fkey FOREIGN KEY (team_id, app_id, base) REFERENCES admin_private.commits(team_id, app_id, id);


--
-- Name: tasks tasks_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.tasks
    ADD CONSTRAINT tasks_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: tasks tasks_team_id_app_id_origin_task_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.tasks
    ADD CONSTRAINT tasks_team_id_app_id_origin_task_id_fkey FOREIGN KEY (team_id, app_id, origin_task_id) REFERENCES admin_private.tasks(team_id, app_id, id);


--
-- Name: threads threads_team_id_app_id_pr_id_fkey; Type: FK CONSTRAINT; Schema: admin_private; Owner: postgres
--

ALTER TABLE ONLY admin_private.threads
    ADD CONSTRAINT threads_team_id_app_id_pr_id_fkey FOREIGN KEY (team_id, app_id, pr_id) REFERENCES admin_private.prs(team_id, app_id, id);


--
-- Name: admin_audit admin_audit_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_audit
    ADD CONSTRAINT admin_audit_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: admin_changes admin_changes_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_changes
    ADD CONSTRAINT admin_changes_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: admin_shared admin_shared_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_shared
    ADD CONSTRAINT admin_shared_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: admin_workspace_versions admin_workspace_versions_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.admin_workspace_versions
    ADD CONSTRAINT admin_workspace_versions_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: shared_records shared_records_team_id_app_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.shared_records
    ADD CONSTRAINT shared_records_team_id_app_id_fkey FOREIGN KEY (team_id, app_id) REFERENCES admin_private.workspaces(team_id, app_id);


--
-- Name: candidates admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.candidates TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: comments admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.comments TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: commit_changes admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.commit_changes TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: commits admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.commits TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: invitations admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.invitations TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: memberships admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.memberships TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: notifications admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.notifications TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: operations admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.operations TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: policies admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.policies TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: prs admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.prs TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: record_keys admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.record_keys TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: refs admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.refs TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: reviews admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.reviews TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: schemas admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.schemas TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: tasks admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.tasks TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: threads admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.threads TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: workspaces admin_collaboration_service; Type: POLICY; Schema: admin_private; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON admin_private.workspaces TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: audit_archive; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.audit_archive ENABLE ROW LEVEL SECURITY;

--
-- Name: candidates; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.candidates ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.comments ENABLE ROW LEVEL SECURITY;

--
-- Name: commit_changes; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.commit_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: commits; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.commits ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.invitations ENABLE ROW LEVEL SECURITY;

--
-- Name: memberships; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.memberships ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: operations; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.operations ENABLE ROW LEVEL SECURITY;

--
-- Name: policies; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.policies ENABLE ROW LEVEL SECURITY;

--
-- Name: prs; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.prs ENABLE ROW LEVEL SECURITY;

--
-- Name: record_keys; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.record_keys ENABLE ROW LEVEL SECURITY;

--
-- Name: refs; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.refs ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.reviews ENABLE ROW LEVEL SECURITY;

--
-- Name: schemas; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.schemas ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: threads; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.threads ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: admin_private; Owner: postgres
--

ALTER TABLE admin_private.workspaces ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_audit ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_audit admin_audit_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_audit_read ON public.admin_audit FOR SELECT TO authenticated USING (admin_private.can_read(team_id, app_id));


--
-- Name: admin_changes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_changes ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_changes admin_changes_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_changes_read ON public.admin_changes FOR SELECT TO authenticated USING (admin_private.can_read(team_id, app_id));


--
-- Name: admin_audit admin_collaboration_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON public.admin_audit TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: admin_changes admin_collaboration_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON public.admin_changes TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: admin_shared admin_collaboration_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON public.admin_shared TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: admin_workspace_versions admin_collaboration_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON public.admin_workspace_versions TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: shared_records admin_collaboration_service; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_collaboration_service ON public.shared_records TO admin_collaboration USING (true) WITH CHECK (true);


--
-- Name: admin_shared; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_shared ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_shared admin_shared_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_shared_read ON public.admin_shared FOR SELECT TO authenticated USING (admin_private.can_read(team_id, app_id));


--
-- Name: admin_workspace_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.admin_workspace_versions ENABLE ROW LEVEL SECURITY;

--
-- Name: admin_workspace_versions admin_workspace_versions_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY admin_workspace_versions_read ON public.admin_workspace_versions FOR SELECT TO authenticated USING (admin_private.can_read(team_id, app_id));


--
-- Name: shared_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE public.shared_records ENABLE ROW LEVEL SECURITY;

--
-- Name: shared_records shared_records_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY shared_records_read ON public.shared_records FOR SELECT TO authenticated USING (admin_private.can_read(team_id, app_id));


--
-- Name: SCHEMA admin_private; Type: ACL; Schema: -; Owner: postgres
--

GRANT USAGE ON SCHEMA admin_private TO authenticated;
GRANT USAGE ON SCHEMA admin_private TO admin_collaboration;


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION archive_audit(p_older_than interval, p_keep_latest integer, p_batch integer); Type: ACL; Schema: admin_private; Owner: postgres
--

REVOKE ALL ON FUNCTION admin_private.archive_audit(p_older_than interval, p_keep_latest integer, p_batch integer) FROM PUBLIC;


--
-- Name: FUNCTION broadcast(payload jsonb, event text, topic text); Type: ACL; Schema: admin_private; Owner: postgres
--

REVOKE ALL ON FUNCTION admin_private.broadcast(payload jsonb, event text, topic text) FROM PUBLIC;
GRANT ALL ON FUNCTION admin_private.broadcast(payload jsonb, event text, topic text) TO admin_collaboration;


--
-- Name: FUNCTION can_manage(wanted_team text, wanted_app text); Type: ACL; Schema: admin_private; Owner: postgres
--

REVOKE ALL ON FUNCTION admin_private.can_manage(wanted_team text, wanted_app text) FROM PUBLIC;
GRANT ALL ON FUNCTION admin_private.can_manage(wanted_team text, wanted_app text) TO authenticated;


--
-- Name: FUNCTION can_read(wanted_team text, wanted_app text); Type: ACL; Schema: admin_private; Owner: postgres
--

REVOKE ALL ON FUNCTION admin_private.can_read(wanted_team text, wanted_app text) FROM PUBLIC;
GRANT ALL ON FUNCTION admin_private.can_read(wanted_team text, wanted_app text) TO authenticated;


--
-- Name: FUNCTION can_read_topic(wanted_topic text); Type: ACL; Schema: admin_private; Owner: postgres
--

REVOKE ALL ON FUNCTION admin_private.can_read_topic(wanted_topic text) FROM PUBLIC;
GRANT ALL ON FUNCTION admin_private.can_read_topic(wanted_topic text) TO authenticated;


--
-- Name: FUNCTION admin_audit_page(p_team_id text, p_app_id text, p_before bigint, p_limit integer, p_pr_id text, p_thread_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_audit_page(p_team_id text, p_app_id text, p_before bigint, p_limit integer, p_pr_id text, p_thread_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_audit_page(p_team_id text, p_app_id text, p_before bigint, p_limit integer, p_pr_id text, p_thread_id text) TO service_role;
GRANT ALL ON FUNCTION public.admin_audit_page(p_team_id text, p_app_id text, p_before bigint, p_limit integer, p_pr_id text, p_thread_id text) TO authenticated;


--
-- Name: FUNCTION admin_commit_changes(p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_commit_changes(p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_commit_changes(p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[]) TO authenticated;
GRANT ALL ON FUNCTION public.admin_commit_changes(p_team_id text, p_app_id text, p_commit_ids text[], p_record_ids text[]) TO service_role;


--
-- Name: FUNCTION admin_commit_exchange(p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_commit_exchange(p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_commit_exchange(p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_commit_exchange(p_team_id text, p_app_id text, p_ref text, p_known text[], p_limit integer) TO service_role;


--
-- Name: FUNCTION admin_commit_history(p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_commit_history(p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_commit_history(p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer) TO authenticated;
GRANT ALL ON FUNCTION public.admin_commit_history(p_team_id text, p_app_id text, p_from text, p_until text, p_limit integer) TO service_role;


--
-- Name: FUNCTION admin_commit_lineage(p_team_id text, p_app_id text, p_id text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_commit_lineage(p_team_id text, p_app_id text, p_id text) TO service_role;


--
-- Name: FUNCTION admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text) TO authenticated;
GRANT ALL ON FUNCTION public.admin_commit_path(p_team_id text, p_app_id text, p_from text, p_until text) TO service_role;


--
-- Name: FUNCTION admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION public.admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[]) TO authenticated;
GRANT ALL ON FUNCTION public.admin_shared_records(p_team_id text, p_app_id text, p_record_ids text[]) TO service_role;


--
-- Name: TABLE candidates; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.candidates TO admin_collaboration;


--
-- Name: TABLE comments; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.comments TO admin_collaboration;


--
-- Name: TABLE commit_changes; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.commit_changes TO admin_collaboration;


--
-- Name: TABLE commits; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.commits TO admin_collaboration;


--
-- Name: TABLE invitations; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.invitations TO admin_collaboration;


--
-- Name: TABLE memberships; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.memberships TO admin_collaboration;


--
-- Name: TABLE notifications; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.notifications TO admin_collaboration;


--
-- Name: TABLE operations; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,DELETE ON TABLE admin_private.operations TO admin_collaboration;


--
-- Name: COLUMN operations.at; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT UPDATE(at) ON TABLE admin_private.operations TO admin_collaboration;


--
-- Name: TABLE policies; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.policies TO admin_collaboration;


--
-- Name: TABLE prs; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.prs TO admin_collaboration;


--
-- Name: TABLE record_keys; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,DELETE ON TABLE admin_private.record_keys TO admin_collaboration;


--
-- Name: TABLE refs; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.refs TO admin_collaboration;


--
-- Name: TABLE reviews; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.reviews TO admin_collaboration;


--
-- Name: TABLE schemas; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.schemas TO admin_collaboration;


--
-- Name: TABLE tasks; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT ON TABLE admin_private.tasks TO admin_collaboration;


--
-- Name: TABLE threads; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT,INSERT,UPDATE ON TABLE admin_private.threads TO admin_collaboration;


--
-- Name: COLUMN workspaces.team_id; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT(team_id) ON TABLE admin_private.workspaces TO admin_collaboration;


--
-- Name: COLUMN workspaces.app_id; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT(app_id) ON TABLE admin_private.workspaces TO admin_collaboration;


--
-- Name: COLUMN workspaces.name; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT(name) ON TABLE admin_private.workspaces TO admin_collaboration;


--
-- Name: COLUMN workspaces.initial_admin_id; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT(initial_admin_id) ON TABLE admin_private.workspaces TO admin_collaboration;


--
-- Name: COLUMN workspaces.schema_version; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT(schema_version),UPDATE(schema_version) ON TABLE admin_private.workspaces TO admin_collaboration;


--
-- Name: COLUMN workspaces.policy_version; Type: ACL; Schema: admin_private; Owner: postgres
--

GRANT SELECT(policy_version),UPDATE(policy_version) ON TABLE admin_private.workspaces TO admin_collaboration;


--
-- Name: TABLE admin_audit; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_audit TO service_role;
GRANT SELECT ON TABLE public.admin_audit TO authenticated;
GRANT INSERT ON TABLE public.admin_audit TO admin_collaboration;


--
-- Name: TABLE admin_audit_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_audit_events TO service_role;
GRANT SELECT ON TABLE public.admin_audit_events TO authenticated;


--
-- Name: SEQUENCE admin_audit_seq_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.admin_audit_seq_seq TO anon;
GRANT ALL ON SEQUENCE public.admin_audit_seq_seq TO authenticated;
GRANT ALL ON SEQUENCE public.admin_audit_seq_seq TO service_role;


--
-- Name: TABLE admin_candidates; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_candidates TO service_role;
GRANT SELECT ON TABLE public.admin_candidates TO authenticated;


--
-- Name: TABLE admin_changes; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_changes TO service_role;
GRANT SELECT ON TABLE public.admin_changes TO authenticated;
GRANT INSERT ON TABLE public.admin_changes TO admin_collaboration;


--
-- Name: TABLE admin_comments; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_comments TO service_role;
GRANT SELECT ON TABLE public.admin_comments TO authenticated;


--
-- Name: TABLE admin_commits; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_commits TO service_role;
GRANT SELECT ON TABLE public.admin_commits TO authenticated;


--
-- Name: TABLE admin_invitations; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_invitations TO service_role;
GRANT SELECT ON TABLE public.admin_invitations TO authenticated;


--
-- Name: TABLE admin_members; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_members TO service_role;
GRANT SELECT ON TABLE public.admin_members TO authenticated;


--
-- Name: TABLE admin_notifications; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_notifications TO service_role;
GRANT SELECT ON TABLE public.admin_notifications TO authenticated;


--
-- Name: TABLE admin_prs; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_prs TO service_role;
GRANT SELECT ON TABLE public.admin_prs TO authenticated;


--
-- Name: TABLE admin_receipts; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_receipts TO service_role;
GRANT SELECT ON TABLE public.admin_receipts TO authenticated;


--
-- Name: TABLE admin_reviews; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_reviews TO service_role;
GRANT SELECT ON TABLE public.admin_reviews TO authenticated;


--
-- Name: TABLE admin_schemas; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_schemas TO service_role;
GRANT SELECT ON TABLE public.admin_schemas TO authenticated;


--
-- Name: TABLE admin_shared; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_shared TO service_role;
GRANT SELECT ON TABLE public.admin_shared TO authenticated;
GRANT SELECT ON TABLE public.admin_shared TO admin_collaboration;


--
-- Name: COLUMN admin_shared.head; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(head) ON TABLE public.admin_shared TO admin_collaboration;


--
-- Name: TABLE admin_tasks; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_tasks TO service_role;
GRANT SELECT ON TABLE public.admin_tasks TO authenticated;


--
-- Name: TABLE admin_threads; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_threads TO service_role;
GRANT SELECT ON TABLE public.admin_threads TO authenticated;


--
-- Name: TABLE admin_workspace_versions; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_workspace_versions TO service_role;
GRANT SELECT ON TABLE public.admin_workspace_versions TO authenticated;
GRANT SELECT ON TABLE public.admin_workspace_versions TO admin_collaboration;


--
-- Name: COLUMN admin_workspace_versions.revision; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(revision) ON TABLE public.admin_workspace_versions TO admin_collaboration;


--
-- Name: COLUMN admin_workspace_versions.audit_count; Type: ACL; Schema: public; Owner: postgres
--

GRANT UPDATE(audit_count) ON TABLE public.admin_workspace_versions TO admin_collaboration;


--
-- Name: TABLE admin_workspaces; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.admin_workspaces TO service_role;
GRANT SELECT ON TABLE public.admin_workspaces TO authenticated;


--
-- Name: TABLE shared_records; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE public.shared_records TO service_role;
GRANT SELECT ON TABLE public.shared_records TO authenticated;
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.shared_records TO admin_collaboration;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--

\unrestrict admintemplatemigrationcheck


-- realtime.messages 上的策略
--

CREATE POLICY admin_collaboration_presence ON realtime.messages FOR INSERT TO authenticated WITH CHECK (((extension = 'presence'::text) AND admin_private.can_read_topic(topic)));


--

CREATE POLICY admin_collaboration_read ON realtime.messages FOR SELECT TO authenticated USING (((extension = ANY (ARRAY['broadcast'::text, 'presence'::text])) AND admin_private.can_read_topic(topic)));



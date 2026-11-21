BEGIN;

CREATE OR REPLACE FUNCTION public.media_admin_authorized()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.media_admin_memberships membership
      WHERE membership.user_id = auth.uid()
        AND membership.enabled
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.media_accounts account
      WHERE account.user_id = auth.uid()
        AND account.disabled
    );
$$;
REVOKE ALL ON FUNCTION public.media_admin_authorized() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_authorized() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.media_admin_audit_self()
RETURNS SETOF public.media_admin_audit
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT audit.*
  FROM public.media_admin_audit audit
  WHERE public.media_admin_authorized()
    AND audit.actor_id = auth.uid()
  ORDER BY audit.id DESC
  LIMIT 100;
$$;
REVOKE ALL ON FUNCTION public.media_admin_audit_self() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_audit_self() TO authenticated;

CREATE OR REPLACE FUNCTION public.media_admin_membership_self()
RETURNS TABLE (user_id uuid, enabled boolean, revision bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT membership.user_id, membership.enabled, membership.revision
  FROM public.media_admin_memberships membership
  WHERE membership.user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.media_admin_membership_self() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.media_admin_membership_self() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

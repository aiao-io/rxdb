-- Development probe only. This is not the application's future replication schema.
BEGIN;
CREATE TABLE IF NOT EXISTS public.local_account_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  note text NOT NULL CHECK (length(note) <= 200)
);
ALTER TABLE public.local_account_checks ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.local_account_checks FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.local_account_checks TO authenticated;
GRANT ALL ON public.local_account_checks TO service_role;
DROP POLICY IF EXISTS account_owns_check ON public.local_account_checks;
CREATE POLICY account_owns_check ON public.local_account_checks
  FOR ALL TO authenticated
  USING ((SELECT auth.uid()) = owner_id)
  WITH CHECK ((SELECT auth.uid()) = owner_id);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'local_account_checks'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.local_account_checks;
  END IF;
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;

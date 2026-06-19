
DROP POLICY IF EXISTS "warning_letters_no_client_select" ON storage.objects;
DROP POLICY IF EXISTS "warning_letters_no_client_insert" ON storage.objects;
DROP POLICY IF EXISTS "warning_letters_no_client_update" ON storage.objects;
DROP POLICY IF EXISTS "warning_letters_no_client_delete" ON storage.objects;

CREATE POLICY "warning_letters_no_client_select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id <> 'warning-letters');

CREATE POLICY "warning_letters_no_client_insert"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id <> 'warning-letters');

CREATE POLICY "warning_letters_no_client_update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id <> 'warning-letters')
  WITH CHECK (bucket_id <> 'warning-letters');

CREATE POLICY "warning_letters_no_client_delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id <> 'warning-letters');

CREATE SCHEMA IF NOT EXISTS extensions;
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

DO $$
DECLARE
  ext RECORD;
BEGIN
  FOR ext IN
    SELECT e.extname
    FROM pg_extension e
    JOIN pg_namespace n ON n.oid = e.extnamespace
    WHERE n.nspname = 'public'
      AND e.extname NOT IN ('plpgsql', 'pg_net')
  LOOP
    BEGIN
      EXECUTE format('ALTER EXTENSION %I SET SCHEMA extensions', ext.extname);
    EXCEPTION WHEN feature_not_supported THEN
      RAISE NOTICE 'Skipping %: relocation not supported', ext.extname;
    END;
  END LOOP;
END $$;

-- Create realtime schema for Supabase Realtime service
-- This must be created before the realtime service starts

CREATE SCHEMA IF NOT EXISTS _realtime;
ALTER SCHEMA _realtime OWNER TO supabase_admin;

-- Grant necessary permissions
GRANT USAGE ON SCHEMA _realtime TO postgres, anon, authenticated, service_role;

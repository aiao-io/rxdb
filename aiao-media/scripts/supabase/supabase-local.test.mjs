import assert from 'node:assert/strict';
import { test } from 'node:test';
import { supabaseRolePasswordSql } from './supabase-local.mjs';

test('generates role password synchronization SQL for an existing Supabase database', () => {
  assert.equal(
    supabaseRolePasswordSql('fixture-password'),
    [
      "ALTER ROLE authenticator PASSWORD 'fixture-password';",
      "ALTER ROLE supabase_auth_admin PASSWORD 'fixture-password';",
      "ALTER ROLE supabase_storage_admin PASSWORD 'fixture-password';",
      "ALTER ROLE supabase_admin PASSWORD 'fixture-password';"
    ].join('\n')
  );
});

test('rejects passwords that cannot come from the local environment format', () => {
  assert.throws(() => supabaseRolePasswordSql('password with spaces'), /POSTGRES_PASSWORD/);
});

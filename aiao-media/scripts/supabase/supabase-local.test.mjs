import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { parse } from 'yaml';
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

test('local gateway permits Supabase browser requests from both product applications', async () => {
  const template = await readFile(new URL('../../infra/supabase/kong.template.yml', import.meta.url), 'utf8');
  const cors = parse(template).plugins.find(plugin => plugin.name === 'cors').config;
  for (const port of [4300, 4302]) {
    for (const host of ['localhost', '127.0.0.1']) {
      const origin = `http://${host}:${port}`;
      assert.ok(cors.origins.includes(origin), `Missing browser CORS origin: ${origin}`);
    }
  }
  assert.ok(!cors.origins.includes('*'), 'Local gateway must allow explicit origins');
});

test('local gateway routes the administrator function to a running private Edge Runtime', async () => {
  const [template, compose] = await Promise.all([
    readFile(new URL('../../infra/supabase/kong.template.yml', import.meta.url), 'utf8'),
    readFile(new URL('../../infra/supabase/docker-compose.yml', import.meta.url), 'utf8')
  ]);
  const gateway = parse(template);
  const services = parse(compose).services;
  const service = gateway.services.find(service => service.routes.some(route => route.paths.includes('/functions/v1/admin-api')));
  assert.ok(service, 'Missing administrator Edge Function route');
  assert.equal(service.url, 'http://functions:9000/');
  assert.ok(services.functions, 'Missing local Edge Runtime service');
  assert.equal(services.functions.environment.SUPABASE_URL, 'http://kong:8000');
  assert.equal(services.functions.environment.SUPABASE_ANON_KEY, '${ANON_KEY}');
  assert.equal(services.functions.environment.SUPABASE_SERVICE_ROLE_KEY, '${SERVICE_ROLE_KEY}');
  assert.equal(services.functions.ports, undefined, 'Privileged function is only exposed through Kong');
  assert.equal(services.kong.depends_on.functions.condition, 'service_healthy');
});

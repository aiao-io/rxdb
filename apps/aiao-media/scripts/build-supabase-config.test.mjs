import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { buildSupabaseConfig, supabaseHeaders } from './build-supabase-config.mjs';

const anon = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.fixture`;
const service = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.fixture`;

test('builds only the explicitly configured public project values; default disables accounts', async () => {
  const root = await mkdtemp(join(tmpdir(), 'aiao-auth-config-'));
  const output = join(root, 'app-config.js');
  try {
    assert.equal(await buildSupabaseConfig({ AIAO_IMAGE_API_KEY: 'private-provider-key' }, output), false);
    assert.match(await readFile(output, 'utf8'), /= null;/);
    for (const key of [anon, 'sb_publishable_fixture']) {
      assert.equal(
        await buildSupabaseConfig(
          {
            AIAO_SUPABASE_URL: 'https://project.supabase.co/',
            AIAO_SUPABASE_ANON_KEY: key,
            DATABASE_URL: 'private-db-url'
          },
          output
        ),
        true
      );
      const script = await readFile(output, 'utf8');
      assert.match(script, /https:\/\/project.supabase.co/);
      assert.ok(!script.includes('private'));
    }
    for (const env of [
      { AIAO_SUPABASE_URL: 'https://project.supabase.co' },
      {
        AIAO_SUPABASE_URL: 'https://project.supabase.co',
        AIAO_SUPABASE_ANON_KEY: service
      },
      {
        AIAO_SUPABASE_URL: 'https://project.supabase.co',
        AIAO_SUPABASE_ANON_KEY: 'sb_secret_fixture'
      }
    ])
      await assert.rejects(buildSupabaseConfig(env, output));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('static Auth CSP permits only the configured HTTP and Realtime origins', () => {
  const template = "Content-Security-Policy: connect-src 'self' https:; object-src 'none'";
  assert.equal(supabaseHeaders(template, null), template);
  assert.equal(
    supabaseHeaders(template, {
      url: 'https://project.supabase.co',
      anonKey: anon
    }),
    template.replace('https:;', 'https: wss://project.supabase.co;')
  );
  for (const url of ['http://127.0.0.1:54321', 'http://localhost:54321', 'http://[::1]:54321']) {
    const headers = supabaseHeaders(template, { url, anonKey: anon });
    assert.ok(headers.includes(`connect-src 'self' https: ${url} ${url.replace('http:', 'ws:')};`));
    assert.ok(!headers.includes(' http:;'));
    assert.ok(headers.endsWith("object-src 'none'"));
  }
  assert.throws(() =>
    supabaseHeaders(template, {
      url: 'http://192.168.1.2:54321',
      anonKey: anon
    })
  );
});

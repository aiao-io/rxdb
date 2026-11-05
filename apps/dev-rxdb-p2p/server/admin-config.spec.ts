// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { adminConfigOf, AdminConfigError, parseAdminIds } from './admin-config';
import type { Env } from './env';

const ALICE = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';
const BOB = '0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d';

const envWith = (overrides: Partial<Env> = {}): Env => ({
  SUPABASE_URL: 'https://supabase.test/',
  SUPABASE_ANON_KEY: 'anon-key',
  TICKET_PRIVATE_JWK: '',
  SUPABASE_SERVICE_ROLE_KEY: 'service-key',
  ADMIN_USER_IDS: ALICE,
  SIGNALING: { idFromName: () => '', get: () => ({ fetch: async () => new Response() }) },
  FILES: {
    head: async () => null,
    get: async () => null,
    put: async () => undefined,
    list: async () => ({ objects: [], truncated: false }),
    delete: async () => undefined
  },
  ...overrides
});

describe('parseAdminIds', () => {
  it('splits on commas and whitespace, ignores case and collapses duplicates', () => {
    const ids = parseAdminIds(` ${ALICE.toUpperCase()},\n${BOB}  ${ALICE} `);

    expect([...ids]).toEqual([ALICE, BOB]);
  });

  it('refuses an entry that is not a user id instead of dropping it', () => {
    expect(() => parseAdminIds(`${ALICE}, admin@example.com`)).toThrow(AdminConfigError);
    expect(() => parseAdminIds(`${ALICE}, admin@example.com`)).toThrow('"admin@example.com" is not one');
  });
});

describe('adminConfigOf', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reads the administrator ids', () => {
    const config = adminConfigOf(envWith({ ADMIN_USER_IDS: `${ALICE}, ${BOB}` }));

    expect([...config.adminIds]).toEqual([ALICE, BOB]);
  });

  it('builds a directory that calls Supabase as the service role', async () => {
    const fetch = vi.fn(async () => Response.json({ users: [] }, { headers: { 'x-total-count': '0' } }));
    vi.stubGlobal('fetch', fetch);

    await adminConfigOf(envWith()).directory.listAccounts(1);

    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toMatch(/^https:\/\/supabase\.test\/auth\/v1\/admin\/users\?/);
    expect(new Headers(init.headers).get('authorization')).toBe('Bearer service-key');
  });

  it.each([
    ['the service role key', { SUPABASE_SERVICE_ROLE_KEY: undefined }, 'SUPABASE_SERVICE_ROLE_KEY is missing'],
    ['a blank administrator list', { ADMIN_USER_IDS: '  ' }, 'ADMIN_USER_IDS is missing'],
    [
      'both',
      { SUPABASE_SERVICE_ROLE_KEY: '', ADMIN_USER_IDS: undefined },
      'SUPABASE_SERVICE_ROLE_KEY and ADMIN_USER_IDS are missing'
    ]
  ])('reports %s as not configured', (_label, overrides, message) => {
    expect(() => adminConfigOf(envWith(overrides))).toThrow(AdminConfigError);
    expect(() => adminConfigOf(envWith(overrides))).toThrow(`admin console is not configured: ${message}`);
  });

  it('refuses a list that holds only separators', () => {
    expect(() => adminConfigOf(envWith({ ADMIN_USER_IDS: ' , ,' }))).toThrow('ADMIN_USER_IDS lists no user id');
  });

  it('refuses an administrator list with a malformed entry', () => {
    expect(() => adminConfigOf(envWith({ ADMIN_USER_IDS: 'nobody' }))).toThrow(AdminConfigError);
  });

  it('still fails loudly when Supabase itself is not configured', () => {
    expect(() => adminConfigOf(envWith({ SUPABASE_URL: '' }))).toThrow(
      'SUPABASE_URL and SUPABASE_ANON_KEY must be configured'
    );
  });
});

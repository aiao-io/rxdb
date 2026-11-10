// @vitest-environment node
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateDeviceKeyPair } from '../src/app/p2p/fallback-crypto';

/**
 * 管理后台的数据库函数（US-713）：把真实的 `supabase/p2p-schema.sql` 灌进 PGlite（进程内的真 Postgres），
 * 以 `SET ROLE` 切换成 Supabase 的几个角色去调用，验证函数的逻辑与权限。
 *
 * 脚手架只补 Supabase 平台自带的那一点东西：三个角色（`service_role` 带 BYPASSRLS）、`auth.users`、`auth.uid()`，
 * 以及同步函数的空桩（真实的那个装同步触发器，这里不测）。
 */
const SCHEMA = readFileSync(new URL('../supabase/p2p-schema.sql', import.meta.url), 'utf8');

const SUPABASE_SCAFFOLD = `
  CREATE ROLE anon NOLOGIN;
  CREATE ROLE authenticated NOLOGIN;
  CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth;
  CREATE TABLE auth.users (id uuid PRIMARY KEY, email text);
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE
    AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
  GRANT SELECT ON auth.users TO authenticated;
  CREATE FUNCTION public.rxdb_enable_sync_for_table(a text, b text, c text) RETURNS void
    LANGUAGE sql AS $$ SELECT $$;
`;

const ALICE = '6f1c5d1e-4c7b-4f7e-9a51-2d0c3b8f9a10';
const BOB = '0b9d8c7a-6e5f-4a3b-8c2d-1e0f9a8b7c6d';
const ALICE_LAPTOP = 'd4c3b2a1-0f9e-4d8c-b7a6-5f4e3d2c1b0a';
const ALICE_PHONE = 'c3b2a1d4-9e0f-4c8d-a7b6-4e3d2c1b0a5f';
const BOB_LAPTOP = 'b2a1d4c3-e9f0-48cd-97a6-3d2c1b0a5f4e';
const HASH_SHARED = 'a'.repeat(64);
const HASH_ALICE_ONLY = 'b'.repeat(64);

describe('p2p-schema.sql 管理后台函数', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(SUPABASE_SCAFFOLD);
    await db.exec(SCHEMA);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.exec('RESET ROLE; TRUNCATE p2p.p2p_file_manifest, p2p.devices, auth.users CASCADE');
    for (const [id, email] of [
      [ALICE, 'alice@example.com'],
      [BOB, 'bob@example.com']
    ]) {
      await db.query('INSERT INTO auth.users (id, email) VALUES ($1, $2)', [id, email]);
    }
    for (const [id, user, name] of [
      [ALICE_LAPTOP, ALICE, 'laptop'],
      [ALICE_PHONE, ALICE, 'phone'],
      [BOB_LAPTOP, BOB, 'laptop']
    ]) {
      await db.query('INSERT INTO p2p.devices (id, user_id, name) VALUES ($1, $2, $3)', [id, user, name]);
    }
    await claim(ALICE, ALICE_LAPTOP, HASH_SHARED, 'shared.bin');
    await claim(ALICE, ALICE_PHONE, HASH_SHARED, 'shared.bin');
    await claim(ALICE, ALICE_LAPTOP, HASH_ALICE_ONLY, 'alice-only.bin');
    await claim(BOB, BOB_LAPTOP, HASH_SHARED, 'shared-renamed.bin');
  });

  const claim = (userId: string, deviceId: string, hash: string, fileName: string) =>
    db.query(
      `INSERT INTO p2p.p2p_file_manifest (id, "contentHash", "fileName", size, "chunkSize", "chunkHashes", "holderId")
       VALUES (gen_random_uuid(), $1, $2, 1, 1, ARRAY['f'], p2p.holder_id($3::uuid, $4::uuid))`,
      [hash, fileName, userId, deviceId]
    );

  const as = async <T extends object>(role: string, sql: string, params: unknown[] = []) => {
    await db.exec(`SET ROLE ${role}`);
    try {
      return (await db.query<T>(sql, params)).rows;
    } finally {
      await db.exec('RESET ROLE');
    }
  };

  const claimsOf = async (userId: string): Promise<number> => {
    const rows = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM p2p.p2p_file_manifest AS m
       JOIN p2p.devices AS d ON m."holderId" = p2p.holder_id(d.user_id, d.id) WHERE d.user_id = $1`,
      [userId]
    );
    return rows.rows[0]?.n ?? -1;
  };

  it('keeps activation retries idempotent and leaves other invite codes unused', async () => {
    await db.exec("INSERT INTO p2p.invite_codes (code) VALUES ('first-invite-1234'), ('spare-invite-1234')");
    const activate = (code: string) =>
      as<{ activated: boolean }>('service_role', 'SELECT p2p.activate_invite($1, $2::uuid) AS activated', [
        code,
        ALICE
      ]);
    expect(await activate('first-invite-1234')).toEqual([{ activated: true }]);
    expect(await activate('first-invite-1234')).toEqual([{ activated: true }]);
    expect(await activate('spare-invite-1234')).toEqual([{ activated: true }]);
    const spare = await db.query<{ used_by: string | null }>(
      "SELECT used_by FROM p2p.invite_codes WHERE code = 'spare-invite-1234'"
    );
    expect(spare.rows).toEqual([{ used_by: null }]);
  });

  it('rejects malformed device public keys at registration', async () => {
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ALICE]);
    await expect(
      as('authenticated', 'UPDATE p2p.devices SET public_key = $1 WHERE id = $2', ['not-a-valid-spki', ALICE_LAPTOP])
    ).rejects.toThrow(/check constraint/);
  });

  it('accepts valid P-256 SPKI and rejects a wrong curve or an invalid point', async () => {
    const pair = await generateDeviceKeyPair();
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ALICE]);
    await expect(
      as('authenticated', 'UPDATE p2p.devices SET public_key = $1 WHERE id = $2', [pair.publicKeyBase64, ALICE_LAPTOP])
    ).resolves.toBeDefined();
    const wrongCurve = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-384' }, true, ['deriveBits']);
    const wrongSpki = Buffer.from(await crypto.subtle.exportKey('spki', wrongCurve.publicKey)).toString('base64url');
    const badPoint = Buffer.concat([
      Buffer.from('3059301306072a8648ce3d020106082a8648ce3d03010703420004', 'hex'),
      Buffer.alloc(64)
    ]).toString('base64url');
    for (const invalid of [wrongSpki, badPoint]) {
      await expect(
        as('authenticated', 'UPDATE p2p.devices SET public_key = $1 WHERE id = $2', [invalid, ALICE_LAPTOP])
      ).rejects.toThrow(/check constraint/);
    }
  });

  it('quarantines corrupt legacy keys when the schema is upgraded', async () => {
    await db.exec(
      "ALTER TABLE p2p.devices DROP CONSTRAINT devices_public_key_valid; UPDATE p2p.devices SET public_key = 'corrupt'"
    );
    await db.exec(SCHEMA);
    expect(await as('authenticated', 'SELECT * FROM p2p.team_device_keys()')).toEqual([]);
    expect((await db.query('SELECT public_key FROM p2p.devices WHERE public_key IS NOT NULL')).rows).toEqual([]);
  });

  it('isolates envelope updates and deletes by publisher while permitting cross-device sealing', async () => {
    const encHash = 'e'.repeat(64);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ALICE]);
    await as(
      'authenticated',
      `INSERT INTO p2p.p2p_fallback_envelope (id, "contentHash", "encHash", "recipientDeviceId", kid, epk, iv, ct, tag)
      VALUES (gen_random_uuid(), $1, $2, $3, 'p256-1', 'key', 'iv', 'ct', 'tag')`,
      [HASH_SHARED, encHash, BOB_LAPTOP]
    );
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [BOB]);
    expect(await as('authenticated', 'DELETE FROM p2p.p2p_fallback_envelope RETURNING id')).toEqual([]);
    expect(await as('authenticated', "UPDATE p2p.p2p_fallback_envelope SET ct = 'bad' RETURNING id")).toEqual([]);
    await expect(
      as(
        'authenticated',
        `INSERT INTO p2p.p2p_fallback_envelope (id, "contentHash", "encHash", "recipientDeviceId", kid, epk, iv, ct, tag)
      VALUES (gen_random_uuid(), $1, $2, $3, 'p256-1', 'key', 'iv', 'bad', 'tag')
      ON CONFLICT ("encHash", "recipientDeviceId") DO UPDATE SET ct = EXCLUDED.ct`,
        [HASH_SHARED, encHash, BOB_LAPTOP]
      )
    ).rejects.toThrow(/row-level security/);
    await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ALICE]);
    expect(
      await as<{ ct: string }>('authenticated', "UPDATE p2p.p2p_fallback_envelope SET ct = 'resealed' RETURNING ct")
    ).toEqual([{ ct: 'resealed' }]);
    await expect(
      as('authenticated', 'UPDATE p2p.p2p_fallback_envelope SET "publisherUserId" = $1', [BOB])
    ).rejects.toThrow(/row-level security/);
  });

  it('can be applied again without error', async () => {
    await expect(db.exec(SCHEMA)).resolves.toBeDefined();
  });

  // POOL-US-101 处置联动：设备登记没了，寄给它的信封也不能留。本人删设备、auth.users 删除级联到设备，
  // 两条路都不经过 admin_purge_account；信封是别人（BOB）发布的，本人的 RLS 删不动它。
  describe('信封随收件设备删除', () => {
    const ENC_HASH = 'c'.repeat(64);
    const seal = (recipient: string) =>
      db.query(
        `INSERT INTO p2p.p2p_fallback_envelope
           (id, "contentHash", "encHash", "recipientDeviceId", kid, epk, iv, ct, tag, "publisherUserId")
         VALUES (gen_random_uuid(), $1, $2, $3, 'p256-1', 'key', 'iv', 'ct', 'tag', $4)`,
        [HASH_SHARED, ENC_HASH, recipient, BOB]
      );
    const recipients = async (): Promise<string[]> =>
      (
        await db.query<{ recipient: string }>('SELECT "recipientDeviceId" AS recipient FROM p2p.p2p_fallback_envelope')
      ).rows
        .map(row => row.recipient)
        .sort();

    beforeEach(async () => {
      await db.exec('DELETE FROM p2p.p2p_fallback_envelope');
      for (const device of [ALICE_LAPTOP, ALICE_PHONE, BOB_LAPTOP]) await seal(device);
    });

    afterEach(async () => {
      await db.exec('RESET ROLE; DELETE FROM p2p.p2p_fallback_envelope');
    });

    it('drops the envelopes addressed to a device its owner deletes, and only those', async () => {
      await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [ALICE]);
      expect(await as('authenticated', 'DELETE FROM p2p.devices WHERE id = $1 RETURNING id', [ALICE_LAPTOP])).toEqual([
        { id: ALICE_LAPTOP }
      ]);

      expect(await recipients()).toEqual([ALICE_PHONE, BOB_LAPTOP].sort());
    });

    it('drops the envelopes of every device of an auth account that is deleted', async () => {
      await db.query('DELETE FROM auth.users WHERE id = $1', [ALICE]);

      expect(await recipients()).toEqual([BOB_LAPTOP]);
    });

    it('clears envelopes orphaned before the upgrade and keeps cleaning afterwards', async () => {
      await db.exec('DROP TRIGGER IF EXISTS devices_drop_envelopes ON p2p.devices');
      await db.query('DELETE FROM p2p.devices WHERE id = $1', [ALICE_LAPTOP]);

      await db.exec(SCHEMA);
      expect(await recipients()).toEqual([ALICE_PHONE, BOB_LAPTOP].sort());

      await db.query('DELETE FROM p2p.devices WHERE id = $1', [ALICE_PHONE]);
      expect(await recipients()).toEqual([BOB_LAPTOP]);
    });
  });

  it('counts the devices and the claims of each account that has a device', async () => {
    const rows = await as<{ user_id: string; device_count: number; claim_count: number }>(
      'service_role',
      'SELECT user_id, device_count::int, claim_count::int FROM p2p.admin_account_stats() ORDER BY user_id'
    );

    expect(rows).toEqual([
      { user_id: BOB, device_count: 1, claim_count: 1 },
      { user_id: ALICE, device_count: 2, claim_count: 3 }
    ]);
  });

  it('lists a device without claims with a zero claim count, and leaves out accounts without devices', async () => {
    await db.query('DELETE FROM p2p.p2p_file_manifest');
    await db.query("INSERT INTO auth.users (id, email) VALUES (gen_random_uuid(), 'nobody@example.com')");

    const rows = await as<{ user_id: string; claim_count: number }>(
      'service_role',
      'SELECT user_id, claim_count::int FROM p2p.admin_account_stats() ORDER BY user_id'
    );

    expect(rows).toEqual([
      { user_id: BOB, claim_count: 0 },
      { user_id: ALICE, claim_count: 0 }
    ]);
  });

  it('groups the manifest by content hash with a file name and the number of holders', async () => {
    const rows = await as<{ content_hash: string; file_name: string; holder_count: number }>(
      'service_role',
      'SELECT content_hash, file_name, holder_count::int FROM p2p.admin_file_catalog() ORDER BY content_hash'
    );

    expect(rows).toEqual([
      { content_hash: HASH_SHARED, file_name: 'shared-renamed.bin', holder_count: 3 },
      { content_hash: HASH_ALICE_ONLY, file_name: 'alice-only.bin', holder_count: 1 }
    ]);
  });

  describe('admin_purge_account', () => {
    it('removes the claims and the device registrations of one account and nothing else', async () => {
      const purged = await as<{ purged: number }>(
        'service_role',
        'SELECT p2p.admin_purge_account($1::uuid)::int AS purged',
        [ALICE]
      );

      expect(purged).toEqual([{ purged: 3 }]);
      expect(await claimsOf(ALICE)).toBe(0);
      const devices = await db.query<{ user_id: string }>('SELECT user_id FROM p2p.devices');
      expect(devices.rows).toEqual([{ user_id: BOB }]);
      const left = await db.query<{ holderId: string }>('SELECT "holderId" FROM p2p.p2p_file_manifest');
      expect(left.rows).toHaveLength(1);
      expect(await claimsOf(BOB)).toBe(1);
    });

    it('can be repeated: the second run finds nothing left', async () => {
      await as('service_role', 'SELECT p2p.admin_purge_account($1::uuid)', [ALICE]);

      const again = await as<{ purged: number }>(
        'service_role',
        'SELECT p2p.admin_purge_account($1::uuid)::int AS purged',
        [ALICE]
      );

      expect(again).toEqual([{ purged: 0 }]);
    });

    it('leaves the account unable to write a new claim: its device no longer exists', async () => {
      const insertAs = async (userId: string, deviceId: string) => {
        await db.exec(`SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub', '${userId}', false)`);
        try {
          return await db.query(
            `INSERT INTO p2p.p2p_file_manifest (id, "contentHash", "fileName", size, "chunkSize", "chunkHashes", "holderId")
             VALUES (gen_random_uuid(), $1, 'late.bin', 1, 1, ARRAY['f'], p2p.holder_id($2::uuid, $3::uuid))`,
            ['c'.repeat(64), userId, deviceId]
          );
        } finally {
          await db.exec('RESET ROLE');
        }
      };
      await expect(insertAs(ALICE, ALICE_LAPTOP)).resolves.toBeDefined();
      await as('service_role', 'SELECT p2p.admin_purge_account($1::uuid)', [ALICE]);

      await expect(insertAs(ALICE, ALICE_LAPTOP)).rejects.toThrow(/row-level security/);
    });
  });

  describe('permissions', () => {
    const calls = [
      ['admin_account_stats', 'SELECT * FROM p2p.admin_account_stats()'],
      ['admin_file_catalog', 'SELECT * FROM p2p.admin_file_catalog()'],
      ['admin_purge_account', `SELECT p2p.admin_purge_account('${ALICE}'::uuid)`]
    ] as const;

    it.each(calls.flatMap(([name, sql]) => ['anon', 'authenticated'].map(role => [name, role, sql] as const)))(
      '%s is refused to %s',
      async (name, role, sql) => {
        await expect(as(role, sql)).rejects.toThrow(new RegExp(`permission denied for function ${name}`));
        expect(await claimsOf(ALICE)).toBe(3);
      }
    );

    it('is refused to a role that was never granted anything', async () => {
      await db.exec('CREATE ROLE stranger NOLOGIN');

      await expect(as('stranger', 'SELECT * FROM p2p.admin_account_stats()')).rejects.toThrow(/permission denied/);
    });

    it('does not let service_role touch the tables beyond what the functions need', async () => {
      await expect(as('service_role', "UPDATE p2p.devices SET name = 'renamed'")).rejects.toThrow(/permission denied/);
      await expect(
        as('service_role', `INSERT INTO p2p.devices (user_id, name) VALUES ('${ALICE}', 'injected')`)
      ).rejects.toThrow(/permission denied/);
    });
  });
});

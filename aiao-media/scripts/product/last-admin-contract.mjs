import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

/** 用独立数据库验证最后一名管理员保护，不修改开发库已有成员。 */
export async function verifyLastAdminContract() {
  const db = await PGlite.create(),
    a = randomUUID(),
    b = randomUUID();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
    `);
    for (const name of ['002-product-workspaces.sql', '004-admin-foundation.sql', '006-trusted-membership.sql'])
      await db.exec(await readFile(new URL(`../../infra/supabase/migrations/${name}`, import.meta.url), 'utf8'));
    await db.query('INSERT INTO auth.users VALUES ($1),($2)', [a, b]);
    await db.exec('SET ROLE service_role');
    const membership = (target, enabled, revision) =>
      db.query('SELECT public.media_trusted_membership($1,$2,$3,$4) AS value', [
        target,
        enabled,
        revision,
        randomUUID()
      ]);
    const account = (actor, target, disabled, revision) =>
      db.query('SELECT public.media_admin_set_account($1,$2,$3,$4,$5) AS value', [
        actor,
        target,
        revision,
        disabled,
        randomUUID()
      ]);
    await membership(a, true, 0);
    await assert.rejects(membership(a, false, 1), { code: '23514' });
    await assert.rejects(account(a, a, true, 0), { code: '23514' });
    assert.equal((await db.query('SELECT count(*)::integer AS count FROM public.media_accounts')).rows[0].count, 0);
    await membership(b, true, 0);
    assert.equal((await membership(a, false, 1)).rows[0].value.enabled, false);
    await assert.rejects(membership(b, false, 1), { code: '23514' });
    await assert.rejects(account(b, b, true, 0), { code: '23514' });
    await membership(a, true, 2);
    assert.equal((await account(a, a, true, 0)).rows[0].value.disabled, true);
    await assert.rejects(membership(b, false, 1), { code: '23514' });
    await assert.rejects(account(b, b, true, 0), { code: '23514' });
    await account(b, a, false, 1);
    assert.equal((await account(b, b, true, 0)).rows[0].value.disabled, true);
    assert.equal(
      (await db.query('SELECT public.media_admin_authorized($1) AS authorized', [a])).rows[0].authorized,
      true
    );
    await db.exec('SET ROLE authenticated');
    await assert.rejects(membership(a, false, 3), { code: '42501' });
    await assert.rejects(account(a, a, true, 2), { code: '42501' });
  } finally {
    await db.close();
  }
}

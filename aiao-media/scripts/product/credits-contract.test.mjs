import { PGlite } from '@electric-sql/pglite';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';

const actor = '00000000-0000-4000-8000-000000000001';
const owner = '00000000-0000-4000-8000-000000000002';
const other = '00000000-0000-4000-8000-000000000003';
let db;
before(async () => {
  db = await PGlite.create();
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, email text);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    INSERT INTO auth.users VALUES ('${actor}', 'admin@example.test'), ('${owner}', 'artist@example.test'), ('${other}', 'other@example.test');
  `);
  for (const name of ['002-product-workspaces', '004-admin-foundation', '012-credits'])
    await db.exec(await readFile(new URL(`../../infra/supabase/migrations/${name}.sql`, import.meta.url), 'utf8'));
  await db.query('INSERT INTO public.media_admin_memberships(user_id) VALUES ($1)', [actor]);
});
after(async () => db?.close());
const rows = async (sql, args = []) => (await db.query(sql, args)).rows;
const adjust = (delta, reason = '验收发放', request = crypto.randomUUID(), target = owner, admin = actor) =>
  rows('SELECT public.media_admin_adjust_credits($1,$2,$3,$4,$5) AS value', [
    admin,
    target,
    delta,
    reason,
    request
  ]).then(result => result[0].value);
const account = (target = owner) =>
  rows('SELECT balance,reserved FROM public.media_credit_accounts WHERE user_id=$1', [target]);
const reserve = (task, cost = 3, target = owner, fingerprint = 'a'.repeat(64), token = 'b'.repeat(64)) =>
  rows('SELECT public.media_reserve_credits($1,$2,$3,$4,$5) AS value', [target, task, cost, fingerprint, token]).then(
    result => result[0].value
  );
const settle = (task, received) => rows('SELECT public.media_settle_credits($1,$2) AS value', [task, received]);

test('管理员调整记入同一账本，原样重试只生效一次，复用标识的参数冲突被拒绝', async () => {
  const request = crypto.randomUUID();
  const result = await adjust(20, '首次发放', request);
  assert.equal(result.delta, 20);
  assert.equal(result.actor_id, actor);
  assert.equal(result.source, 'admin');
  assert.equal(result.reason, '首次发放');
  assert.equal(result.request_id, request);
  assert.ok(result.created_at);
  assert.deepEqual(await adjust(20, '首次发放', request), result);
  await assert.rejects(adjust(21, '首次发放', request), { code: 'PT409' });
  await assert.rejects(adjust(20, '变更理由', request), { code: 'PT409' });
  assert.deepEqual(await account(), [{ balance: 20, reserved: 0 }]);
  assert.equal(
    (await rows("SELECT count(*)::int AS n FROM public.media_admin_audit WHERE action='credits-adjust'"))[0].n,
    1
  );
});
test('只接受有效管理员、非零整数调整与非空理由，失败不改变余额', async () => {
  await assert.rejects(adjust(1, '越权', crypto.randomUUID(), owner, other), { code: '42501' });
  for (const [delta, reason] of [
    [0, '无效'],
    [1, ' '],
    [1, 'x'.repeat(501)],
    [1, null]
  ])
    await assert.rejects(adjust(delta, reason), { code: '22023' });
  await assert.rejects(adjust(-21), { code: 'PT402' });
  await db.query('UPDATE public.media_admin_memberships SET enabled=false WHERE user_id=$1', [actor]);
  await assert.rejects(adjust(1), { code: '42501' });
  await db.query('UPDATE public.media_admin_memberships SET enabled=true WHERE user_id=$1', [actor]);
  assert.deepEqual(await account(), [{ balance: 20, reserved: 0 }]);
});
test('预占阻止双花，失败释放预占，成功消费和结算重放均只记一次', async () => {
  const task = crypto.randomUUID();
  assert.equal((await reserve(task, 15)).state, 'reserved');
  assert.equal((await reserve(task, 15)).state, 'reserved');
  await assert.rejects(reserve(crypto.randomUUID(), 6), { code: 'PT402' });
  await assert.rejects(adjust(-6), { code: 'PT402' });
  await assert.rejects(reserve(task, 14), { code: 'PT409' });
  await assert.rejects(reserve(task, 15, other), { code: 'PT409' });
  await assert.rejects(reserve(task, 15, owner, 'c'.repeat(64)), { code: 'PT409' });
  await assert.rejects(reserve(task, 15, owner, 'a'.repeat(64), 'c'.repeat(64)), { code: 'PT409' });
  await settle(task, false);
  await settle(task, false);
  await assert.rejects(settle(task, true), { code: 'PT409' });
  assert.deepEqual(await account(), [{ balance: 20, reserved: 0 }]);
  const success = crypto.randomUUID();
  await reserve(success, 3);
  await settle(success, true);
  await settle(success, true);
  assert.deepEqual(await account(), [{ balance: 17, reserved: 0 }]);
  const entries = await rows(
    "SELECT delta,balance_after,source,request_id FROM public.media_credit_ledger WHERE source='generation'"
  );
  assert.deepEqual(entries, [{ delta: -3, balance_after: 17, source: 'generation', request_id: success }]);
});
test('并发预占与后台扣减按账户串行，只有余额允许的操作成功', async () => {
  await adjust(5, '并发测试', crypto.randomUUID(), other);
  const results = await Promise.allSettled([
    reserve(crypto.randomUUID(), 4, other),
    reserve(crypto.randomUUID(), 4, other),
    adjust(-4, '并发扣减', crypto.randomUUID(), other)
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const [value] = await account(other);
  assert.ok(value.balance >= value.reserved && value.balance >= 0);
});
test('禁用账号不能预占积分，空参数或非法额度不能创建预占', async () => {
  await db.query('INSERT INTO public.media_accounts(user_id,disabled) VALUES ($1,true)', [other]);
  await assert.rejects(reserve(crypto.randomUUID(), 1, other), { code: '42501' });
  for (const cost of [0, -1, null]) await assert.rejects(reserve(crypto.randomUUID(), cost), { code: '22023' });
  await assert.rejects(reserve(crypto.randomUUID(), 1, owner, 'invalid'), { code: '22023' });
  await assert.rejects(settle(crypto.randomUUID(), true), { code: 'PT404' });
});
test('用户只能读取本人账本，不能调整积分、读取预占或篡改流水', async () => {
  await db.exec(`SET request.jwt.claim.sub='${owner}'; SET ROLE authenticated;`);
  try {
    assert.deepEqual(await rows('SELECT user_id FROM public.media_credit_accounts'), [{ user_id: owner }]);
    assert.ok((await rows('SELECT user_id FROM public.media_credit_ledger')).every(row => row.user_id === owner));
    await assert.rejects(adjust(1), { code: '42501' });
    await assert.rejects(rows('SELECT * FROM public.media_credit_reservations'), { code: '42501' });
    await assert.rejects(rows('UPDATE public.media_credit_ledger SET delta=1'), { code: '42501' });
    await assert.rejects(rows('DELETE FROM public.media_credit_ledger'), { code: '42501' });
  } finally {
    await db.exec('RESET ROLE;');
  }
  await db.exec('SET ROLE anon;');
  try {
    await assert.rejects(rows('SELECT * FROM public.media_credit_accounts'), { code: '42501' });
  } finally {
    await db.exec('RESET ROLE;');
  }
  await db.exec('SET ROLE service_role;');
  try {
    await assert.rejects(rows('UPDATE public.media_credit_ledger SET delta=1'), { code: '42501' });
    await assert.rejects(rows('DELETE FROM public.media_credit_ledger'), { code: '42501' });
  } finally {
    await db.exec('RESET ROLE;');
  }
});

test('后台按邮箱或账号查找用户，返回白名单字段并实时验证权限', async () => {
  const query = async (search, admin = actor) =>
    (await rows('SELECT public.media_admin_search_users($1,$2,1,25) AS value', [admin, search]))[0].value;
  assert.deepEqual(await query('ARTIST@'), { users: [{ id: owner, email: 'artist@example.test' }], total: 1 });
  assert.deepEqual(await query(owner), { users: [{ id: owner, email: 'artist@example.test' }], total: 1 });
  assert.deepEqual(await query('%'), { users: [], total: 0 });
  await assert.rejects(query('artist', other), { code: '42501' });
});

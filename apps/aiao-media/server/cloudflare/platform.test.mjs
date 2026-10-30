import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import { PlatformCoordinator } from './platform-coordinator.mjs';

const owner = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const input = () => ({
  requestId: crypto.randomUUID(),
  model: 'test',
  prompt: '一杯咖啡',
  size: '1024x1024',
  billing: 'free'
});
function setup(overrides = {}, request = async () => new Response('failure', { status: 500 })) {
  const db = new DatabaseSync(':memory:');
  const storage = {
    sql: {
      exec(query, ...params) {
        const stmt = db.prepare(query);
        return stmt.columns().length ? stmt.all(...params) : (stmt.run(...params), []);
      }
    },
    transactionSync(operation) {
      db.exec('BEGIN');
      try {
        const result = operation();
        db.exec('COMMIT');
        return result;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async setAlarm() {
      return undefined;
    }
  };
  const env = {
    MEDIA_PLATFORM_MODELS: JSON.stringify([
      {
        id: 'test',
        name: '测试模型',
        baseUrl: 'https://api.example.com/v1',
        model: 'test-image',
        secret: 'TEST_PROVIDER_KEY',
        credits: 2,
        costMicros: 10
      }
    ]),
    MEDIA_PLATFORM_FREE_DAILY: '2',
    MEDIA_PLATFORM_DAILY_BUDGET_MICROS: '100',
    TEST_PROVIDER_KEY: 'private-key',
    MEDIA_RESULTS: {
      async put() {
        return undefined;
      }
    },
    ...overrides
  };
  return { engine: new PlatformCoordinator({ storage }, env, request), db, storage, env };
}
test('原子预占：并发第三笔免费请求被拒，重复提交返回原任务且参数不能变化', async () => {
  const { engine } = setup();
  const request = input();
  const first = await engine.submit(owner, request);
  assert.equal((await engine.submit(owner, request)).id, first.id);
  await assert.rejects(engine.submit(owner, { ...request, prompt: 'changed' }), /重复标识/);
  await engine.submit(owner, input());
  await assert.rejects(engine.submit(owner, input()), /免费额度/);
  assert.equal(engine.account(owner).freeRemaining, 0);
});
test('取消仅允许未执行任务；他人不能读取、取消或获取原图', async () => {
  const { engine } = setup();
  const job = await engine.submit(owner, input());
  assert.throws(() => engine.job(other, job.id), /不存在/);
  assert.throws(() => engine.cancel(other, job.id), /不存在/);
  engine.cancel(owner, job.id);
  engine.cancel(owner, job.id);
  assert.equal(engine.account(owner).freeRemaining, 2);
  assert.equal(engine.job(owner, job.id).status, 'cancelled');
});
test('上游 5xx 结果未知，重启与重复 alarm 不会再次生图或释放预占', async () => {
  let calls = 0;
  const { engine, storage, env } = setup({}, async () => {
    calls++;
    return new Response('', { status: 500 });
  });
  const job = await engine.submit(owner, input());
  await engine.alarm();
  const restarted = new PlatformCoordinator({ storage }, env, async () => {
    calls++;
    throw new Error('unexpected');
  });
  await restarted.alarm();
  assert.equal(calls, 1);
  assert.equal(engine.job(owner, job.id).status, 'needs_review');
  assert.equal(engine.account(owner).freeRemaining, 1);
  engine.resolve(owner, job.id, 'failed', '供应商已核对失败');
  engine.resolve(owner, job.id, 'failed', '重复核对');
  assert.equal(engine.account(owner).freeRemaining, 2);
});
test('明确拒绝释放额度；持久化执行状态后崩溃仍保留待核对而非重发', async () => {
  const { engine, db } = setup({}, async () => new Response('', { status: 429 }));
  const job = await engine.submit(owner, input());
  await engine.alarm();
  assert.equal(engine.job(owner, job.id).status, 'failed');
  assert.equal(engine.account(owner).freeRemaining, 2);
  const second = await engine.submit(owner, input());
  db.prepare("UPDATE platform_jobs SET status='generating', started_at=1 WHERE id=?").run(second.id);
  await engine.alarm();
  assert.equal(engine.job(owner, second.id).status, 'needs_review');
});
test('平台停单、容量、预算与上游允许列表在接单前检查', async () => {
  const { engine } = setup({ MEDIA_PLATFORM_DAILY_BUDGET_MICROS: '10' });
  await engine.submit(owner, input());
  await assert.rejects(engine.submit(other, input()), /预算/);
  engine.setPolicy(
    owner,
    { enabled: false, concurrency: 1, capacity: 20, freeDaily: 2, dailyBudgetMicros: 100 },
    '停单'
  );
  await assert.rejects(engine.submit(other, input()), /暂停/);
  const bad = setup({
    MEDIA_PLATFORM_MODELS: JSON.stringify([
      { id: 'test', baseUrl: 'http://127.0.0.1', secret: 'TEST_PROVIDER_KEY', model: 'x', credits: 1, costMicros: 1 }
    ])
  });
  await assert.rejects(bad.engine.submit(owner, input()), /配置/);
});
test('支付凭证金额和归属由订单确定；回调重放只入账一次', () => {
  const { engine } = setup({ MEDIA_CREDIT_PACK: JSON.stringify({ credits: 20, amount: 500, currency: 'usd' }) });
  const order = engine.order(owner, crypto.randomUUID());
  assert.throws(() => engine.creditPayment('evt-1', order.id, { amount: 1, currency: 'usd', paid: true }), /金额/);
  engine.creditPayment('evt-2', order.id, { amount: 500, currency: 'usd', paid: true });
  engine.creditPayment('evt-2', order.id, { amount: 500, currency: 'usd', paid: true });
  engine.creditPayment('evt-3', order.id, { amount: 500, currency: 'usd', paid: true });
  assert.equal(engine.account(owner).credits, 20);
});
test('退款先冻结未消费积分，未知结果不释放；重复回执不能重复退积分或退款', () => {
  const { engine } = setup({ MEDIA_CREDIT_PACK: JSON.stringify({ credits: 20, amount: 500, currency: 'usd' }) });
  const order = engine.order(owner, crypto.randomUUID());
  engine.creditPayment('evt_paid', order.id, { amount: 500, currency: 'usd', paid: true, paymentIntent: 'pi_example' });
  const refund = engine.prepareRefund(other, order.id, '用户申请退款');
  assert.equal(engine.account(owner).credits, 0);
  assert.equal(engine.prepareRefund(other, order.id, '重复核对').requestId, refund.requestId);
  engine.finishRefund(other, order.id, refund.requestId, 'pending');
  assert.equal(engine.account(owner).credits, 0);
  engine.finishRefund(other, order.id, refund.requestId, 'failed');
  engine.finishRefund(other, order.id, refund.requestId, 'failed');
  assert.equal(engine.account(owner).credits, 20);
});
test('成功原图原样入 R2；响应不泄露供应商配置；重复任务不再调用上游', async () => {
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jV1kAAAAASUVORK5CYII=';
  let calls = 0,
    stored;
  const { engine } = setup(
    {
      MEDIA_RESULTS: {
        async put(_id, bytes) {
          stored = bytes;
        }
      }
    },
    async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.example.com/v1/images/generations');
      assert.equal(init.redirect, 'manual');
      assert.equal(init.headers.authorization, 'Bearer private-key');
      return Response.json({ data: [{ b64_json: png }] });
    }
  );
  const params = input();
  const job = await engine.submit(owner, params);
  await engine.alarm();
  assert.equal(engine.job(owner, job.id).status, 'completed');
  assert.deepEqual(Buffer.from(stored), Buffer.from(png, 'base64'));
  assert.ok(!JSON.stringify(engine.job(owner, job.id)).includes('private-key'));
  assert.ok(!JSON.stringify(engine.catalog()).includes('TEST_PROVIDER_KEY'));
  await engine.submit(owner, params);
  await engine.alarm();
  assert.equal(calls, 1);
});
test('真实并发提交在同一事务域中受免费额度限制', async () => {
  const { engine } = setup();
  const results = await Promise.allSettled([
    engine.submit(owner, input()),
    engine.submit(owner, input()),
    engine.submit(owner, input())
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 2);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(engine.account(owner).freeRemaining, 0);
});

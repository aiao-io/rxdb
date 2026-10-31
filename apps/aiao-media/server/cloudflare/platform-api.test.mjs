import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handlePlatform, paymentEvent } from './platform-api.mjs';

async function signed(payload, secret = 'webhook-secret', timestamp = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(payload);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = [
    ...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${raw}`)))
  ]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');
  return new Request('https://media.example.com/api/platform/webhook', {
    method: 'POST',
    body: raw,
    headers: { 'stripe-signature': `t=${timestamp},v1=${signature}` }
  });
}
test('支付必须验证原始正文、签名、时间窗，不能以成功跳转替代入账通知', async () => {
  const payload = { id: 'evt_verified', type: 'checkout.session.completed' };
  assert.deepEqual(await paymentEvent(await signed(payload), 'webhook-secret'), payload);
  await assert.rejects(paymentEvent(await signed(payload), 'wrong-secret'), /签名/);
  await assert.rejects(paymentEvent(await signed(payload, 'webhook-secret', 1), 'webhook-secret'), /签名/);
  const response = await handlePlatform(
    new Request('https://media.example.com/api/platform/webhook', { method: 'POST', body: JSON.stringify(payload) }),
    { MEDIA_STRIPE_WEBHOOK_SECRET: 'webhook-secret' }
  );
  assert.equal(response.status, 400);
});
test('未登录和跨 origin 请求在进入任务协调器之前被拒绝', async () => {
  let accessed = false;
  const env = {
    MEDIA_PLATFORM: {
      get() {
        accessed = true;
        throw new Error('unexpected');
      }
    }
  };
  const unauthenticated = await handlePlatform(new Request('https://media.example.com/api/platform/jobs'), env);
  assert.equal(unauthenticated.status, 401);
  const crossOrigin = await handlePlatform(
    new Request('https://media.example.com/api/platform/jobs', {
      method: 'POST',
      headers: { origin: 'https://evil.example.com', authorization: 'Bearer fake' }
    }),
    env
  );
  assert.equal(crossOrigin.status, 403);
  assert.equal(accessed, false);
});
test('普通账号不能访问平台运维，禁用账号不能接单', async t => {
  const original = globalThis.fetch;
  t.after(() => {
    globalThis.fetch = original;
  });
  const owner = '11111111-1111-4111-8111-111111111111';
  const env = {
    MEDIA_SUPABASE_URL: 'https://auth.example.com',
    MEDIA_SUPABASE_ANON_KEY: 'public',
    MEDIA_SUPABASE_SERVICE_ROLE_KEY: 'private'
  };
  globalThis.fetch = async url => Response.json(String(url).endsWith('/auth/v1/user') ? { id: owner } : false);
  assert.equal(
    (
      await handlePlatform(
        new Request('https://media.example.com/api/platform/admin', { headers: { authorization: 'Bearer verified' } }),
        env
      )
    ).status,
    403
  );
  globalThis.fetch = async url =>
    Response.json(String(url).endsWith('/auth/v1/user') ? { id: owner } : [{ disabled: true }]);
  assert.equal(
    (
      await handlePlatform(
        new Request('https://media.example.com/api/platform/jobs', { headers: { authorization: 'Bearer verified' } }),
        env
      )
    ).status,
    403
  );
});

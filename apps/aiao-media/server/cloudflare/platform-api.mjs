import { administrator, backend, body, endpoint, reject, sameOriginWrite, uuid } from './product-http.mjs';

async function member(request, env) {
  sameOriginWrite(request, env);
  const token = /^Bearer ([A-Za-z0-9._~-]+)$/.exec(request.headers.get('authorization') ?? '')?.[1];
  if (!token) reject(401, '请先登录平台账号。');
  const client = backend(env);
  const user = await client.call('/auth/v1/user', { token, privileged: false });
  if (!uuid(user?.id)) reject(401, '账号无效。');
  const accounts = await client.call(`/rest/v1/media_accounts?select=disabled&user_id=eq.${user.id}`);
  if (!Array.isArray(accounts) || accounts.some(account => account.disabled)) reject(403, '账号已禁用。');
  return user.id;
}
function coordinator(env) {
  if (!env.MEDIA_PLATFORM) reject(503, '平台服务尚未启用。');
  return env.MEDIA_PLATFORM.get(env.MEDIA_PLATFORM.idFromName('platform-v1'));
}
async function call(env, path, owner, payload, admin = false) {
  return coordinator(env).fetch(
    new Request(`https://platform.internal${path}`, {
      method: payload === undefined ? 'GET' : 'POST',
      headers: { 'x-media-owner': owner, 'x-media-admin': String(admin), 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    })
  );
}
async function checkout(env, owner, requestId, origin) {
  if (!env.MEDIA_STRIPE_SECRET_KEY) reject(503, '充值服务尚未启用。');
  const response = await call(env, '/order', owner, { requestId });
  if (!response.ok) return response;
  const order = await response.json();
  const form = new URLSearchParams({
    mode: 'payment',
    client_reference_id: order.id,
    success_url: `${origin}/create?payment=returned`,
    cancel_url: `${origin}/create?payment=cancelled`,
    'line_items[0][price_data][currency]': order.currency,
    'line_items[0][price_data][unit_amount]': String(order.amount),
    'line_items[0][price_data][product_data][name]': `Aiao Media ${order.credits} 积分`,
    'line_items[0][quantity]': '1',
    'payment_intent_data[metadata][media_order]': order.id
  });
  const result = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.MEDIA_STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': order.id
    },
    body: form.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) {
    await result.body?.cancel();
    reject(502, '支付会话尚未确认，请使用原订单重试。');
  }
  const session = await result.json();
  const url = new URL(session.url);
  if (url.protocol !== 'https:' || url.hostname !== 'checkout.stripe.com' || url.username || url.password)
    reject(502, '支付跳转地址无效。');
  return Response.json({ url: url.href, orderId: order.id }, { headers: { 'cache-control': 'no-store' } });
}

async function refund(env, actorId, value) {
  if (!env.MEDIA_STRIPE_SECRET_KEY) reject(503, '退款服务尚未启用。');
  const prepared = await call(env, '/admin/refund/prepare', actorId, value, true);
  if (!prepared.ok) return prepared;
  const order = await prepared.json();
  if (order.status !== 'pending') return Response.json({ status: order.status });
  const form = new URLSearchParams({
    payment_intent: order.paymentIntent,
    'metadata[media_order]': order.orderId,
    'metadata[media_request]': order.requestId
  });
  const result = await fetch('https://api.stripe.com/v1/refunds', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${env.MEDIA_STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'idempotency-key': order.requestId
    },
    body: form.toString(),
    redirect: 'manual',
    signal: AbortSignal.timeout(15000)
  });
  if (!result.ok) {
    await result.body?.cancel();
    reject(502, '退款结果未确认，积分保持冻结。请核对 Stripe 后用原订单继续查询。');
  }
  const receipt = await result.json();
  return call(
    env,
    '/admin/refund/finish',
    actorId,
    { orderId: order.orderId, requestId: order.requestId, status: receipt.status },
    true
  );
}

/** 验签使用原始正文，时间窗和持久事件回执共同阻止伪造与重复入账。 */
export async function paymentEvent(request, secret) {
  if (!secret) reject(503, '支付通知尚未启用。');
  const header = request.headers.get('stripe-signature') ?? '';
  const timestamp = /(?:^|,)t=(\d+)/.exec(header)?.[1];
  const signatures = [...header.matchAll(/(?:^|,)v1=([0-9a-f]{64})(?=,|$)/g)].map(match => match[1]);
  if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 || !signatures.length)
    reject(400, '支付通知签名无效。');
  const reader = request.body?.getReader();
  if (!reader) reject(400, '支付通知为空。');
  const chunks = [];
  let size = 0;
  for (;;) {
    const item = await reader.read();
    if (item.done) break;
    size += item.value.length;
    if (size > 262144) {
      await reader.cancel();
      reject(413, '支付通知过大。');
    }
    chunks.push(item.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  const raw = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const valid = await Promise.all(
    signatures.map(signature =>
      crypto.subtle.verify(
        'HMAC',
        key,
        Uint8Array.from(signature.match(/../g), value => parseInt(value, 16)),
        new TextEncoder().encode(`${timestamp}.${raw}`)
      )
    )
  );
  if (!valid.some(Boolean)) reject(400, '支付通知签名无效。');
  return JSON.parse(raw);
}
export async function handlePlatform(request, env) {
  const path = new URL(request.url).pathname.replace('/api/platform', '');
  if (path === '/webhook')
    return endpoint(async () => {
      if (request.method !== 'POST') reject(405, '需要 POST。');
      const event = await paymentEvent(request, env.MEDIA_STRIPE_WEBHOOK_SECRET);
      if (event.type === 'refund.updated' || event.type === 'refund.created') {
        const receipt = event.data?.object;
        const completed = await call(env, '/refund-complete', '', {
          orderId: receipt?.metadata?.media_order,
          requestId: receipt?.metadata?.media_request,
          status: receipt?.status
        });
        if (!completed.ok) reject(completed.status, '退款回执未确认。');
        return { received: true };
      }
      if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type))
        return { received: true };
      const session = event.data?.object;
      if (!/^evt_[a-zA-Z0-9]+$/.test(event.id) || !uuid(session?.client_reference_id) || session.mode !== 'payment')
        reject(400, '支付通知格式无效。');
      const response = await call(env, '/payment', '', {
        eventId: event.id,
        orderId: session.client_reference_id,
        receipt: {
          amount: session.amount_total,
          currency: session.currency,
          paid: session.payment_status === 'paid',
          paymentIntent: session.payment_intent
        }
      });
      if (!response.ok) reject(response.status, '支付入账未确认，请重试通知。');
      return { received: true };
    });
  try {
    if (path.startsWith('/admin')) {
      const { actorId } = await administrator(request, env);
      if (path === '/admin/refund' && request.method === 'POST')
        return await refund(env, actorId, await body(request, 4096));
      if (
        !(path === '/admin' && request.method === 'GET') &&
        !(request.method === 'POST' && ['/admin/policy', '/admin/resolve', '/admin/price'].includes(path))
      )
        reject(404, '运维接口不存在。');
      return await call(env, path, actorId, request.method === 'POST' ? await body(request, 8192) : undefined, true);
    }
    const owner = await member(request, env);
    if (path === '/checkout' && request.method === 'POST')
      return await checkout(env, owner, (await body(request, 4096)).requestId, new URL(request.url).origin);
    if (path === '/catalog' || path === '/account' || (path === '/jobs' && request.method === 'GET')) {
      if (request.method !== 'GET') reject(405, '需要 GET。');
      return await call(env, path, owner);
    }
    if (path === '/jobs' && request.method === 'POST') return await call(env, path, owner, await body(request, 16384));
    const match = /^\/jobs\/([a-f0-9-]+)(\/cancel|\/result)?$/.exec(path);
    if (!match || !uuid(match[1])) reject(404, '平台接口不存在。');
    if (match[2] === '/cancel' && request.method === 'POST') return await call(env, path, owner, {});
    if (request.method !== 'GET') reject(405, '需要 GET。');
    const response = await call(env, `/jobs/${match[1]}`, owner);
    if (match[2] !== '/result' || !response.ok) return response;
    const job = await response.json();
    if (job.status !== 'completed') reject(409, '图片尚未完成。');
    const object = await env.MEDIA_RESULTS?.get(job.id);
    if (!object) reject(410, '平台原图暂不可用或已按保留规则移除。');
    return new Response(object.body, {
      headers: {
        'content-type': job.result.mimeType,
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff',
        'content-disposition': `attachment; filename="aiao-${job.id}.${job.result.mimeType === 'image/png' ? 'png' : 'jpg'}"`
      }
    });
  } catch (error) {
    return endpoint(() => {
      throw error;
    });
  }
}

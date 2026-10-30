import { imageMetadata } from '../../src/contracts/image-format.ts';
import { imageGenerationRequest, isMiniMaxImageProvider } from '../../src/contracts/image-provider-protocol.ts';
import { body, endpoint, fields, reject, uuid } from './product-http.mjs';

const sizes = ['1024x1024', '1536x1024', '1024x1536'];
const integer = (value, min, max) => Number.isSafeInteger(value) && value >= min && value <= max;
const day = () => new Date().toISOString().slice(0, 10);
const hash = async value =>
  [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))]
    .map(v => v.toString(16).padStart(2, '0'))
    .join('');

function models(env) {
  let values;
  try {
    values = JSON.parse(env.MEDIA_PLATFORM_MODELS ?? '[]');
  } catch {
    return reject(503, '平台模型配置无效。');
  }
  if (!Array.isArray(values) || values.length > 20) reject(503, '平台模型配置无效。');
  return values.map(value => {
    const url = new URL(value.baseUrl);
    if (
      url.protocol !== 'https:' ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      !/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(url.hostname) ||
      /(?:^|\.)(?:localhost|local|internal|test|invalid)$/i.test(url.hostname) ||
      !/^[a-zA-Z0-9._-]{1,80}$/.test(value.id) ||
      !/^[a-zA-Z0-9._:-]{1,128}$/.test(value.model) ||
      !/^[A-Z][A-Z0-9_]{0,79}$/.test(value.secret) ||
      !integer(value.credits, 1, 100000) ||
      !integer(value.costMicros, 1, 1000000000)
    )
      reject(503, '平台模型配置无效。');
    return { ...value, baseUrl: url.href.replace(/\/+$/, '') };
  });
}

async function bounded(result, max) {
  const reader = result.body?.getReader();
  if (!reader) throw new Error('empty');
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > max) throw new Error('oversize');
      chunks.push(item.value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/** 一个持久协调器串行完成额度、队列与流水变更，外部副作用前先写执行状态。 */
export class PlatformCoordinator {
  constructor(ctx, env, request = fetch) {
    this.ctx = ctx;
    this.env = env;
    this.request = request;
    this.sql = ctx.storage.sql;
    for (const query of [
      'CREATE TABLE IF NOT EXISTS platform_accounts (owner TEXT PRIMARY KEY, credits INTEGER NOT NULL DEFAULT 0)',
      'CREATE TABLE IF NOT EXISTS platform_free (owner TEXT, day TEXT, used INTEGER NOT NULL, PRIMARY KEY(owner,day))',
      'CREATE TABLE IF NOT EXISTS platform_budget (day TEXT PRIMARY KEY, used INTEGER NOT NULL)',
      'CREATE TABLE IF NOT EXISTS platform_jobs (id TEXT PRIMARY KEY, owner TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL, created_at INTEGER NOT NULL, started_at INTEGER, payload TEXT NOT NULL, UNIQUE(owner,request_id))',
      'CREATE INDEX IF NOT EXISTS platform_jobs_queue ON platform_jobs(status,created_at)',
      'CREATE INDEX IF NOT EXISTS platform_jobs_owner ON platform_jobs(owner,created_at)',
      'CREATE TABLE IF NOT EXISTS platform_ledger (id INTEGER PRIMARY KEY, owner TEXT, reference TEXT, action TEXT, amount INTEGER, created_at INTEGER, UNIQUE(reference,action))',
      'CREATE TABLE IF NOT EXISTS platform_orders (id TEXT PRIMARY KEY, owner TEXT, request_id TEXT, payload TEXT, paid INTEGER NOT NULL DEFAULT 0, UNIQUE(owner,request_id))',
      'CREATE TABLE IF NOT EXISTS platform_events (id TEXT PRIMARY KEY, order_id TEXT)',
      'CREATE TABLE IF NOT EXISTS platform_policy (id INTEGER PRIMARY KEY, payload TEXT)',
      'CREATE TABLE IF NOT EXISTS platform_audit (id INTEGER PRIMARY KEY, actor TEXT, action TEXT, target TEXT, detail TEXT, created_at INTEGER)'
    ])
      this.sql.exec(query);
  }
  rows(query, ...args) {
    return [...this.sql.exec(query, ...args)];
  }
  atomic(operation) {
    return this.ctx.storage.transactionSync(operation);
  }
  policy() {
    const saved = this.rows('SELECT payload FROM platform_policy WHERE id=1')[0];
    const policy =
      saved ?
        JSON.parse(saved.payload)
      : {
          enabled: true,
          concurrency: 1,
          capacity: 100,
          freeDaily: Number(this.env.MEDIA_PLATFORM_FREE_DAILY ?? 0),
          dailyBudgetMicros: Number(this.env.MEDIA_PLATFORM_DAILY_BUDGET_MICROS ?? 0)
        };
    if (!integer(policy.freeDaily, 0, 100) || !integer(policy.dailyBudgetMicros, 0, 10000000000))
      reject(503, '额度与预算配置无效。');
    return policy;
  }
  catalog() {
    const policy = this.policy();
    return {
      ...policy,
      models: models(this.env).map(m => ({ id: m.id, name: m.name ?? m.id, credits: m.credits, sizes })),
      pack:
        this.env.MEDIA_CREDIT_PACK || this.rows('SELECT id FROM platform_policy WHERE id=2').length ?
          this.pack()
        : null,
      fairness: '按接单顺序处理，免费与付费同序；未知结果保留预占，核对后结算。'
    };
  }
  account(owner) {
    return {
      credits: this.rows('SELECT credits FROM platform_accounts WHERE owner=?', owner)[0]?.credits ?? 0,
      freeRemaining: Math.max(
        0,
        this.policy().freeDaily -
          (this.rows('SELECT used FROM platform_free WHERE owner=? AND day=?', owner, day())[0]?.used ?? 0)
      ),
      freeReset: '每日 UTC 00:00',
      ledger: this.rows(
        'SELECT reference,action,amount,created_at FROM platform_ledger WHERE owner=? ORDER BY id DESC LIMIT 100',
        owner
      )
    };
  }
  pack() {
    const saved = this.rows('SELECT payload FROM platform_policy WHERE id=2')[0];
    const pack = JSON.parse(saved?.payload ?? this.env.MEDIA_CREDIT_PACK ?? '{}');
    if (
      !integer(pack.credits, 1, 100000) ||
      !integer(pack.amount, 50, 10000000) ||
      !['usd', 'eur', 'cny', 'gbp', 'hkd'].includes(pack.currency)
    )
      reject(503, '充值尚未配置。');
    return { credits: pack.credits, amount: pack.amount, currency: pack.currency };
  }
  setPack(actor, pack, note) {
    fields(pack, ['credits', 'amount', 'currency']);
    if (
      !integer(pack.credits, 1, 100000) ||
      !integer(pack.amount, 50, 10000000) ||
      !['usd', 'eur', 'cny', 'gbp', 'hkd'].includes(pack.currency) ||
      typeof note !== 'string' ||
      note.length < 2 ||
      note.length > 500
    )
      reject(400, '价格参数无效。');
    return this.atomic(() => {
      this.sql.exec(
        'INSERT INTO platform_policy VALUES (2,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
        JSON.stringify(pack)
      );
      this.audit(actor, 'price', 'credit-pack', JSON.stringify({ pack, note }));
      return pack;
    });
  }
  async submit(owner, value) {
    fields(value, ['requestId', 'model', 'prompt', 'size', 'billing']);
    if (
      !uuid(value.requestId) ||
      typeof value.prompt !== 'string' ||
      !value.prompt.trim() ||
      value.prompt.length > 2000 ||
      !sizes.includes(value.size) ||
      !['free', 'credits'].includes(value.billing)
    )
      reject(400, '生图参数无效。');
    const model = models(this.env).find(m => m.id === value.model);
    if (!model || !this.env[model.secret] || !this.env.MEDIA_RESULTS) reject(503, '模型或结果存储未配置。');
    if (!imageGenerationRequest(model.baseUrl, { ...value, model: model.model }))
      reject(400, '此模型不支持当前提示词。');
    const fingerprint = await hash(JSON.stringify([value.model, value.prompt, value.size, value.billing]));
    await this.ctx.storage.setAlarm(Date.now() + 1000);
    return this.atomic(() => {
      const previous = this.rows(
        'SELECT * FROM platform_jobs WHERE owner=? AND request_id=?',
        owner,
        value.requestId
      )[0];
      if (previous) {
        if (previous.fingerprint !== fingerprint) reject(409, '重复标识不能用于不同请求。');
        return this.publicJob(previous);
      }
      const policy = this.policy();
      if (!policy.enabled) reject(503, '平台已暂停接单。');
      if (
        this.rows("SELECT count(*) AS n FROM platform_jobs WHERE status IN ('queued','generating')")[0].n >=
        policy.capacity
      )
        reject(429, '当前队列已满，请稍后再试。');
      if (
        this.rows(
          'SELECT count(*) AS n FROM platform_jobs WHERE owner=? AND created_at>?',
          owner,
          Date.now() - 60000
        )[0].n >= 10
      )
        reject(429, '提交过于频繁，请稍后再试。');
      const budget = this.rows('SELECT used FROM platform_budget WHERE day=?', day())[0]?.used ?? 0;
      if (budget + model.costMicros > policy.dailyBudgetMicros) reject(429, '平台今日预算不足，已停止接单。');
      this.sql.exec('INSERT INTO platform_accounts(owner) VALUES (?) ON CONFLICT DO NOTHING', owner);
      const account = this.account(owner);
      if (value.billing === 'free' && account.freeRemaining < 1) reject(402, '今日免费额度已用尽。');
      if (value.billing === 'credits' && account.credits < model.credits) reject(402, '积分余额不足。');
      const id = crypto.randomUUID(),
        now = Date.now();
      const payload = {
        ...value,
        day: day(),
        credits: value.billing === 'credits' ? model.credits : 0,
        costMicros: model.costMicros,
        provider: { ...model, secret: model.secret }
      };
      if (value.billing === 'free')
        this.sql.exec(
          'INSERT INTO platform_free VALUES (?,?,1) ON CONFLICT(owner,day) DO UPDATE SET used=used+1',
          owner,
          day()
        );
      else this.sql.exec('UPDATE platform_accounts SET credits=credits-? WHERE owner=?', model.credits, owner);
      this.sql.exec(
        'INSERT INTO platform_budget VALUES (?,?) ON CONFLICT(day) DO UPDATE SET used=used+excluded.used',
        day(),
        model.costMicros
      );
      this.sql.exec(
        'INSERT INTO platform_jobs VALUES (?,?,?,?,?,?,NULL,?)',
        id,
        owner,
        value.requestId,
        fingerprint,
        'queued',
        now,
        JSON.stringify(payload)
      );
      this.sql.exec(
        'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
        owner,
        id,
        'reserve',
        -payload.credits,
        now
      );
      return this.job(owner, id);
    });
  }
  publicJob(row, includePrompt = true) {
    const p = JSON.parse(row.payload);
    return {
      id: row.id,
      status: row.status,
      model: p.model,
      size: p.size,
      billing: p.billing,
      credits: p.credits,
      createdAt: new Date(row.created_at).toISOString(),
      ...(includePrompt ? { prompt: p.prompt ?? '', requestId: row.request_id } : {}),
      result: p.result ?? null,
      message:
        row.status === 'queued' ? '当前繁忙，任务已进入队列。按接单顺序等待，暂无法可靠估计等待时间。'
        : row.status === 'needs_review' ? '结果待核对，额度仍预占；不会自动重新生图。'
        : ''
    };
  }
  owned(owner, id) {
    const row = this.rows('SELECT * FROM platform_jobs WHERE id=? AND owner=?', id, owner)[0];
    if (!row) reject(404, '任务不存在。');
    return row;
  }
  job(owner, id) {
    return this.publicJob(this.owned(owner, id));
  }
  jobs(owner) {
    return this.rows('SELECT * FROM platform_jobs WHERE owner=? ORDER BY created_at DESC,id DESC LIMIT 100', owner).map(
      row => this.publicJob(row)
    );
  }
  release(row, status) {
    const p = JSON.parse(row.payload);
    if (row.status !== 'queued' && row.status !== 'generating' && row.status !== 'needs_review') return;
    if (p.billing === 'free')
      this.sql.exec('UPDATE platform_free SET used=used-1 WHERE owner=? AND day=?', row.owner, p.day);
    else this.sql.exec('UPDATE platform_accounts SET credits=credits+? WHERE owner=?', p.credits, row.owner);
    this.sql.exec('UPDATE platform_budget SET used=used-? WHERE day=?', p.costMicros, p.day);
    this.sql.exec(
      'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
      row.owner,
      row.id,
      'release',
      p.credits,
      Date.now()
    );
    delete p.prompt;
    this.sql.exec('UPDATE platform_jobs SET status=?,payload=? WHERE id=?', status, JSON.stringify(p), row.id);
  }
  cancel(owner, id) {
    return this.atomic(() => {
      const row = this.owned(owner, id);
      if (row.status === 'cancelled') return this.publicJob(row);
      if (row.status !== 'queued') reject(409, '任务已经执行，无法取消上游请求。');
      this.release(row, 'cancelled');
      return this.job(owner, id);
    });
  }
  resolve(actor, id, outcome, note) {
    return this.atomic(() => {
      const row = this.rows('SELECT * FROM platform_jobs WHERE id=?', id)[0];
      if (!row) reject(404, '任务不存在。');
      if (row.status === 'failed' && outcome === 'failed') return this.publicJob(row);
      if (
        row.status !== 'needs_review' ||
        outcome !== 'failed' ||
        typeof note !== 'string' ||
        note.trim().length < 4 ||
        note.length > 500
      )
        reject(409, '核对参数无效；必须先确认供应商未交付。');
      this.release(row, 'failed');
      this.audit(actor, 'resolve_failed', id, note);
      return this.job(row.owner, id);
    });
  }
  audit(actor, action, target, detail) {
    this.sql.exec(
      'INSERT INTO platform_audit(actor,action,target,detail,created_at) VALUES (?,?,?,?,?)',
      actor,
      action,
      target,
      detail,
      Date.now()
    );
  }
  setPolicy(actor, value, note) {
    fields(value, ['enabled', 'concurrency', 'capacity', 'freeDaily', 'dailyBudgetMicros']);
    if (
      typeof value.enabled !== 'boolean' ||
      !integer(value.concurrency, 1, 5) ||
      !integer(value.capacity, 1, 1000) ||
      !integer(value.freeDaily, 0, 100) ||
      !integer(value.dailyBudgetMicros, 0, 10000000000) ||
      typeof note !== 'string' ||
      note.trim().length < 2 ||
      note.length > 500
    )
      reject(400, '服务策略参数无效。');
    return this.atomic(() => {
      this.audit(actor, 'policy', 'platform', JSON.stringify({ before: this.policy(), after: value, note }));
      this.sql.exec(
        'INSERT INTO platform_policy VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload',
        JSON.stringify(value)
      );
      return value;
    });
  }
  order(owner, requestId) {
    if (!uuid(requestId)) reject(400, '订单标识无效。');
    return this.atomic(() => {
      const previous = this.rows('SELECT * FROM platform_orders WHERE owner=? AND request_id=?', owner, requestId)[0];
      if (previous) return { id: previous.id, ...JSON.parse(previous.payload) };
      const pack = this.pack(),
        id = crypto.randomUUID();
      this.sql.exec(
        'INSERT INTO platform_orders(id,owner,request_id,payload) VALUES (?,?,?,?)',
        id,
        owner,
        requestId,
        JSON.stringify(pack)
      );
      return { id, ...pack };
    });
  }
  creditPayment(eventId, orderId, receipt) {
    return this.atomic(() => {
      const order = this.rows('SELECT * FROM platform_orders WHERE id=?', orderId)[0];
      if (!order) reject(404, '订单不存在。');
      const pack = JSON.parse(order.payload);
      if (receipt.amount !== pack.amount || receipt.currency !== pack.currency || receipt.paid !== true)
        reject(400, '支付金额、币种或状态不匹配。');
      const event = this.rows('SELECT * FROM platform_events WHERE id=?', eventId)[0];
      if (event && event.order_id !== orderId) reject(409, '支付事件归属冲突。');
      this.sql.exec('INSERT INTO platform_events VALUES (?,?) ON CONFLICT DO NOTHING', eventId, orderId);
      if (order.paid) return { credited: true };
      this.sql.exec(
        'INSERT INTO platform_accounts(owner,credits) VALUES (?,?) ON CONFLICT(owner) DO UPDATE SET credits=credits+excluded.credits',
        order.owner,
        pack.credits
      );
      this.sql.exec('UPDATE platform_orders SET paid=1 WHERE id=?', orderId);
      this.sql.exec(
        'UPDATE platform_orders SET payload=? WHERE id=?',
        JSON.stringify({ ...pack, paymentIntent: receipt.paymentIntent ?? null }),
        orderId
      );
      this.sql.exec(
        'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
        order.owner,
        orderId,
        'purchase',
        pack.credits,
        Date.now()
      );
      return { credited: true };
    });
  }
  prepareRefund(actor, orderId, note) {
    return this.atomic(() => {
      const order = this.rows('SELECT * FROM platform_orders WHERE id=?', orderId)[0];
      if (!order?.paid || typeof note !== 'string' || note.trim().length < 4 || note.length > 500)
        reject(409, '已支付订单及核对原因必填。');
      const p = JSON.parse(order.payload);
      if (p.refund) return { orderId, paymentIntent: p.paymentIntent, ...p.refund };
      if (!/^pi_[a-zA-Z0-9]+$/.test(p.paymentIntent) || this.account(order.owner).credits < p.credits)
        reject(409, '积分已消费或支付凭证不完整，不能全额退款。');
      p.refund = { requestId: crypto.randomUUID(), status: 'pending' };
      this.sql.exec('UPDATE platform_accounts SET credits=credits-? WHERE owner=?', p.credits, order.owner);
      this.sql.exec('UPDATE platform_orders SET payload=? WHERE id=?', JSON.stringify(p), orderId);
      this.sql.exec(
        'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
        order.owner,
        orderId,
        'refund_reserve',
        -p.credits,
        Date.now()
      );
      this.audit(actor, 'refund_prepare', orderId, note);
      return { orderId, paymentIntent: p.paymentIntent, ...p.refund };
    });
  }
  finishRefund(actor, orderId, requestId, status) {
    return this.atomic(() => {
      const order = this.rows('SELECT * FROM platform_orders WHERE id=?', orderId)[0];
      if (!order) reject(404, '订单不存在。');
      const p = JSON.parse(order.payload);
      if (
        !p.refund ||
        p.refund.requestId !== requestId ||
        !['pending', 'succeeded', 'failed', 'canceled'].includes(status)
      )
        reject(409, '退款回执无效。');
      if (p.refund.status !== 'pending' || status === 'pending') return { status: p.refund.status };
      p.refund.status = status;
      if (status !== 'succeeded')
        this.sql.exec('UPDATE platform_accounts SET credits=credits+? WHERE owner=?', p.credits, order.owner);
      this.sql.exec('UPDATE platform_orders SET payload=? WHERE id=?', JSON.stringify(p), orderId);
      this.sql.exec(
        'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
        order.owner,
        orderId,
        'refund_settle',
        status === 'succeeded' ? 0 : p.credits,
        Date.now()
      );
      this.audit(actor, 'refund_settle', orderId, status);
      return { status };
    });
  }
  async execute(row) {
    const p = JSON.parse(row.payload),
      model = p.provider;
    if (!this.env[model.secret]) return this.atomic(() => this.release(this.owned(row.owner, row.id), 'failed'));
    try {
      const request = imageGenerationRequest(model.baseUrl, { model: model.model, prompt: p.prompt, size: p.size });
      const response = await this.request(request.url, {
        method: 'POST',
        redirect: 'manual',
        credentials: 'omit',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        signal: AbortSignal.timeout(110000),
        headers: { authorization: `Bearer ${this.env[model.secret]}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          ...request.body,
          response_format: isMiniMaxImageProvider(model.baseUrl) ? 'base64' : 'b64_json'
        })
      });
      if ([400, 401, 403, 404, 413, 422, 429].includes(response.status)) {
        await response.body?.cancel();
        return this.atomic(() => this.release(this.owned(row.owner, row.id), 'failed'));
      }
      if (!response.ok) {
        await response.body?.cancel();
        throw new Error('unknown');
      }
      const envelope = JSON.parse(new TextDecoder().decode(await bounded(response, 24 * 1024 * 1024)));
      const encoded =
        isMiniMaxImageProvider(model.baseUrl) ?
          envelope.base_resp?.status_code === 0 && envelope.data?.image_base64?.[0]
        : envelope.data?.length === 1 && envelope.data[0]?.b64_json;
      if (typeof encoded !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error('result');
      const bytes = Uint8Array.from(atob(encoded), v => v.charCodeAt(0));
      const metadata = imageMetadata(bytes);
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
        .map(v => v.toString(16).padStart(2, '0'))
        .join('');
      await this.env.MEDIA_RESULTS.put(row.id, bytes, { httpMetadata: { contentType: metadata.mimeType } });
      this.atomic(() => {
        const latest = this.owned(row.owner, row.id);
        if (latest.status !== 'generating') return;
        p.result = { ...metadata, bytes: bytes.length, sha256 };
        this.sql.exec("UPDATE platform_jobs SET status='completed',payload=? WHERE id=?", JSON.stringify(p), row.id);
        this.sql.exec(
          'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
          row.owner,
          row.id,
          'settle',
          0,
          Date.now()
        );
      });
    } catch {
      this.sql.exec("UPDATE platform_jobs SET status='needs_review' WHERE id=? AND status='generating'", row.id);
    }
  }
  async recover(actor, id, note) {
    const row = this.rows('SELECT * FROM platform_jobs WHERE id=?', id)[0];
    if (
      !row ||
      row.status !== 'needs_review' ||
      typeof note !== 'string' ||
      note.trim().length < 4 ||
      note.length > 500
    )
      reject(409, '恢复参数无效。');
    const object = await this.env.MEDIA_RESULTS?.get(id);
    if (!object) reject(409, '平台尚无已保存原图，请先核对供应商。');
    const bytes = await bounded(new Response(object.body), 16 * 1024 * 1024),
      metadata = imageMetadata(bytes);
    const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
      .map(v => v.toString(16).padStart(2, '0'))
      .join('');
    return this.atomic(() => {
      const latest = this.owned(row.owner, id);
      if (latest.status !== 'needs_review') reject(409, '任务核对状态已变化。');
      const p = JSON.parse(latest.payload);
      p.result = { ...metadata, bytes: bytes.length, sha256 };
      this.sql.exec("UPDATE platform_jobs SET status='completed',payload=? WHERE id=?", JSON.stringify(p), id);
      this.sql.exec(
        'INSERT INTO platform_ledger(owner,reference,action,amount,created_at) VALUES (?,?,?,?,?)',
        row.owner,
        id,
        'settle',
        0,
        Date.now()
      );
      this.audit(actor, 'recover_result', id, note);
      return this.job(row.owner, id);
    });
  }
  async alarm() {
    this.sql.exec(
      "UPDATE platform_jobs SET status='needs_review' WHERE status='generating' AND started_at<?",
      Date.now() - 120000
    );
    await this.ctx.storage.setAlarm(Date.now() + 125000);
    const claimed = this.atomic(() => {
      const running = this.rows("SELECT count(*) AS n FROM platform_jobs WHERE status='generating'")[0].n;
      const jobs = this.rows(
        "SELECT * FROM platform_jobs WHERE status='queued' ORDER BY created_at,id LIMIT ?",
        Math.max(0, this.policy().concurrency - running)
      );
      for (const job of jobs)
        this.sql.exec(
          "UPDATE platform_jobs SET status='generating',started_at=? WHERE id=? AND status='queued'",
          Date.now(),
          job.id
        );
      return jobs;
    });
    await Promise.all(claimed.map(job => this.execute(job)));
    if (this.rows("SELECT count(*) AS n FROM platform_jobs WHERE status IN ('queued','generating')")[0].n)
      await this.ctx.storage.setAlarm(Date.now() + 1000);
  }
  async fetch(request) {
    const url = new URL(request.url),
      owner = request.headers.get('x-media-owner');
    return endpoint(async () => {
      if (url.pathname === '/payment') {
        const p = await body(request);
        return this.creditPayment(p.eventId, p.orderId, p.receipt);
      }
      if (url.pathname === '/refund-complete') {
        const p = await body(request);
        return this.finishRefund('stripe', p.orderId, p.requestId, p.status);
      }
      if (!uuid(owner)) reject(401, '账号无效。');
      if (url.pathname === '/catalog') return this.catalog();
      if (url.pathname === '/account') return this.account(owner);
      if (url.pathname === '/jobs' && request.method === 'POST') return this.submit(owner, await body(request, 16384));
      if (url.pathname === '/jobs') return { jobs: this.jobs(owner) };
      if (url.pathname === '/order') return this.order(owner, (await body(request, 4096)).requestId);
      const match = /^\/jobs\/([a-f0-9-]+)(\/cancel)?$/.exec(url.pathname);
      if (match) return match[2] ? this.cancel(owner, match[1]) : this.job(owner, match[1]);
      if (request.headers.get('x-media-admin') !== 'true') reject(403, '需要管理员权限。');
      if (url.pathname === '/admin' && request.method === 'GET')
        return {
          policy: this.policy(),
          jobs: this.rows('SELECT * FROM platform_jobs ORDER BY created_at DESC LIMIT 100').map(row => ({
            ...this.publicJob(row, false),
            owner: row.owner
          })),
          audit: this.rows('SELECT * FROM platform_audit ORDER BY id DESC LIMIT 100'),
          budget: this.rows('SELECT * FROM platform_budget ORDER BY day DESC LIMIT 30'),
          ledger: this.rows('SELECT * FROM platform_ledger ORDER BY id DESC LIMIT 100'),
          orders: this.rows('SELECT id,owner,paid,payload FROM platform_orders ORDER BY rowid DESC LIMIT 100')
        };
      if (url.pathname === '/admin/policy') {
        const p = await body(request, 4096);
        return this.setPolicy(owner, p.policy, p.note);
      }
      if (url.pathname === '/admin/price') {
        const p = await body(request, 4096);
        return this.setPack(owner, p.pack, p.note);
      }
      if (url.pathname === '/admin/refund/prepare') {
        const p = await body(request, 4096);
        return this.prepareRefund(owner, p.orderId, p.note);
      }
      if (url.pathname === '/admin/refund/finish') {
        const p = await body(request, 4096);
        return this.finishRefund(owner, p.orderId, p.requestId, p.status);
      }
      if (url.pathname === '/admin/resolve') {
        const p = await body(request, 4096);
        if (p.outcome === 'completed') return this.recover(owner, p.id, p.note);
        if (await this.env.MEDIA_RESULTS?.head?.(p.id)) reject(409, '平台已有原图，请恢复原图回执。');
        return this.resolve(owner, p.id, p.outcome, p.note);
      }
      reject(404, '平台接口不存在。');
    });
  }
}

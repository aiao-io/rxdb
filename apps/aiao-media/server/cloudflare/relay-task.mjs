import {
  relayResultKey,
  relayTaskTokenHash,
  relayTaskTokenHeader,
  sealRelayResult
} from '../../src/contracts/relay-task.ts';
import { bounded } from './product-http.mjs';

/** 上游超时、看门狗、保留期、结果上限与长轮询上限。 */
export const relayTaskLimits = {
  upstreamMs: 180_000,
  watchdogMs: 210_000,
  retentionMs: 24 * 60 * 60 * 1000,
  resultBytes: 24 * 1024 * 1024,
  waitMs: 25_000
};

const definite = [400, 401, 403, 404, 413, 422, 429];
const closed = row => row.status === 'abandoned' || row.status === 'deleted';
const digest = async value =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
const reply = (data, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }
  });

/** 与“任务不存在”相同的响应；令牌错误时不泄露任务是否存在。 */
export const missingRelayTask = () => reply({ error: 'Task not found' }, 404);

/**
 * 一个代理任务一个对象。Key 只在接单调用内发出上游请求，等待结果时只持有由任务令牌派生的加密密钥；
 * 结果加密后暂存 R2，存储里只有令牌摘要、请求指纹和状态。
 */
export class RelayTask {
  constructor(ctx, env, request = (url, init) => fetch(url, init)) {
    this.ctx = ctx;
    this.env = env;
    this.request = request;
    this.waiters = new Set();
  }
  row() {
    // deleteAll drops the table too, so every access recreates it.
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS relay_task (task_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL, upstream_status INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)'
    );
    return [...this.ctx.storage.sql.exec('SELECT * FROM relay_task')][0] ?? null;
  }
  view(row) {
    return {
      status: row.status,
      upstreamStatus: row.upstream_status ?? null,
      updatedAt: new Date(row.updated_at).toISOString()
    };
  }
  insert(taskId, hash, fingerprint, status) {
    const now = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO relay_task VALUES (?,?,?,?,NULL,?,?)',
      taskId,
      hash,
      fingerprint,
      status,
      now,
      now
    );
    return now;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const hash = await relayTaskTokenHash(request.headers.get(relayTaskTokenHeader) ?? '');
    if (request.method === 'PUT') return this.start(request, hash);
    if (url.pathname === '/abandon') return this.abandon(request, hash);
    const row = this.row();
    if (!row || row.token_hash !== hash || closed(row)) return missingRelayTask();
    if (request.method === 'DELETE') return this.remove(row);
    if (url.pathname === '/result') return this.result(row);
    return this.status(row, Number(url.searchParams.get('wait') ?? 0));
  }
  async start(request, hash) {
    const { taskId, url, body } = await request.json();
    const fingerprint = await digest(JSON.stringify([url, body]));
    const key = await relayResultKey(request.headers.get(relayTaskTokenHeader), taskId, 'encrypt');
    const existing = this.row();
    if (existing) return this.replay(existing, hash, fingerprint);
    const created = this.insert(taskId, hash, fingerprint, 'dispatched');
    await this.ctx.storage.setAlarm(created + relayTaskLimits.watchdogMs);
    const pending = this.request(url, {
      method: 'POST',
      // Never follow a redirect with the Key; non-2xx answers are classified in finish().
      redirect: 'manual',
      signal: AbortSignal.timeout(relayTaskLimits.upstreamMs),
      headers: { authorization: request.headers.get('authorization'), 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    this.ctx.waitUntil(this.finish(pending, key, taskId));
    return reply(this.view(this.row()), 202);
  }
  replay(existing, hash, fingerprint) {
    if (existing.token_hash !== hash) return missingRelayTask();
    if (closed(existing)) return reply({ error: 'Task is closed' }, 409);
    if (existing.fingerprint !== fingerprint) return reply({ error: 'Task id was used for a different request' }, 409);
    return reply(this.view(existing));
  }
  async answer(pending, key, taskId) {
    const response = await pending;
    if (definite.includes(response.status)) {
      await response.body?.cancel();
      return ['rejected', response.status];
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      return ['needs_review', response.status];
    }
    const sealed = await sealRelayResult(key, await bounded(response, relayTaskLimits.resultBytes));
    await this.env.RELAY_RESULTS.put(taskId, sealed, { httpMetadata: { contentType: 'application/octet-stream' } });
    return ['received', response.status];
  }
  async finish(pending, key, taskId) {
    const [status, upstreamStatus] = await this.answer(pending, key, taskId).catch(() => ['needs_review', null]);
    // If recording fails (for example after a reset), the row stays dispatched and the watchdog consults R2.
    await this.settle(status, upstreamStatus);
  }
  async settle(status, upstreamStatus) {
    const row = this.row();
    if (row?.status !== 'dispatched') return;
    this.ctx.storage.sql.exec(
      "UPDATE relay_task SET status=?, upstream_status=?, updated_at=? WHERE status='dispatched'",
      status,
      upstreamStatus,
      Date.now()
    );
    await this.ctx.storage.setAlarm(row.created_at + relayTaskLimits.retentionMs);
    for (const wake of this.waiters) wake();
  }
  async status(row, seconds) {
    if (row.status === 'dispatched' && seconds > 0)
      await new Promise(resolve => {
        const wake = () => {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, Math.min(seconds * 1000, relayTaskLimits.waitMs));
        this.waiters.add(wake);
      });
    const latest = this.row();
    return latest && latest.token_hash === row.token_hash && !closed(latest) ?
        reply(this.view(latest))
      : missingRelayTask();
  }
  async result(row) {
    if (row.status !== 'received') return reply({ error: 'Result is not ready' }, 409);
    const object = await this.env.RELAY_RESULTS.get(row.task_id);
    if (!object) return reply({ error: 'Result expired' }, 410);
    return new Response(object.body, {
      headers: {
        'content-type': 'application/octet-stream',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      }
    });
  }
  async remove(row) {
    if (row.status === 'dispatched') return reply({ error: 'Task is still running' }, 409);
    await this.env.RELAY_RESULTS.delete(row.task_id);
    // Keep the empty row until expiry so a replayed creation cannot dispatch the request again.
    this.ctx.storage.sql.exec("UPDATE relay_task SET status='deleted', updated_at=?", Date.now());
    return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
  }
  async abandon(request, hash) {
    const { taskId } = await request.json();
    const existing = this.row();
    if (existing)
      return existing.token_hash === hash && !closed(existing) ? reply(this.view(existing)) : missingRelayTask();
    const created = this.insert(taskId, hash, '', 'abandoned');
    await this.ctx.storage.setAlarm(created + relayTaskLimits.retentionMs);
    return missingRelayTask();
  }
  async alarm() {
    const row = this.row();
    if (!row) return;
    if (Date.now() >= row.created_at + relayTaskLimits.retentionMs) {
      await this.env.RELAY_RESULTS.delete(row.task_id);
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    // The watchdog only fires while dispatched if this instance never recorded the outcome.
    if (row.status === 'dispatched')
      return this.settle((await this.env.RELAY_RESULTS.head(row.task_id)) ? 'received' : 'needs_review', null);
    await this.ctx.storage.setAlarm(row.created_at + relayTaskLimits.retentionMs);
  }
}

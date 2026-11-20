import type { GenerationJobRequest, RelayTaskStatus } from '@aiao-media/api-contracts';
import { relayResultKey, relayTaskTokenHash, relayTaskTokenHeader, sealRelayResult } from '@aiao-media/api-contracts';
import { bounded, ProductApiError } from './product-http.ts';
import { removeStoredMediaInput } from './media-input-api.ts';
import { normalizeMediaResponse, type MediaDispatch, type MediaResultKind } from './media-provider.ts';
import {
  BackendRelayCredits,
  type RelayCreditInput,
  type RelayCredits,
  type RelayCreditState
} from './relay-credits.ts';
import type { RelayResultStore, RelayTaskContext, WorkerEnv, WorkerRequest } from './worker-env.ts';

type RelayTaskRow = {
  task_id: string;
  token_hash: string;
  fingerprint: string;
  status: RelayTaskStatus | 'preparing' | 'abandoned' | 'deleted';
  upstream_status: number | null;
  created_at: number;
  updated_at: number;
  owner_id: string | null;
  cost: number | null;
  credit_state: RelayCreditState | 'pending' | null;
  operation: string | null;
  result_kind: MediaResultKind | 'image' | null;
  result_mime: string | null;
  result_manifest: string | null;
  provider_request_id: string | null;
  input_id: string | null;
  input_cleanup: 'pending' | 'complete' | null;
};
type Dispatch = {
  taskId: string;
  ownerId: string;
  cost: number;
  url: string;
  body: unknown;
  protocol: 'openai' | 'minimax' | 'gemini';
  operation?: string;
  resultKind?: MediaResultKind | 'image';
  maxResultBytes?: number;
  maxResultDurationMs?: number;
  request?: GenerationJobRequest;
};

/** 上游超时、看门狗、保留期、结果上限与长轮询上限。 */
export const relayTaskLimits = {
  upstreamMs: 180_000,
  watchdogMs: 210_000,
  retentionMs: 24 * 60 * 60 * 1000,
  creditRetryMs: 30_000,
  resultBytes: 24 * 1024 * 1024,
  mediaAudioBytes: 32 * 1024 * 1024,
  mediaVideoBytes: 64 * 1024 * 1024,
  waitMs: 25_000
};
const definite = [400, 401, 403, 404, 413, 422, 429];
const closed = (row: RelayTaskRow) => row.status === 'abandoned' || row.status === 'deleted';
const running = (row: RelayTaskRow) => row.status === 'preparing' || row.status === 'dispatched';
const digest = async (value: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
const reply = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store', 'referrer-policy': 'no-referrer', 'x-content-type-options': 'nosniff' }
  });
const empty = () => new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });

/** 令牌错误与不存在返回相同结果。 */
export const missingRelayTask = () => reply({ error: 'Task not found' }, 404);

/** 每个对象只发出一次上游请求，持久存储不含提示词、令牌或凭据。 */
export class RelayTask {
  private readonly ctx: RelayTaskContext;
  private readonly env: WorkerEnv & { RELAY_RESULTS: RelayResultStore };
  private readonly request: WorkerRequest;
  private readonly credits: RelayCredits;
  private readonly waiters = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  constructor(
    ctx: RelayTaskContext,
    env: WorkerEnv & { RELAY_RESULTS: RelayResultStore },
    request: WorkerRequest = (url, init) => fetch(url, init),
    credits: RelayCredits = new BackendRelayCredits(env)
  ) {
    this.ctx = ctx;
    this.env = env;
    this.request = request;
    this.credits = credits;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const hash = await relayTaskTokenHash(request.headers.get(relayTaskTokenHeader) ?? '');
    if (request.method === 'PUT') return this.exclusive(() => this.start(request, hash));
    if (url.pathname === '/abandon') return this.exclusive(() => this.abandon(request, hash));
    const row = await this.exclusive(async () => {
      const value = this.row();
      if (!value || value.token_hash !== hash || closed(value)) return null;
      if (Date.now() >= value.created_at + relayTaskLimits.retentionMs) {
        await this.expire(value);
        return null;
      }
      await this.ensureWatchdog(value);
      return value;
    });
    if (!row) return missingRelayTask();
    if (url.pathname === '/' && request.method === 'GET')
      return this.status(row, Number(url.searchParams.get('wait') ?? 0));
    return this.exclusive(async () => {
      const latest = this.row();
      if (!latest || latest.token_hash !== hash || closed(latest)) return missingRelayTask();
      if (request.method === 'DELETE') return this.remove(latest);
      if (url.pathname === '/confirm') return this.confirm(latest);
      if (url.pathname === '/discard') return this.discard(latest);
      if (url.pathname === '/result') return this.result(latest);
      return missingRelayTask();
    });
  }
  async ensureWatchdog(row: RelayTaskRow | null = this.row()) {
    if (!row) return;
    const alarm = await this.ctx.storage.getAlarm?.();
    if (alarm == null) await this.schedule(row);
  }
  alarm() {
    return this.exclusive(async () => {
      let row = this.row();
      if (!row) return;
      if (row.input_cleanup === 'pending' && row.status !== 'dispatched' && row.status !== 'preparing') {
        try {
          await this.cleanupInput(row);
        } catch {
          await this.ctx.storage.setAlarm(Date.now() + relayTaskLimits.creditRetryMs);
          return;
        }
        row = this.row();
        if (!row) return;
      }
      if (Date.now() >= row.created_at + relayTaskLimits.retentionMs) return this.expire(row);
      if (running(row)) {
        const recovered = row.status === 'dispatched' && (await this.env.RELAY_RESULTS.head(row.task_id));
        const next = this.update(recovered ? 'received' : 'needs_review');
        return recovered ? this.schedule(next) : this.releaseAndSchedule(next);
      }
      if (this.needsRelease(row)) return this.releaseAndSchedule(row);
      await this.schedule(row);
    });
  }
  private exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(operation);
    this.queue = next.catch(() => undefined);
    return next;
  }
  private row() {
    this.ctx.storage.sql.exec(
      'CREATE TABLE IF NOT EXISTS relay_task (task_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL, fingerprint TEXT NOT NULL, status TEXT NOT NULL, upstream_status INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, owner_id TEXT, cost INTEGER, credit_state TEXT)'
    );
    const columns = new Set(
      [...this.ctx.storage.sql.exec<{ name: string }>('PRAGMA table_info(relay_task)')].map(column => column.name)
    );
    for (const [name, type] of [
      ['owner_id', 'TEXT'],
      ['cost', 'INTEGER'],
      ['credit_state', 'TEXT'],
      ['operation', 'TEXT'],
      ['result_kind', 'TEXT'],
      ['result_mime', 'TEXT'],
      ['result_manifest', 'TEXT'],
      ['provider_request_id', 'TEXT'],
      ['input_id', 'TEXT'],
      ['input_cleanup', 'TEXT']
    ])
      if (!columns.has(name)) this.ctx.storage.sql.exec(`ALTER TABLE relay_task ADD COLUMN ${name} ${type}`);
    return [...this.ctx.storage.sql.exec<RelayTaskRow>('SELECT * FROM relay_task')][0] ?? null;
  }
  private view(row: RelayTaskRow) {
    const view: Record<string, unknown> = {
      status: row.status === 'preparing' ? 'dispatched' : row.status,
      upstreamStatus: row.upstream_status,
      updatedAt: new Date(row.updated_at).toISOString()
    };
    if (row.operation) {
      view.operation = row.operation;
      view.resultMimeType = row.result_mime;
      view.creditState = row.credit_state;
      if (row.provider_request_id && /^[a-zA-Z0-9_-]{1,128}$/.test(row.provider_request_id))
        view.providerRequestId = row.provider_request_id;
      if (row.result_manifest) view.result = JSON.parse(row.result_manifest);
    }
    return view;
  }
  private insert(taskId: string, hash: string, fingerprint: string, status: RelayTaskRow['status'], input?: Dispatch) {
    const created = Date.now();
    this.ctx.storage.sql.exec(
      'INSERT INTO relay_task (task_id,token_hash,fingerprint,status,created_at,updated_at,owner_id,cost,credit_state,operation,result_kind,result_mime,result_manifest,provider_request_id,input_id,input_cleanup) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      taskId,
      hash,
      fingerprint,
      status,
      created,
      created,
      input?.ownerId ?? null,
      input?.cost ?? null,
      input?.ownerId ? 'pending' : null,
      input?.operation ?? null,
      input?.resultKind ?? null,
      null,
      null,
      null,
      input?.request?.operation === 'speech-to-text' ? input.request.input.id : null,
      input?.request?.operation === 'speech-to-text' ? 'pending' : null
    );
    return this.row()!;
  }
  private update(status: RelayTaskRow['status'], upstreamStatus: number | null = null) {
    this.ctx.storage.sql.exec(
      'UPDATE relay_task SET status=?, upstream_status=?, updated_at=?',
      status,
      upstreamStatus,
      Date.now()
    );
    for (const wake of this.waiters) wake();
    return this.row()!;
  }
  private creditInput(row: RelayTaskRow): RelayCreditInput {
    return {
      taskId: row.task_id,
      ownerId: row.owner_id!,
      cost: row.cost!,
      fingerprint: row.fingerprint,
      tokenHash: row.token_hash
    };
  }
  private recordCredit(state: RelayCreditState) {
    this.ctx.storage.sql.exec('UPDATE relay_task SET credit_state=?, updated_at=?', state, Date.now());
  }
  private async release(row: RelayTaskRow) {
    if (!row.owner_id || row.credit_state === 'charged' || row.credit_state === 'released') return;
    this.recordCredit(await this.credits.release(this.creditInput(row)));
  }
  private needsRelease(row: RelayTaskRow) {
    return (
      !!row.owner_id &&
      !['charged', 'released'].includes(row.credit_state ?? '') &&
      !running(row) &&
      row.status !== 'received' &&
      !(row.status === 'needs_review' && row.operation !== null)
    );
  }
  private async cleanupInput(row: RelayTaskRow): Promise<void> {
    if (!row.input_id || row.input_cleanup === 'complete' || !row.owner_id) return;
    await removeStoredMediaInput(this.env, row.input_id, row.owner_id);
    this.ctx.storage.sql.exec('UPDATE relay_task SET input_cleanup=?, updated_at=?', 'complete', Date.now());
  }
  private async releaseAndSchedule(row: RelayTaskRow) {
    try {
      await this.release(row);
    } finally {
      await this.schedule(this.row()!);
    }
  }
  private schedule(row: RelayTaskRow) {
    const expires = row.created_at + relayTaskLimits.retentionMs;
    const at =
      row.input_cleanup === 'pending' || this.needsRelease(row) ?
        Math.min(Date.now() + relayTaskLimits.creditRetryMs, expires)
      : expires;
    return this.ctx.storage.setAlarm(
      running(row) ? row.created_at + relayTaskLimits.watchdogMs : Math.max(Date.now() + 1, at)
    );
  }
  private async start(request: Request, hash: string) {
    const input = await request.json<Dispatch>();
    const authorization = request.headers.get('authorization');
    if (!authorization) throw new Error('invalid dispatch');
    const fingerprint = await digest(JSON.stringify([input.ownerId, input.cost, input.url, input.body, input.operation, input.resultKind]));
    const existing = this.row();
    if (existing) return this.replay(existing, hash, fingerprint);
    const key = await relayResultKey(request.headers.get(relayTaskTokenHeader)!, input.taskId, 'encrypt');
    const row = this.insert(input.taskId, hash, fingerprint, 'preparing', input);
    await this.schedule(row);
    let receipt: RelayCreditState;
    try {
      receipt = await this.credits.reserve(this.creditInput(row));
    } catch (error) {
      const status =
        error instanceof ProductApiError && [402, 403].includes(error.status) ? 'rejected' : 'needs_review';
      await this.releaseAndSchedule(this.update(status)).catch(() => undefined);
      throw error;
    }
    this.recordCredit(receipt);
    if (receipt !== 'reserved') {
      await this.schedule(this.update('abandoned'));
      return reply({ error: 'Task is closed' }, 409);
    }
    this.update('dispatched');
    const pending = Promise.resolve().then(() => this.dispatch(input, authorization));
    this.ctx.waitUntil(this.finish(pending, key, input.taskId, input, authorization));
    return reply(this.view(this.row()!), 202);
  }
  private async dispatch(input: Dispatch, authorization: string): Promise<Response> {
    if (!['openai', 'minimax', 'gemini'].includes(input.protocol)) throw new Error('invalid dispatch');
    const body = input.body as Record<string, unknown> | null;
    if (body && body['_format'] === 'multipart') {
      const form = new FormData();
      const fields = body['fields'] as Record<string, unknown>;
      const image = body['image'] as { mimeType: string; data: string };
      for (const [name, value] of Object.entries(fields)) {
        if (typeof value !== 'string' && typeof value !== 'number') throw new Error('invalid multipart field');
        form.append(name, String(value));
      }
      const bytes = Uint8Array.from(atob(image.data), char => char.charCodeAt(0));
      form.append(
        'image',
        new Blob([bytes], { type: image.mimeType }),
        image.mimeType === 'image/png' ? 'reference.png' : 'reference.jpg'
      );
      return this.request(input.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(relayTaskLimits.upstreamMs),
        headers: {
          [input.protocol === 'gemini' ? 'x-goog-api-key' : 'authorization']:
            input.protocol === 'gemini' ? authorization.replace(/^Bearer /, '') : authorization
        },
        body: form
      });
    }
    if (body && body['_format'] === 'media-input') {
      const fields = body['fields'];
      const inputReference = body['input'];
      if (!fields || typeof fields !== 'object' || !inputReference || typeof inputReference !== 'object')
        throw new Error('invalid media input');
      const id = (inputReference as { id?: unknown }).id;
      if (typeof id !== 'string') throw new Error('invalid media input');
      const bucket = this.env.MEDIA_INPUTS;
      if (!bucket) throw new Error('media input unavailable');
      const object = await bucket.get(`inputs/${id}`);
      if (!object) throw new Error('media input expired');
      const form = new FormData();
      for (const [name, value] of Object.entries(fields as Record<string, unknown>)) {
        if (typeof value !== 'string' && typeof value !== 'number') throw new Error('invalid media field');
        form.append(name, String(value));
      }
      form.append('file', new Blob([await new Response(object.body).arrayBuffer()], { type: 'audio/wav' }), 'input.wav');
      return this.request(input.url, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(relayTaskLimits.upstreamMs),
        headers: { authorization },
        body: form
      });
    }
    return this.request(input.url, {
      method: 'POST',
      redirect: 'manual',
      signal: AbortSignal.timeout(relayTaskLimits.upstreamMs),
      headers: {
        [input.protocol === 'gemini' ? 'x-goog-api-key' : 'authorization']:
          input.protocol === 'gemini' ? authorization.replace(/^Bearer /, '') : authorization,
        ...(input.protocol === 'gemini' ? { 'api-revision': '2026-05-20' } : {}),
        'content-type': 'application/json'
      },
      body: JSON.stringify(input.body)
    });
  }
  private async replay(row: RelayTaskRow, hash: string, fingerprint: string) {
    if (row.token_hash !== hash) return missingRelayTask();
    if (closed(row)) return reply({ error: 'Task is closed' }, 409);
    if (row.fingerprint !== fingerprint) return reply({ error: 'Task id was used for a different request' }, 409);
    await this.ensureWatchdog(row);
    return reply(this.view(row));
  }
  private async answer(
    pending: Promise<Response>,
    key: CryptoKey,
    taskId: string,
    input: Dispatch,
    authorization: string
  ): Promise<[RelayTaskStatus, number | null]> {
    const response = await pending;
    if (definite.includes(response.status)) {
      await response.body?.cancel();
      return ['rejected', response.status];
    }
    if (input.resultKind && input.resultKind !== 'image') {
      const normalized = await normalizeMediaResponse(response, {
        operation: input.operation as MediaDispatch['operation'],
        url: input.url,
        body: input.body,
        protocol: input.protocol === 'minimax' ? 'minimax' : 'openai',
        authorization,
        cost: input.cost,
        resultKind: input.resultKind as MediaResultKind,
        maxResultBytes: input.maxResultBytes ?? relayTaskLimits.mediaVideoBytes,
        maxResultDurationMs: input.maxResultDurationMs,
        request: input.request!,
        fetchResult: (url, init) => this.request(url, init)
      });
      const sealed = await sealRelayResult(key, normalized.bytes);
      await this.env.RELAY_RESULTS.put(taskId, sealed, { httpMetadata: { contentType: 'application/octet-stream' } });
      this.ctx.storage.sql.exec(
        'UPDATE relay_task SET result_mime=?, result_manifest=?, provider_request_id=?, updated_at=?',
        normalized.mediaType,
        JSON.stringify(normalized.manifest),
        normalized.providerRequestId ?? null,
        Date.now()
      );
      return ['received', response.status];
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) {
      await response.body?.cancel();
      return ['needs_review', response.status];
    }
    const sealed = await sealRelayResult(key, await bounded(response, input.maxResultBytes ?? relayTaskLimits.resultBytes));
    await this.env.RELAY_RESULTS.put(taskId, sealed, { httpMetadata: { contentType: 'application/octet-stream' } });
    this.ctx.storage.sql.exec('UPDATE relay_task SET result_mime=?, updated_at=?', 'application/octet-stream', Date.now());
    return ['received', response.status];
  }
  private async finish(
    pending: Promise<Response>,
    key: CryptoKey,
    taskId: string,
    input: Dispatch,
    authorization: string
  ) {
    const [status, upstreamStatus] = await this.answer(pending, key, taskId, input, authorization).catch((): [RelayTaskStatus, null] => [
      'needs_review',
      null
    ]);
    await this.exclusive(async () => {
      if (this.row()?.status !== 'dispatched') return;
      const row = this.update(status, upstreamStatus);
      try {
        await this.cleanupInput(row);
      } catch {
        await this.ctx.storage.setAlarm(Date.now() + relayTaskLimits.creditRetryMs);
      }
      const latest = this.row()!;
      if (status === 'received' || (status === 'needs_review' && input.resultKind)) await this.schedule(latest);
      else await this.releaseAndSchedule(row);
    });
  }
  private async status(row: RelayTaskRow, seconds: number) {
    if (running(row) && seconds > 0)
      await new Promise<void>(resolve => {
        const wake = () => {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, Math.min(seconds * 1000, relayTaskLimits.waitMs));
        this.waiters.add(wake);
        if (!this.row() || !running(this.row()!)) wake();
      });
    const latest = this.row();
    return latest && latest.token_hash === row.token_hash && !closed(latest) ?
        reply(this.view(latest))
      : missingRelayTask();
  }
  private async result(row: RelayTaskRow) {
    if (row.status !== 'received') return reply({ error: 'Result is not ready' }, 409);
    const object = await this.env.RELAY_RESULTS.get(row.task_id);
    if (!object) return reply({ error: 'Result expired' }, 410);
    return new Response(object.body, {
      headers: {
        'content-type': row.result_mime ?? 'application/octet-stream',
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
        'x-content-type-options': 'nosniff'
      }
    });
  }
  private async confirm(row: RelayTaskRow) {
    if (row.status !== 'received') return reply({ error: 'Result is not ready' }, 409);
    if (row.credit_state === 'released') return reply({ error: 'Task is closed' }, 409);
    if (row.credit_state === 'charged' || !row.owner_id) return empty();
    if (!(await this.env.RELAY_RESULTS.head(row.task_id))) return reply({ error: 'Result expired' }, 410);
    const state = await this.credits.complete(row.task_id);
    this.recordCredit(state);
    if (state !== 'charged') return reply({ error: 'Task is closed' }, 409);
    return empty();
  }
  private async discard(row: RelayTaskRow) {
    if (running(row) || row.credit_state === 'charged') return reply({ error: 'Task cannot be discarded' }, 409);
    await this.releaseAndSchedule(this.update('needs_review', row.upstream_status));
    if (this.row()!.credit_state === 'charged') {
      this.update('received', row.upstream_status);
      return reply({ error: 'Task is already charged' }, 409);
    }
    return empty();
  }
  private async remove(row: RelayTaskRow) {
    if (running(row)) return reply({ error: 'Task is still running' }, 409);
    try {
      await this.cleanupInput(row);
    } catch {
      await this.schedule(row);
      return reply({ error: 'Task cleanup is temporarily unavailable' }, 503);
    }
    await this.releaseAndSchedule(row);
    await this.env.RELAY_RESULTS.delete(row.task_id);
    await this.schedule(this.update('deleted', row.upstream_status));
    return empty();
  }
  private async abandon(request: Request, hash: string) {
    const { taskId } = await request.json<{ taskId: string }>();
    const existing = this.row();
    if (!existing) {
      await this.schedule(this.insert(taskId, hash, '', 'abandoned'));
      return missingRelayTask();
    }
    if (existing.token_hash !== hash || closed(existing)) return missingRelayTask();
    await this.ensureWatchdog(existing);
    return reply(this.view(existing));
  }
  private async expire(row: RelayTaskRow) {
    try {
      await this.cleanupInput(row);
      await this.release(row);
    } catch (error) {
      await this.ctx.storage.setAlarm(Date.now() + relayTaskLimits.creditRetryMs);
      throw error;
    }
    await this.env.RELAY_RESULTS.delete(row.task_id);
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }
}

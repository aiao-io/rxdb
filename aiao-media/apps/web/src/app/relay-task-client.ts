import type { ImageAspectRatio } from '@aiao-media/api-contracts';
import {
  isRelayTaskToken,
  openRelayResult,
  relayResultKey,
  relayTaskTokenHeader,
  type RelayTaskView
} from '@aiao-media/api-contracts';
import { apiEndpoint } from '../platform/local-backend';
import {
  bounded,
  httpFailure,
  prepareImageRequest,
  providerBase,
  ProviderFailure,
  providerImage,
  type LocalProvider
} from './local-provider';

/** Device-only proof of a relay task. Never part of the task journal, backups or sync. */
export interface RelayTicket {
  token: string;
  /** The relay confirmed the task; a reload then waits for it instead of abandoning it. */
  accepted: boolean;
  /** The provider prefix at dispatch, which decides how the stored answer is read. */
  baseUrl: string;
}

/** Everything one dispatch or resumption of a relay task needs. */
export interface RelayRun {
  id: string;
  ticket: RelayTicket;
  ratio: ImageAspectRatio;
  signal: AbortSignal;
  /** Present while this page still holds the Key; null after a reload, which can only abandon or resume. */
  dispatch: { provider: LocalProvider; key: string; prompt: string } | null;
  /** Persists the relay's receipt so that a later reload never abandons an accepted task. */
  accepted(): Promise<void>;
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const backoff = [1000, 2000, 4000, 8000, 15000];
// The stored answer is bounded like a direct one, plus the IV and authentication tag.
const sealedLimit = 24 * 1024 * 1024 + 28;

/** Reads the device's relay tickets. A malformed record is an error, not something to guess around. */
export function relayTickets(payload: string | null): Record<string, RelayTicket> {
  const data: unknown = payload === null ? {} : JSON.parse(payload);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('本机代理任务记录无效。');
  for (const [id, value] of Object.entries(data)) {
    const ticket = value as Partial<RelayTicket> | null;
    if (
      !uuid.test(id) ||
      !ticket ||
      Object.keys(ticket).sort().join() !== 'accepted,baseUrl,token' ||
      !isRelayTaskToken(ticket.token) ||
      typeof ticket.accepted !== 'boolean' ||
      typeof ticket.baseUrl !== 'string' ||
      !/^https:\/\//.test(ticket.baseUrl)
    )
      throw new Error('本机代理任务记录无效。');
  }
  return data as Record<string, RelayTicket>;
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

/**
 * Repeats a task request across network failures and 5xx answers. Safe because the relay keys every task by its id:
 * a repeated creation returns the accepted task instead of generating again. 503 means relay tasks are unavailable.
 */
async function settled(send: () => Promise<Response>, signal: AbortSignal): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const response = await send().catch((error: unknown) => {
      if (signal.aborted) throw error;
      return null;
    });
    if (response && (response.status < 500 || response.status === 503)) return response;
    await response?.body?.cancel();
    await pause(backoff[Math.min(attempt, backoff.length - 1)], signal);
  }
}

function send(
  id: string,
  token: string,
  path: string,
  signal: AbortSignal,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {}
) {
  return fetch(apiEndpoint(`/api/relay/tasks/${id}${path}`), {
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal,
    ...init,
    headers: { [relayTaskTokenHeader]: token, ...init.headers }
  });
}

const uncertain = (message: string) =>
  new ProviderFailure(`${message}请到供应商后台核对用量与结果，系统不会自动重发。`);

async function accept(run: RelayRun, dispatch: NonNullable<RelayRun['dispatch']>): Promise<RelayTaskView> {
  const { base, body } = prepareImageRequest(dispatch.provider, dispatch.key, dispatch.prompt, run.ratio);
  const response = await settled(
    () =>
      send(run.id, run.ticket.token, '', run.signal, {
        method: 'PUT',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${dispatch.key}`,
          'x-provider-base': base
        },
        body: JSON.stringify(body)
      }),
    run.signal
  );
  if (response.ok) return response.json();
  await response.body?.cancel();
  // Only the relay Worker answers task routes with JSON; anything else means this origin has no relay.
  if (response.status === 404 && !response.headers.get('content-type')?.includes('application/json'))
    throw new ProviderFailure(
      '当前页面没有同源代理 /api/relay，请求未发送给供应商。请使用带代理的环境，或在设置中改用浏览器直连。',
      true
    );
  // Every remaining answer was given before the relay sent anything for this request.
  throw httpFailure(response.status, true);
}

async function abandon(run: RelayRun): Promise<RelayTaskView | null> {
  const response = await settled(
    () => send(run.id, run.ticket.token, '/abandon', run.signal, { method: 'POST' }),
    run.signal
  );
  if (response.ok) return response.json();
  await response.body?.cancel();
  if (response.status === 404) return null;
  throw uncertain(`无法核对代理任务（HTTP ${response.status}）。`);
}

async function outcome(run: RelayRun): Promise<RelayTaskView> {
  for (;;) {
    const response = await settled(() => send(run.id, run.ticket.token, '?wait=25', run.signal), run.signal);
    if (!response.ok) {
      await response.body?.cancel();
      throw uncertain(`代理任务已过期或不可读（HTTP ${response.status}）。`);
    }
    const view: RelayTaskView = await response.json();
    if (view.status !== 'dispatched') return view;
  }
}

async function result(run: RelayRun): Promise<Uint8Array<ArrayBuffer>> {
  const response = await settled(() => send(run.id, run.ticket.token, '/result', run.signal), run.signal);
  if (!response.ok) {
    await response.body?.cancel();
    throw uncertain(`代理暂存的结果已过期或已删除（HTTP ${response.status}）。`);
  }
  const sealed = await bounded(response, sealedLimit);
  try {
    return await openRelayResult(await relayResultKey(run.ticket.token, run.id, 'decrypt'), sealed);
  } catch {
    throw uncertain('代理暂存的结果无法解密。');
  }
}

/**
 * Dispatches or resumes one relay task and returns the verified image. Every unknown outcome is a ProviderFailure
 * that keeps the request locked; nothing is generated again.
 */
export async function runRelayTask(run: RelayRun): Promise<Blob> {
  if (!run.ticket.accepted) {
    const receipt = run.dispatch ? await accept(run, run.dispatch) : await abandon(run);
    if (!receipt) throw new ProviderFailure('请求没有送达本站，也没有发给供应商。可以重新生成。', true);
    await run.accepted();
  }
  const view = await outcome(run);
  if (view.status === 'rejected') throw httpFailure(view.upstreamStatus, true);
  if (view.status === 'needs_review') throw uncertain('代理没有拿到确定结果。');
  return providerImage(providerBase(run.ticket.baseUrl), await result(run), run.ratio, run.signal);
}

/** Removes a settled task and its stored result from the relay; rejects when it should be retried later. */
export async function deleteRelayTask(id: string, ticket: RelayTicket, signal: AbortSignal): Promise<void> {
  const response = await settled(() => send(id, ticket.token, '', signal, { method: 'DELETE' }), signal);
  await response.body?.cancel();
  if (!response.ok && response.status !== 404)
    throw new Error(`Relay task removal failed with HTTP ${response.status}`);
}

import type { ImageAspectRatio, ImageResponseProtocol, RelayTaskView } from '@aiao-media/api-contracts';
import {
  isMiniMaxImageProvider,
  isRelayTaskToken,
  openRelayResult,
  relayResultKey,
  relayTaskTokenHeader
} from '@aiao-media/api-contracts';
import { apiEndpoint } from '../platform/local-backend';
import { bounded, ProviderFailure, responseImage } from './local-provider';

/** 设备私有令牌不进入任务、备份或同步；旧地址记录只用于恢复已有任务。 */
export type RelayTicket = { token: string; accepted: boolean } & (
  { protocol: ImageResponseProtocol; baseUrl?: never } | { baseUrl: string; protocol?: never }
);
/** 接单只在当前页面持有平台会话，刷新续接只使用设备令牌。 */
export interface RelayRun {
  id: string;
  ticket: RelayTicket;
  ratio: ImageAspectRatio;
  signal: AbortSignal;
  dispatch: { modelId: string; accessToken: string; prompt: string } | null;
  accepted(): Promise<void>;
}
/** 结果仍可续接，不能将确认故障写成终态或删除服务端原图。 */
export class RelayContinuationFailure extends ProviderFailure {
  readonly resumable = true;
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const backoff = [1000, 2000, 4000, 8000, 15000];
const sealedLimit = 24 * 1024 * 1024 + 28;

/** 严格读取两种设备记录，不凭空修复损坏数据或重新发起生成。 */
export function relayTickets(payload: string | null): Record<string, RelayTicket> {
  const data: unknown = payload === null ? {} : JSON.parse(payload);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('本机平台任务记录无效。');
  for (const [id, value] of Object.entries(data)) {
    const ticket = value as Partial<RelayTicket> | null;
    const keys = ticket ? Object.keys(ticket).sort().join() : '';
    const validProtocol = keys === 'accepted,protocol,token' && ['openai', 'minimax'].includes(ticket?.protocol ?? '');
    const validLegacy =
      keys === 'accepted,baseUrl,token' && typeof ticket?.baseUrl === 'string' && /^https:\/\//.test(ticket.baseUrl);
    if (
      !uuid.test(id) ||
      !ticket ||
      !isRelayTaskToken(ticket.token) ||
      typeof ticket.accepted !== 'boolean' ||
      !(validProtocol || validLegacy)
    )
      throw new Error('本机平台任务记录无效。');
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
    if (signal.aborted) abort();
  });
}
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
const uncertain = (message: string) => new ProviderFailure(`${message}请核对平台任务，系统不会自动重发。`);
const platformFailure = (status: number) =>
  new ProviderFailure(
    status === 401 ? '平台账号会话已失效，请重新登录；本次未扣积分。'
    : status === 402 ? '可用积分不足，请查看当前余额；本次未调用模型。'
    : status === 403 ? '账号、模型或画幅已停用，请联系平台管理员；本次未扣积分。'
    : status === 503 ? '平台生图服务尚未就绪，请稍后重试；本次未扣积分。'
    : `平台拒绝本次接单（HTTP ${status}），请核对参数；本次未扣积分。`,
    true
  );
async function taskView(response: Response): Promise<RelayTaskView> {
  try {
    const value: RelayTaskView = await response.json();
    if (
      !value ||
      !['dispatched', 'received', 'rejected', 'needs_review'].includes(value.status) ||
      !(value.upstreamStatus === null || Number.isInteger(value.upstreamStatus)) ||
      typeof value.updatedAt !== 'string'
    )
      throw new Error();
    return value;
  } catch {
    throw new RelayContinuationFailure('平台任务回执暂不可读，请刷新继续原任务；系统不会重复生成。');
  }
}
async function accept(run: RelayRun, dispatch: NonNullable<RelayRun['dispatch']>): Promise<RelayTaskView> {
  let unconfirmed = false;
  const response = await settled(async () => {
    try {
      const receipt = await send(run.id, run.ticket.token, '', run.signal, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${dispatch.accessToken}` },
        body: JSON.stringify({
          model: dispatch.modelId,
          prompt: dispatch.prompt,
          n: 1,
          size:
            run.ratio === 'landscape' ? '1536x1024'
            : run.ratio === 'portrait' ? '1024x1536'
            : '1024x1024'
        })
      });
      if (receipt.status >= 500 && receipt.status !== 503) unconfirmed = true;
      return receipt;
    } catch (error) {
      unconfirmed = true;
      throw error;
    }
  }, run.signal);
  if (response.ok) return taskView(response);
  await response.body?.cancel();
  if (unconfirmed) {
    const previous = await abandon(run);
    if (previous) return previous;
  }
  throw platformFailure(response.status);
}
async function abandon(run: RelayRun): Promise<RelayTaskView | null> {
  const response = await settled(
    () => send(run.id, run.ticket.token, '/abandon', run.signal, { method: 'POST' }),
    run.signal
  );
  if (response.ok) return taskView(response);
  await response.body?.cancel();
  if (response.status === 404) return null;
  throw new RelayContinuationFailure(`平台暂时无法确认接单状态（HTTP ${response.status}）。请刷新继续原任务。`);
}
async function outcome(run: RelayRun): Promise<RelayTaskView> {
  for (;;) {
    const response = await settled(() => send(run.id, run.ticket.token, '?wait=25', run.signal), run.signal);
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 503) throw new RelayContinuationFailure('平台任务暂不可读，请刷新继续原任务。');
      throw uncertain(`平台任务已过期或不可读（HTTP ${response.status}）。`);
    }
    const view = await taskView(response);
    if (view.status !== 'dispatched') return view;
  }
}
async function result(run: RelayRun): Promise<Uint8Array<ArrayBuffer>> {
  const response = await settled(() => send(run.id, run.ticket.token, '/result', run.signal), run.signal);
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 503) throw new RelayContinuationFailure('图片暂不可读取，请刷新继续原任务。');
    throw uncertain(`暂存结果已过期或不可读（HTTP ${response.status}）。`);
  }
  const sealed = await bounded(response, sealedLimit);
  return openRelayResult(await relayResultKey(run.ticket.token, run.id, 'decrypt'), sealed);
}
async function settlement(run: RelayRun, action: 'confirm' | 'discard') {
  const response = await settled(
    () => send(run.id, run.ticket.token, `/${action}`, run.signal, { method: 'POST' }),
    run.signal
  );
  await response.body?.cancel();
  if (response.ok || (action === 'discard' && response.status === 404)) return;
  if (response.status === 503)
    throw new RelayContinuationFailure('平台结算暂不可确认，原图与任务保留；请刷新续接，系统不会重复扣费。');
  throw uncertain(`平台结算尚未确认（HTTP ${response.status}）。`);
}
/** 只恢复原任务；图片在本机通过验证并确认扣费后，才进入本机保存流程。 */
export async function runRelayTask(run: RelayRun): Promise<Blob> {
  if (!run.ticket.accepted) {
    const receipt = run.dispatch ? await accept(run, run.dispatch) : await abandon(run);
    if (!receipt) throw new ProviderFailure('请求尚未接单，原标识已封存；本次未扣积分，可以重新生成。', true);
    await run.accepted();
  }
  const view = await outcome(run);
  if (view.status === 'rejected') throw new ProviderFailure('平台模型拒绝本次任务，预占积分将释放。', true);
  if (view.status === 'needs_review') throw uncertain('平台没有拿到确定结果，本次不扣积分。');
  let blob: Blob;
  try {
    const protocol = run.ticket.protocol ?? (isMiniMaxImageProvider(run.ticket.baseUrl!) ? 'minimax' : 'openai');
    blob = await responseImage(protocol, await result(run), run.ratio, run.signal);
  } catch (error) {
    if (run.signal.aborted || error instanceof RelayContinuationFailure) throw error;
    await settlement(run, 'discard');
    throw uncertain('返回图片无法通过本机验证，已释放预占积分。');
  }
  await settlement(run, 'confirm');
  return blob;
}
/** 服务端删除成功或已不存在后，才允许移除设备令牌。 */
export async function deleteRelayTask(id: string, ticket: RelayTicket, signal: AbortSignal): Promise<void> {
  const response = await settled(() => send(id, ticket.token, '', signal, { method: 'DELETE' }), signal);
  await response.body?.cancel();
  if (!response.ok && response.status !== 404)
    throw new Error(`Relay task removal failed with HTTP ${response.status}`);
}

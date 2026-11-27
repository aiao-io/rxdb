import { OrbitError } from './errors.js';
import { isRecord } from './payload.js';
import type { OrbitValue } from './types.js';

/*
 * 工作区请求与结果可能远超 Orbit 的 1 MiB 单条消息上限，所以按 UTF-16 码元切成分片逐片传输：
 * 应用先把请求的 JSON 文本分片上传，最后一片触发宿主执行并带回响应的第一片，其余响应分片由应用逐片取回。
 * 本模块只管传输（分片、排队、会话状态、取消时释放），不认识工作区操作本身；执行、时限与错误码的映射在 desktop.ts。
 */

/** 一片最多多少个 UTF-16 码元：一个码元在外层 JSON 里最多编码为 6 字节，给信封和实例 ID 留出空间。 */
export const WORKSPACE_PART = 96 * 1024;
/** 一次逻辑调用的请求或响应（JSON 文本）最多多少个 UTF-16 码元。 */
export const WORKSPACE_MAX = 40 * 1024 * 1024;
const ID_MAX = 64;

/** 传输层的拒绝：`code` 是桌面稳定错误码的名字，由 desktop.ts 原样转成 `DesktopError`（本模块不依赖它，避免循环导入）。 */
export class WorkspaceTransferError extends Error {
  /** 创建带稳定错误码名字的传输错误。 */
  constructor(
    /** 稳定错误码：接收方正忙是 `BUSY`，帧或请求不合法是 `INVALID_ARGUMENT`。 */
    readonly code: 'BUSY' | 'INVALID_ARGUMENT',
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'WorkspaceTransferError';
  }
}

const invalid = (message: string, options?: ErrorOptions) =>
  new WorkspaceTransferError('INVALID_ARGUMENT', message, options);

/**
 * 一次 RPC 在传输里的位置，发送方告诉传输函数：
 * `upload` 是宿主尚未开始执行的上传分片；`execute` 是最后一个上传分片，宿主收到它就开始执行，丢了应答就无从知道执行没有；
 * `fetch` 是取回响应分片，宿主已经执行完，丢了应答只是应用拿不到结果。
 */
export type WorkspacePhase = 'upload' | 'execute' | 'fetch';

/** 发送一个分片并返回宿主的应答值（`null`、或带 `part` 与 `last` 的响应分片）。 */
export type WorkspacePort = (frame: OrbitValue, phase: WorkspacePhase) => Promise<OrbitValue>;

/** 经 `send` 传输一次逻辑调用并返回宿主的结果。 */
export type WorkspaceSender = (value: unknown, send: WorkspacePort) => Promise<OrbitValue>;

/**
 * 接收方执行已收齐的请求。`signal` 在宿主时限到、应用取消或服务解绑时终止，实现必须据此让返回的 Promise 尽快落定
 * （拒绝即可，不必等底层操作真的停下）：接收方在它落定之前一直是「正忙」。
 */
export type WorkspaceExecute = (value: unknown, signal: AbortSignal) => Promise<unknown>;

/** 处理一个分片；`signal` 只在这个分片触发执行时才用到。 */
export type WorkspaceReceiver = (frame: OrbitValue, signal: AbortSignal) => Promise<OrbitValue>;

function encodeRequest(value: unknown): string {
  let text: string | undefined;
  try {
    text = JSON.stringify(value);
  } catch (cause) {
    throw invalid('工作区请求必须是 JSON 值', { cause });
  }
  if (text === undefined) throw invalid('工作区请求必须是 JSON 值');
  if (text.length > WORKSPACE_MAX) throw invalid('工作区请求超过传输上限');
  return text;
}

/** 宿主的结果超限或不是 JSON 值是宿主的程序错误，不冒充任何稳定错误码。 */
function encodeResult(value: unknown): string {
  const text = JSON.stringify(value);
  if (text === undefined) throw new Error('工作区结果必须是 JSON 值');
  if (text.length > WORKSPACE_MAX) throw new Error('工作区结果超过传输上限');
  return text;
}

function protocolError(message: string, options?: ErrorOptions): OrbitError {
  return new OrbitError('INVALID_PAYLOAD', message, options);
}

function readReply(reply: OrbitValue): { part: string; last: boolean } {
  if (!isRecord(reply) || typeof reply['part'] !== 'string' || typeof reply['last'] !== 'boolean')
    throw protocolError('工作区响应分片无效');
  return { part: reply['part'], last: reply['last'] };
}

async function transfer(value: unknown, send: WorkspacePort): Promise<OrbitValue> {
  const text = encodeRequest(value);
  const id = crypto.randomUUID();
  let reply: OrbitValue = null;
  for (let offset = 0; offset < text.length; offset += WORKSPACE_PART) {
    const part = text.slice(offset, offset + WORKSPACE_PART);
    const last = offset + part.length === text.length;
    reply = await send({ id, offset, part, last }, last ? 'execute' : 'upload');
  }
  let result = '';
  for (;;) {
    const next = readReply(reply);
    result += next.part;
    if (result.length > WORKSPACE_MAX || !next.part.length) throw protocolError('工作区响应大小无效');
    if (next.last) return parseResult(result);
    reply = await send({ id, offset: result.length }, 'fetch');
  }
}

function parseResult(text: string): OrbitValue {
  try {
    return JSON.parse(text) as OrbitValue;
  } catch (cause) {
    throw protocolError('工作区响应不是有效的 JSON', { cause });
  }
}

/**
 * 一个连接一个发送队列：同一连接上的所有调用（包括各处各自 `getDesktop` 得到的）串行传输。
 * 宿主的接收方一次只有一份会话，并发的第二个传输会把第一个冲掉，所以串行必须以连接为单位，而不是以调用方为单位。
 * 前一次失败不影响下一次。
 */
export function workspaceSender(): WorkspaceSender {
  let queue: Promise<unknown> = Promise.resolve();
  return (value, send) => {
    const current = queue.then(() => transfer(value, send));
    queue = current.catch(() => undefined);
    return current;
  };
}

/** 一次传输的会话：收集请求，或已执行完、等应用取回响应。 */
interface Session {
  readonly id: string;
  /** 已收到的请求文本。 */
  input: string;
  /** 待取回的响应文本；空表示还在收集请求。 */
  output: string;
  /** 响应已取回到哪里。 */
  cursor: number;
}

/**
 * 每个 Orbit 实例只保留一份有界的传输缓冲，下列情况释放：新的传输从 `offset: 0` 开始（重试）、响应取完、执行失败
 * （含超时与取消）、请求不合法或超限，以及 `lifetime` 终止（服务解绑、实例销毁）。
 * 接收方一次只执行一个请求：执行期间任何分片都是 `BUSY`；执行失败或被取消时立即释放，后续的传输不会被卡住。
 */
export function workspaceReceiver(execute: WorkspaceExecute, lifetime: AbortSignal): WorkspaceReceiver {
  let session: Session | undefined;
  let executing = false;
  lifetime.addEventListener(
    'abort',
    () => {
      session = undefined;
    },
    { once: true }
  );

  const take = (current: Session): OrbitValue => {
    const part = current.output.slice(current.cursor, current.cursor + WORKSPACE_PART);
    current.cursor += part.length;
    const last = current.cursor === current.output.length;
    if (last && session === current) session = undefined;
    return { part, last };
  };

  const run = async (current: Session, signal: AbortSignal): Promise<OrbitValue> => {
    executing = true;
    try {
      let request: unknown;
      try {
        request = JSON.parse(current.input);
      } catch (cause) {
        throw invalid('工作区请求不是有效的 JSON', { cause });
      }
      current.input = '';
      current.output = encodeResult(await execute(request, signal));
      return take(current);
    } catch (error) {
      if (session === current) session = undefined;
      throw error;
    } finally {
      executing = false;
    }
  };

  const upload = (id: string, frame: Record<string, unknown>, signal: AbortSignal): Promise<OrbitValue> | null => {
    const { part, offset, last } = frame;
    if (typeof part !== 'string' || !part.length || part.length > WORKSPACE_PART || typeof last !== 'boolean')
      throw invalid('工作区请求分片无效');
    if (offset === 0) session = { id, input: '', output: '', cursor: 0 };
    const current = session;
    if (!current || current.id !== id || offset !== current.input.length || current.output)
      throw invalid('工作区请求位置无效');
    if (current.input.length + part.length > WORKSPACE_MAX) {
      session = undefined;
      throw invalid('工作区请求超过传输上限');
    }
    current.input += part;
    return last ? run(current, signal) : null;
  };

  return async (frame, signal) => {
    if (!isRecord(frame)) throw invalid('工作区传输分片必须是对象');
    const id = frame['id'];
    if (typeof id !== 'string' || !id || id.length > ID_MAX) throw invalid('工作区传输 ID 无效');
    if (executing) throw new WorkspaceTransferError('BUSY', '工作区操作正在执行，请等它结束再发起新的传输');
    if (frame['part'] !== undefined) return upload(id, frame, signal);
    const current = session;
    if (!current || current.id !== id || !current.output || frame['offset'] !== current.cursor)
      throw invalid('工作区响应位置无效');
    return take(current);
  };
}

/** files 协议：在 P2P 会话上按字节区间读取对端持有的文件。 */
import type { P2PFileManifest } from './chunking.js';
import { isValidChunkRange } from './limits.js';
import { asError, P2PRequestError } from './session/errors.js';
import type { P2PJsonValue } from './session/frame.js';
import type { P2PPeerIdentity } from './session/identity.js';
import type { P2PPeerSession, P2PProtocol } from './session/session.js';
import { createChunkRequestHandler, type P2PChunkRequest, type P2PChunkSource } from './transfer.js';

/** files 协议在 hello 里声明的名字。 */
export const P2P_FILES_PROTOCOL = 'p2p.files' as const;

/** files 协议的版本。 */
export const P2P_FILES_PROTOCOL_VERSION = 1;

/** 本端持有的一个文件。 */
export interface P2PLocalContent {
  /** 本端的清单；块大小可以与请求方不同，取数按请求方的字节区间。 */
  readonly manifest: P2PFileManifest;
  /** 读本地文件的字节区间。 */
  readonly readRange: (offset: number, size: number) => Promise<Uint8Array>;
}

/** 按内容哈希查本端持有的文件；没有时返回 undefined。 */
export type P2PContentLookup = (
  contentHash: string
) => P2PLocalContent | undefined | Promise<P2PLocalContent | undefined>;

/** 逐请求授权的上下文。 */
export interface P2PFilesAuthorizeContext extends P2PChunkRequest {
  /** 已认证的对端身份。 */
  readonly peer: P2PPeerIdentity;
  /** 对端取消这次请求、或会话结束时中止。 */
  readonly signal: AbortSignal;
}

/** files 协议的供块选项；两项都提供时本端才供块。 */
export interface P2PFilesProtocolOptions {
  /** 本端持有的内容表。 */
  readonly contents?: P2PContentLookup;
  /** 在查找、读取本地文件之前校验这次请求；抛错即以 `unauthorized` 拒绝，错误文本原样告诉对端。 */
  readonly authorize?: (context: P2PFilesAuthorizeContext) => void | Promise<void>;
  /** 同时读盘并发送的入站请求数，1～32，缺省 8。 */
  readonly maxConcurrentRequests?: number;
}

const READ_METHOD = 'read';

const rangeOf = (params: P2PJsonValue): P2PChunkRequest => {
  const fields = (typeof params === 'object' && params !== null && !Array.isArray(params) ? params : {}) as Record<
    string,
    unknown
  >;
  const { contentHash, offset, size } = fields;
  if (typeof contentHash !== 'string' || !isValidChunkRange(offset, size))
    throw new P2PRequestError('invalid_request', 'read needs a contentHash and a valid byte range');
  return { contentHash, offset: offset as number, size: size as number };
};

const authorizeOrReject = async (
  authorize: NonNullable<P2PFilesProtocolOptions['authorize']>,
  context: P2PFilesAuthorizeContext
): Promise<void> => {
  try {
    await authorize(context);
  } catch (error) {
    throw new P2PRequestError('unauthorized', asError(error).message, { cause: error });
  }
};

const readContent = async (
  content: P2PLocalContent,
  range: P2PChunkRequest,
  signal: AbortSignal
): Promise<Uint8Array> => {
  if (range.offset + range.size > content.manifest.size)
    throw new P2PRequestError('invalid_request', 'requested range is outside the file');
  return createChunkRequestHandler(content.manifest, content.readRange)(range, signal);
};

/**
 * files 协议：对端按请求方清单的字节区间取块，一条会话上可以拉取任意多个文件。
 *
 * @remarks
 * 先授权、再查内容表：未授权的对端得不到「本端是否持有」的信息。本端没有该内容时以 `not_holder` 拒绝，
 * 会话保留给对端确实持有的其它内容。授权之后、读盘之前再看一次取消信号，已取消的请求不读盘。
 * 不提供 `contents` 或 `authorize` 时本端不供块，只作请求方。
 */
export function createP2PFilesProtocol(options: P2PFilesProtocolOptions = {}): P2PProtocol {
  const { contents, authorize, maxConcurrentRequests } = options;
  return {
    name: P2P_FILES_PROTOCOL,
    version: P2P_FILES_PROTOCOL_VERSION,
    maxConcurrentRequests,
    handle: async ({ method, params, peer, signal }) => {
      if (method !== READ_METHOD) throw new P2PRequestError('unknown_method', `files protocol has no method ${method}`);
      const range = rangeOf(params);
      if (!contents || !authorize)
        throw new P2PRequestError('unauthorized', 'peer authorization is required before serving chunks');
      await authorizeOrReject(authorize, { ...range, peer, signal });
      signal.throwIfAborted();
      const content = await contents(range.contentHash);
      if (!content) throw new P2PRequestError('not_holder', 'peer does not hold requested content');
      return { payload: await readContent(content, range, signal) };
    }
  };
}

/**
 * 把会话适配成 `transferP2PFile` 用的块来源。
 *
 * @param id - 块来源的标识，用于隔离坏 peer 与汇报 `sourcesUsed`，例如对端的持有者 ID
 */
export function createP2PFilesSource(session: P2PPeerSession, id: string): P2PChunkSource {
  return {
    id,
    requestChunk: async ({ contentHash, offset, size }, signal) => {
      const call = { method: READ_METHOD, params: { contentHash, offset, size } };
      return (await session.request(P2P_FILES_PROTOCOL, call, signal)).payload;
    }
  };
}

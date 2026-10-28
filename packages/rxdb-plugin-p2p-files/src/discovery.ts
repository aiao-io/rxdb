import type { P2PFileManifest } from './chunking.js';
import { deriveHolderId, type P2PManifestRecord, P2PManifestStore } from './manifest.js';

/** 服务器信令只转发已认证的 SDP/ICE，不参与字节传输。 */
export interface P2PSignalingChannel {
  readonly send: (message: P2PSignalingMessage) => Promise<void>;
  readonly receive: (signal?: AbortSignal) => Promise<P2PSignalingMessage>;
  readonly close?: () => void | Promise<void>;
}

export type P2PSignalingMessage =
  | { readonly type: 'offer' | 'answer' | 'ice'; readonly connectionId: string; readonly payload: unknown }
  | {
      readonly type: 'reject';
      readonly connectionId: string;
      readonly reason: 'unauthorized' | 'not_holder' | 'expired';
    };

export interface P2PHandshakeRequest {
  readonly connectionId: string;
  readonly contentHash: string;
  readonly holderId: string;
  readonly token: string;
}

export interface P2PHandshakeResult {
  readonly connectionId: string;
  readonly contentHash: string;
  readonly holderId: string;
}

/** 校验握手身份和清单声明；对未认证方只返回通用拒绝，避免泄露清单细节。 */
export const validateHandshake = async (
  request: P2PHandshakeRequest,
  options: {
    readonly authenticate: (token: string) => Promise<{ readonly subject: string } | null>;
    readonly manifests: P2PManifestStore;
    readonly now?: number;
  }
): Promise<P2PHandshakeResult> => {
  const identity = await options.authenticate(request.token);
  if (!identity || deriveHolderId(identity.subject) !== request.holderId) throw new Error('peer is not authorized');
  const record = options.manifests
    .findHolders(request.contentHash, options.now)
    .find(item => item.holderId === request.holderId);
  if (!record) throw new Error('peer does not hold requested content');
  return { connectionId: request.connectionId, contentHash: request.contentHash, holderId: request.holderId };
};

/** mDNS/TCP 运行时可调用的发现接缝；浏览器实现改用 signaling。 */
export interface P2PPeerDiscovery {
  readonly discover: (contentHash: string, signal?: AbortSignal) => AsyncIterable<P2PManifestRecord>;
  readonly connect: (record: P2PManifestRecord, signal?: AbortSignal) => Promise<unknown>;
  readonly close?: () => void | Promise<void>;
}

/** 由本地清单仓库创建离线可用的发现实现。 */
export const createLocalManifestDiscovery = (store: P2PManifestStore): P2PPeerDiscovery => ({
  async *discover(contentHash, signal) {
    signal?.throwIfAborted();
    for (const record of store.findHolders(contentHash)) {
      signal?.throwIfAborted();
      yield record;
    }
  },
  async connect(record) {
    if (!store.findHolders(record.contentHash).some(item => item.holderId === record.holderId)) {
      throw new Error('peer manifest is expired');
    }
    return record;
  }
});

/** 供同步层适配的清单仓库接口。 */
export interface P2PManifestRepository {
  readonly upsert: (record: P2PManifestRecord) => Promise<void> | void;
  readonly revoke: (contentHash: string, holderId: string) => Promise<void> | void;
  readonly findHolders: (
    contentHash: string,
    now?: number
  ) => readonly P2PManifestRecord[] | Promise<readonly P2PManifestRecord[]>;
}

/** 把 manifest 转成同步文档，明确声明它走同步而不是本地 storage。 */
export const toSyncManifestDocument = (record: P2PManifestRecord): Record<string, unknown> => ({
  id: record.id,
  contentHash: record.contentHash,
  fileName: record.fileName,
  size: record.size,
  chunkSize: record.chunkSize,
  chunkHashes: [...record.chunkHashes],
  ...(record.sourceUrl === undefined ? {} : { sourceUrl: record.sourceUrl }),
  holderId: record.holderId,
  updatedAt: record.updatedAt,
  ...(record.expiresAt === undefined ? {} : { expiresAt: record.expiresAt })
});

/**
 * 将 wire 清单映射成 RxDB 实体行。
 *
 * `EntityBase.updatedAt` 是 Date；传输协议里的 updatedAt 是 epoch milliseconds。
 * 两种形状必须显式转换，避免把 number 直接塞进实体的日期字段。
 */
export const toRxDBManifestDocument = (record: P2PManifestRecord): Record<string, unknown> => ({
  ...toSyncManifestDocument(record),
  updatedAt: new Date(record.updatedAt)
});

export type { P2PFileManifest };

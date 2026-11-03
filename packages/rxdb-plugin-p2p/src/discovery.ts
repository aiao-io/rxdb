import type { P2PFileManifest } from './chunking.js';
import type { P2PManifestRecord, P2PManifestStore } from './manifest.js';

/** 服务器信令只转发已认证的 SDP/ICE，不参与字节传输。 */
export interface P2PSignalingChannel {
  /** 发送一条信令消息。 */
  readonly send: (message: P2PSignalingMessage) => Promise<void>;
  /** 接收下一条信令消息。 */
  readonly receive: (signal?: AbortSignal) => Promise<P2PSignalingMessage>;
  /** 关闭信令通道。 */
  readonly close?: () => void | Promise<void>;
}

/** 经服务器专用信令路由转发的消息。 */
export type P2PSignalingMessage =
  | {
      /** SDP offer / answer 或 ICE candidate。 */
      readonly type: 'offer' | 'answer' | 'ice';
      /** 本次连接的标识。 */
      readonly connectionId: string;
      /** WebRTC 协商负载，原样转发。 */
      readonly payload: unknown;
    }
  | {
      /** 拒绝建立连接。 */
      readonly type: 'reject';
      /** 被拒绝的连接标识。 */
      readonly connectionId: string;
      /**
       * 通用拒绝原因，不泄露清单细节。
       *
       * 连接只认身份；对端是否持有某内容在会话建立后逐请求回答（files 协议的 `not_holder`）。
       */
      readonly reason: 'unauthorized' | 'expired';
    };

/** mDNS/TCP 运行时可调用的发现接缝；浏览器实现改用 signaling。 */
export interface P2PPeerDiscovery {
  /** 列出声明持有某内容的 peer；声明不代表对方此刻在线。 */
  readonly discover: (contentHash: string, signal?: AbortSignal) => AsyncIterable<P2PManifestRecord>;
  /** 连接（探测）一个持有者；声明已撤回或对方不可达时拒绝。 */
  readonly connect: (record: P2PManifestRecord, signal?: AbortSignal) => Promise<unknown>;
  /** 释放发现资源。 */
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
      throw new Error('peer no longer holds requested content');
    }
    return record;
  }
});

/** 供同步层适配的清单仓库接口。 */
export interface P2PManifestRepository {
  /** 写入一条持有声明。 */
  readonly upsert: (record: P2PManifestRecord) => Promise<void> | void;
  /** 撤回一条持有声明；`revokedAt` 为持有方时钟上的撤回时刻。 */
  readonly revoke: (contentHash: string, holderId: string, revokedAt?: number) => Promise<void> | void;
  /** 某内容的全部持有声明。 */
  readonly findHolders: (contentHash: string) => readonly P2PManifestRecord[] | Promise<readonly P2PManifestRecord[]>;
}

/** 把持有声明转成同步文档，明确声明它走同步而不是本地 storage。 */
export const toSyncManifestDocument = (record: P2PManifestRecord): Record<string, unknown> => ({
  id: record.id,
  contentHash: record.contentHash,
  fileName: record.fileName,
  size: record.size,
  chunkSize: record.chunkSize,
  chunkHashes: [...record.chunkHashes],
  ...(record.sourceUrl === undefined ? {} : { sourceUrl: record.sourceUrl }),
  holderId: record.holderId,
  updatedAt: record.updatedAt
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

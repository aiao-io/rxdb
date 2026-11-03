/** 包内共用的协议上限；不从包入口导出。 */

import { MAX_P2P_CHUNK_SIZE } from './chunking.js';

/** 发送与接收各自至多缓冲的块数（US-705）：传输并发、流式接收窗口与单连接入站并发共用这一上限。 */
export const MAX_P2P_BUFFERED_CHUNKS = 8;

/** 帧元数据（JSON）的字节上限。 */
export const MAX_FRAME_METADATA = 8 * 1024;

/** 一帧的字节上限：元数据长度头 + 元数据 + 一个最大块。 */
export const MAX_FRAME_SIZE = 4 + MAX_FRAME_METADATA + MAX_P2P_CHUNK_SIZE;

/**
 * WebRTC 单条消息的字节下限（含 1 字节分片头）。
 *
 * @remarks
 * 发送方的非末片总是装满一条消息，所以非末片短于它即违反协议；单帧的分片数因此不超过约一千片，
 * 对端不能用空片或碎片把重组状态撑大。
 */
export const MIN_WEBRTC_MESSAGE_SIZE = 1024;

/** 一条连接上一方至多挂着的未完成请求数；超出视为对端违反协议。 */
export const MAX_OUTSTANDING_REQUESTS = 32;

/** 字节区间是否合法：非负的起点，1 到最大块大小之间的长度。 */
export const isValidChunkRange = (offset: unknown, size: unknown): boolean =>
  Number.isSafeInteger(offset) &&
  (offset as number) >= 0 &&
  Number.isSafeInteger(size) &&
  (size as number) >= 1 &&
  (size as number) <= MAX_P2P_CHUNK_SIZE;

/** files 协议的上限；不从包入口导出。会话层的帧与请求上限见 `session/limits.ts`。 */

import { MAX_P2P_CHUNK_SIZE } from './chunking.js';

/** 发送与接收各自至多缓冲的块数（US-705）：传输并发与流式接收窗口共用这一上限。 */
export const MAX_P2P_BUFFERED_CHUNKS = 8;

/** 字节区间是否合法：非负的起点，1 到最大块大小之间的长度。 */
export const isValidChunkRange = (offset: unknown, size: unknown): boolean =>
  Number.isSafeInteger(offset) &&
  (offset as number) >= 0 &&
  Number.isSafeInteger(size) &&
  (size as number) >= 1 &&
  (size as number) <= MAX_P2P_CHUNK_SIZE;

/** 已落盘块的读写与复核；存储故障一律不可重试。不从包入口导出。 */

import { verifyChunk, type P2PChunkDescriptor } from './chunking.js';
import { P2PTransferError } from './errors.js';

/** 读回块的函数，与传输选项里的 `readChunk` 同形。 */
export type ReadStoredChunk = (index: number) => Promise<Uint8Array>;

const storageFailure = (message: string, cause?: unknown): P2PTransferError =>
  new P2PTransferError(message, { cause, retryable: false });

/** 落盘一个块；写入失败按存储故障抛出。 */
export const persistChunk = async (
  writeChunk: (index: number, bytes: Uint8Array) => Promise<void>,
  index: number,
  bytes: Uint8Array
): Promise<void> => {
  try {
    await writeChunk(index, bytes);
  } catch (error) {
    throw storageFailure(`failed to persist chunk ${index}`, error);
  }
};

/** 读回并复核一个已落盘的块；读不出或与清单不符都按存储故障抛出。 */
export const readVerifiedChunk = async (
  readChunk: ReadStoredChunk,
  descriptor: P2PChunkDescriptor
): Promise<Uint8Array> => {
  let bytes: Uint8Array;
  try {
    bytes = await readChunk(descriptor.index);
  } catch (error) {
    throw storageFailure(`failed to read stored chunk ${descriptor.index}`, error);
  }
  if (!(await verifyChunk(bytes, descriptor))) {
    throw storageFailure(`stored chunk ${descriptor.index} failed verification`);
  }
  return bytes;
};

/** 已落盘的块是否完好；续传前与回退写入前用它判断，读不出等同于没有。 */
export const isStoredChunkValid = async (
  readChunk: ReadStoredChunk,
  descriptor: P2PChunkDescriptor
): Promise<boolean> => {
  try {
    return await verifyChunk(await readChunk(descriptor.index), descriptor);
  } catch {
    return false;
  }
};

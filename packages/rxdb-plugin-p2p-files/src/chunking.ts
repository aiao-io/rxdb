/** P2P 文件清单与分块校验原语。 */

import { createSha256, sha256Hex as syncSha256Hex } from '@aiao/rxdb';

/** 文件清单；清单一旦发布，`chunkSize` 与 `chunkHashes` 不得再改写。 */
export interface P2PFileManifest {
  readonly contentHash: string;
  readonly fileName: string;
  readonly size: number;
  readonly chunkSize: number;
  readonly chunkHashes: readonly string[];
  readonly sourceUrl?: string;
  /** 持有者由认证身份派生；基础分块 API 可暂不设置，发布同步清单时必须存在。 */
  readonly holderId?: string;
  /** 清单最后一次持有声明更新时间。 */
  readonly updatedAt?: number;
}

/** 单个文件块的字节区间。 */
export interface P2PChunkDescriptor {
  readonly index: number;
  readonly offset: number;
  readonly size: number;
  readonly hash: string;
}

/** 默认 48 KiB，为 DataChannel 的 64 KiB 消息上限和可变帧元数据预留空间。 */
export const DEFAULT_P2P_CHUNK_SIZE = 48 * 1024;
export const MAX_P2P_CHUNK_SIZE = 1024 * 1024;

function assertChunkSize(chunkSize: number): void {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_P2P_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_P2P_CHUNK_SIZE}`);
  }
}

function assertFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('file size must be a non-negative safe integer');
}

/** 使用 SHA-256 计算内容寻址哈希。 */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  return syncSha256Hex(bytes);
}

/** 根据清单返回一个块的描述。 */
export function describeChunk(
  manifest: Pick<P2PFileManifest, 'size' | 'chunkSize' | 'chunkHashes'>,
  index: number
): P2PChunkDescriptor {
  assertFileSize(manifest.size);
  assertChunkSize(manifest.chunkSize);
  if (!Number.isSafeInteger(index) || index < 0 || index >= manifest.chunkHashes.length) {
    throw new RangeError(`chunk index out of range: ${index}`);
  }
  const offset = index * manifest.chunkSize;
  return {
    index,
    offset,
    size: Math.min(manifest.chunkSize, manifest.size - offset),
    hash: manifest.chunkHashes[index]
  };
}

/** 枚举清单中的所有块。 */
export function describeChunks(
  manifest: Pick<P2PFileManifest, 'size' | 'chunkSize' | 'chunkHashes'>
): P2PChunkDescriptor[] {
  assertFileSize(manifest.size);
  assertChunkSize(manifest.chunkSize);
  const expectedCount = Math.ceil(manifest.size / manifest.chunkSize);
  if (manifest.chunkHashes.length !== expectedCount)
    throw new RangeError('chunkHashes length does not match file size');
  return manifest.chunkHashes.map((_, index) => describeChunk(manifest, index));
}

/** 校验一个从 peer 收到的块。 */
export async function verifyChunk(
  bytes: Uint8Array,
  descriptor: Pick<P2PChunkDescriptor, 'size' | 'hash'>
): Promise<boolean> {
  return bytes.byteLength === descriptor.size && (await sha256Hex(bytes)) === descriptor.hash;
}

/** 校验完整文件的内容哈希。 */
export async function verifyContentHash(chunks: Iterable<Uint8Array>, expectedHash: string): Promise<boolean> {
  const hash = createSha256();
  for (const chunk of chunks) hash.update(chunk);
  return hash.digestHex() === expectedHash;
}

/** 从可随机读取的字节源构建不可变清单。 */
export async function createP2PFileManifest(options: {
  readonly fileName: string;
  readonly size: number;
  readonly readChunk: (offset: number, size: number) => Promise<Uint8Array>;
  readonly chunkSize?: number;
  readonly sourceUrl?: string;
  readonly holderId?: string;
  readonly updatedAt?: number;
}): Promise<P2PFileManifest> {
  const chunkSize = options.chunkSize ?? DEFAULT_P2P_CHUNK_SIZE;
  assertFileSize(options.size);
  assertChunkSize(chunkSize);
  const chunkHashes: string[] = [];
  const contentHash = createSha256();
  for (let offset = 0; offset < options.size; offset += chunkSize) {
    const expectedSize = Math.min(chunkSize, options.size - offset);
    const bytes = await options.readChunk(offset, expectedSize);
    if (bytes.byteLength !== expectedSize)
      throw new RangeError(`readChunk returned ${bytes.byteLength} bytes, expected ${expectedSize}`);
    contentHash.update(bytes);
    chunkHashes.push(await sha256Hex(bytes));
  }
  return {
    contentHash: contentHash.digestHex(),
    fileName: options.fileName,
    size: options.size,
    chunkSize,
    chunkHashes,
    ...(options.sourceUrl === undefined ? {} : { sourceUrl: options.sourceUrl }),
    ...(options.holderId === undefined ? {} : { holderId: options.holderId }),
    ...(options.updatedAt === undefined ? {} : { updatedAt: options.updatedAt })
  };
}

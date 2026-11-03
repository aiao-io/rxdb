/** P2P 文件清单与分块校验原语。 */

import { createSha256, sha256Hex } from '@aiao/rxdb';
import { MAX_P2P_FRAME_PAYLOAD } from './session/limits.js';

/** 文件清单；清单一旦发布，`chunkSize` 与 `chunkHashes` 不得再改写。 */
export interface P2PFileManifest {
  /** 整个文件的 SHA-256（小写 hex），内容寻址的主键。 */
  readonly contentHash: string;
  /** 展示用文件名；不参与内容校验。 */
  readonly fileName: string;
  /** 文件字节数。 */
  readonly size: number;
  /** 定长块大小（末块可更短）；块划分以请求方清单为准。 */
  readonly chunkSize: number;
  /** 每块的 SHA-256（小写 hex），按块序排列。 */
  readonly chunkHashes: readonly string[];
  /** 服务器回退下载地址。 */
  readonly sourceUrl?: string;
  /** 持有者由认证身份派生；基础分块 API 可暂不设置，发布同步清单时必须存在。 */
  readonly holderId?: string;
  /** 清单最后一次持有声明更新时间。 */
  readonly updatedAt?: number;
}

/** 单个文件块的字节区间。 */
export interface P2PChunkDescriptor {
  /** 块序号，从 0 开始。 */
  readonly index: number;
  /** 块在文件内的起始字节。 */
  readonly offset: number;
  /** 块字节数。 */
  readonly size: number;
  /** 块的 SHA-256（小写 hex）。 */
  readonly hash: string;
}

/** 默认 48 KiB：一块加帧元数据放得进一条 64 KiB 的 DataChannel 消息，不必分片。 */
export const DEFAULT_P2P_CHUNK_SIZE = 48 * 1024;

/** 清单允许的最大块大小，等于会话帧的负载上限；超过 DataChannel 单条消息上限的块由传输层分片发送。 */
export const MAX_P2P_CHUNK_SIZE = MAX_P2P_FRAME_PAYLOAD;

const HEX_BYTE = Array.from({ length: 256 }, (_, byte) => byte.toString(16).padStart(2, '0'));

const subtle: SubtleCrypto | undefined = globalThis.crypto?.subtle;

function assertChunkSize(chunkSize: number): void {
  if (!Number.isSafeInteger(chunkSize) || chunkSize < 1 || chunkSize > MAX_P2P_CHUNK_SIZE) {
    throw new RangeError(`chunkSize must be an integer between 1 and ${MAX_P2P_CHUNK_SIZE}`);
  }
}

function assertFileSize(size: number): void {
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('file size must be a non-negative safe integer');
}

/**
 * 计算一段字节的 SHA-256，返回 64 位小写 hex。
 *
 * @remarks
 * 有 WebCrypto 时走平台原生摘要；局域网里经 http 打开的页面不是安全上下文，没有 `crypto.subtle`，
 * 此时改用 `@aiao/rxdb` 的同步实现，两者结果逐位相同。
 */
export async function digestSha256Hex(bytes: Uint8Array): Promise<string> {
  if (!subtle) return sha256Hex(bytes);
  const input = bytes.buffer instanceof ArrayBuffer ? (bytes as Uint8Array<ArrayBuffer>) : bytes.slice();
  let hex = '';
  for (const byte of new Uint8Array(await subtle.digest('SHA-256', input))) hex += HEX_BYTE[byte];
  return hex;
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

/** 校验一个块的长度与哈希。 */
export async function verifyChunk(
  bytes: Uint8Array,
  descriptor: Pick<P2PChunkDescriptor, 'size' | 'hash'>
): Promise<boolean> {
  return bytes.byteLength === descriptor.size && (await digestSha256Hex(bytes)) === descriptor.hash;
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
    chunkHashes.push(await digestSha256Hex(bytes));
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

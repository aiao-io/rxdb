/**
 * @fileoverview 归档测试共用夹具：内存流、手工拼帧、样例 manifest。
 *
 * @remarks
 * 手工拼帧故意**不**复用生产编码器——篡改、截断、越界这类用例要能造出生产代码永远写不出来的字节，
 * 两边共用一份编码逻辑时，编码器的 bug 会同时出现在「期望」和「实际」里互相抵消。
 */

import type { RxDBBackupManifest } from '../../../backup/backup.interface.js';
import { createSha256 } from '../../../system/sha256.js';

export const MAGIC = Uint8Array.from([0x52, 0x58, 0x44, 0x42, 0x42, 0x41, 0x4b, 0x01]);
export const FRAME_MANIFEST = 0x01;
export const FRAME_ENTRY = 0x02;
export const FRAME_DATA = 0x03;
export const FRAME_TRAILER = 0x7f;

const encoder = new TextEncoder();

export const concatBytes = (parts: readonly Uint8Array[]): Uint8Array => {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

export const frame = (type: number, payload: Uint8Array): Uint8Array => {
  const header = new Uint8Array(5);
  header[0] = type;
  new DataView(header.buffer).setUint32(1, payload.length);
  return concatBytes([header, payload]);
};

export const jsonFrame = (type: number, value: unknown): Uint8Array =>
  frame(type, encoder.encode(JSON.stringify(value)));

export const sha256Of = (bytes: Uint8Array): string => {
  const hash = createSha256();
  hash.update(bytes);
  return hash.digestHex();
};

/**
 * 按声明拼出归档；`trailer` 缺省时按实际内容算出正确的结束标记。
 */
export const buildArchive = (
  body: readonly Uint8Array[],
  trailer?: (computed: { entries: number; bytes: number; sha256: string }) => unknown
): Uint8Array => {
  const prefix = concatBytes([MAGIC, ...body]);
  const computed = { entries: 0, bytes: 0, sha256: sha256Of(prefix) };
  for (const part of body) {
    if (part[0] === FRAME_ENTRY) computed.entries += 1;
    if (part[0] === FRAME_DATA) computed.bytes += part.length - 5;
  }
  return concatBytes([prefix, jsonFrame(FRAME_TRAILER, trailer ? trailer(computed) : computed)]);
};

export const sampleManifest = (overrides: Partial<RxDBBackupManifest> = {}): RxDBBackupManifest => ({
  format: 'rxdb-backup',
  formatVersion: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
  scope: { database: 'included', externalFiles: 'excluded' },
  adapter: {
    name: 'pglite',
    engine: 'postgres',
    engineVersion: '17.5',
    engineCompatibility: 'postgres-17',
    extensions: ['vector'],
    storage: 'memory'
  },
  rxdb: { version: '0.0.25', systemSchemaVersion: 6, changeCodecVersion: 1 },
  schemaFingerprint: 'f'.repeat(64),
  encryption: null,
  ...overrides
});

export const patternBytes = (length: number, seed = 7): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (index * 31 + seed) & 0xff);

/**
 * 以固定大小切片吐出字节的可读流。
 */
export const sourceOf = (bytes: Uint8Array, pieceSize = 4096): ReadableStream<Uint8Array> => {
  let offset = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + pieceSize));
      offset += pieceSize;
    }
  });
};

/**
 * 收集写入内容的可写流；每个 chunk 都记录下来，便于检查分帧上限。
 */
export const collectingSink = () => {
  const chunks: Uint8Array[] = [];
  const stream = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk.slice());
    }
  });
  return { stream, chunks, bytes: () => concatBytes(chunks) };
};

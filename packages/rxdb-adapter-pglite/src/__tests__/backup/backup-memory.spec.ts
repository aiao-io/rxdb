/**
 * US-217 AC#9：快照写出与恢复写入是逐块流水线，在途字节与库大小无关。
 *
 * @remarks
 * 这里测的是结构性上界而不是进程峰值内存：两端的 Emscripten 文件系统换成按位置即时生成字节的假实现，
 * 一个「几十 MB 的数据文件」本身不占内存，于是「从源文件读出」与「写进目标文件」之间的差就是
 * 流水线新增的全部缓冲（归档写入器、流队列、读取器）。如果任何一段先攒齐整个库再往下传，
 * 这个差会随文件大小线性增长。PGlite 空闲时本来就把整个数据目录放在 WASM 堆里，这部分属于
 * 「同规模空闲数据库」的基线，不计入新增。
 */
import {
  RXDB_BACKUP_CHUNK_SIZE,
  RxDBBackupArchiveReader,
  RxDBBackupArchiveWriter,
  type RxDBBackupManifest
} from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  PGLITE_DATA_DIR,
  restoreDataDirEntries,
  writeDataDirSnapshot,
  type EmscriptenFS,
  type EmscriptenStream
} from '../../backup/pglite-data-dir.js';

const DIR_MODE = 0o040000;
const FILE_MODE = 0o100000;

const MANIFEST: RxDBBackupManifest = {
  format: 'rxdb-backup',
  formatVersion: 1,
  createdAt: '2026-09-27T00:00:00.000Z',
  scope: { database: 'included', externalFiles: 'excluded' },
  adapter: {
    name: 'pglite',
    engine: 'postgres',
    engineVersion: '17.5',
    engineCompatibility: 'postgres-17',
    extensions: [],
    storage: 'memory'
  },
  rxdb: { version: '0.0.0', systemSchemaVersion: 1, changeCodecVersion: 1 },
  schemaFingerprint: 'f'.repeat(64),
  encryption: null
};

const byteAt = (position: number): number => (position * 31 + 7) & 0xff;

/** 流水线两端的计数。 */
interface Meter {
  read: number;
  written: number;
  maxLead: number;
  mismatches: number;
}

/** 数据目录里只有 `base/big` 一个大文件，内容按位置即时生成。 */
const virtualSourceFs = (size: number, meter: Meter): EmscriptenFS => {
  const tree: Record<string, string[]> = { [PGLITE_DATA_DIR]: ['base'], [`${PGLITE_DATA_DIR}/base`]: ['big'] };
  const unused = (): never => {
    throw new Error('source FS is read-only');
  };
  return {
    readdir: path => ['.', '..', ...(tree[path] ?? [])],
    lstat: path => (tree[path] ? { mode: DIR_MODE, size: 0 } : { mode: FILE_MODE, size }),
    isDir: mode => mode === DIR_MODE,
    isFile: mode => mode === FILE_MODE,
    analyzePath: () => ({ exists: true }),
    mkdir: unused,
    mkdirTree: unused,
    open: () => ({}),
    read(_stream, buffer, offset, length, position) {
      for (let index = 0; index < length; index++) buffer[offset + index] = byteAt(position + index);
      meter.read += length;
      return length;
    },
    write: unused,
    close: () => undefined
  };
};

/** 目标端只校验、计数，不保留字节。 */
const countingTargetFs = (meter: Meter): EmscriptenFS => {
  let position = 0;
  const unused = (): never => {
    throw new Error('target FS is write-only');
  };
  return {
    readdir: unused,
    lstat: unused,
    isDir: unused,
    isFile: unused,
    analyzePath: () => ({ exists: false }),
    mkdir: () => undefined,
    mkdirTree: () => undefined,
    open: (): EmscriptenStream => {
      position = 0;
      return {};
    },
    read: unused,
    write(_stream, buffer, offset, length) {
      for (let index = 0; index < length; index++) {
        if (buffer[offset + index] !== byteAt(position + index)) meter.mismatches += 1;
      }
      position += length;
      meter.written += length;
      meter.maxLead = Math.max(meter.maxLead, meter.read - meter.written);
      return length;
    },
    close: () => undefined
  };
};

/** 源数据目录 → 归档写入器 → 流 → 归档读取器 → 目标数据目录，全程不落地。 */
const pipe = async (size: number): Promise<Meter> => {
  const meter: Meter = { read: 0, written: 0, maxLead: 0, mismatches: 0 };
  const channel = new TransformStream<Uint8Array, Uint8Array>();
  const produce = (async () => {
    const writer = channel.writable.getWriter();
    const archive = new RxDBBackupArchiveWriter(writer);
    await archive.writeManifest(MANIFEST);
    await writeDataDirSnapshot(virtualSourceFs(size, meter), archive);
    const trailer = await archive.finish();
    await writer.close();
    return trailer;
  })();
  const reader = new RxDBBackupArchiveReader(channel.readable.getReader());
  await reader.readManifest();
  const [trailer, restored] = await Promise.all([produce, restoreDataDirEntries(countingTargetFs(meter), reader)]);
  expect(restored).toEqual(trailer);
  return meter;
};

describe('PGlite backup / restore stream with bounded buffering (AC#9)', () => {
  it('keeps the in-flight bytes constant while the database grows eightfold', async () => {
    const sizes = [4 * 1024 * 1024, 32 * 1024 * 1024];
    const meters: Meter[] = [];
    for (const size of sizes) meters.push(await pipe(size));

    for (const [index, meter] of meters.entries()) {
      expect(meter.read).toBe(sizes[index]);
      expect(meter.written).toBe(sizes[index]);
      expect(meter.mismatches).toBe(0);
      // 源端复用一块读缓冲，写入器把它拷成一帧交给流，读取器凑齐一帧就交出：在途最多两块。
      expect(meter.maxLead).toBeLessThanOrEqual(2 * RXDB_BACKUP_CHUNK_SIZE);
    }
    expect(meters[1].maxLead).toBe(meters[0].maxLead);
  }, 120_000);
});

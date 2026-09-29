/**
 * US-217 AC#9 的测量工具：与存储后端无关，SQLite 桌面 host 与 Electron PGlite host 共用。
 *
 * @remarks
 * 只在 Node 测试进程里可用：采样靠 `process.memoryUsage()` 与强制 GC，归档经临时文件进出。
 * 取 Node 模块一律走 `process.getBuiltinModule`，不写静态导入——`testing.ts` 会把本文件一并打进浏览器用例。
 */
import { expect } from 'vitest';
import type {
  BackupMemoryBudget,
  BackupMemoryMeasurement,
  BackupMemoryTools,
  BackupRendererMeter
} from '../../testing.js';

const MIB = 1024 * 1024;

/** 每隔这么多块采样一次：每次采样都要一次完整 GC。 */
const SAMPLE_EVERY = 16;

/** 恢复读归档的块大小，与备份写出的帧大小同一量级。 */
const READ_CHUNK_BYTES = 64 * 1024;

/**
 * 两档之间允许的增量增长占库增长的比例上限。
 *
 * @remarks
 * 把整份归档攒成 Blob / ArrayBuffer 再包成流的实现，大档比小档至少多占一整份归档增量（≈ 库增量），比例 ≥ 1。
 */
const MAX_GROWTH_RATIO = 0.5;

/** 测试进程是 Node：用例只在桌面后端上跑，这里取不到就说明被错接进了浏览器。 */
const nodeProcess = (): NodeJS.Process => {
  if (typeof process === 'undefined') throw new Error('the backup memory tools run in Node only');
  return process;
};

/** 强制一次完整 GC；Node 默认不暴露 `gc`，按需打开这个开关。 */
const collectGarbage = (): void => {
  const node = nodeProcess();
  node.getBuiltinModule('node:v8').setFlagsFromString('--expose_gc');
  const gc = node.getBuiltinModule('node:vm').runInNewContext('gc') as () => void;
  gc();
};

/** GC 之后仍然存活的内存：JS 堆加上堆外的 ArrayBuffer 等外部内存。 */
const liveBytes = (): number => {
  collectGarbage();
  const usage = nodeProcess().memoryUsage();
  return usage.heapUsed + usage.external;
};

const rendererMeter = (): BackupRendererMeter => {
  const baseline = liveBytes();
  let peak = baseline;
  let calls = 0;
  return {
    sample: () => {
      calls += 1;
      if (calls % SAMPLE_EVERY === 0) peak = Math.max(peak, liveBytes());
    },
    delta: () => Math.max(peak, liveBytes()) - baseline
  };
};

const noise = (size: number, seed: number): Uint8Array => {
  const bytes = new Uint8Array(size);
  let state = seed | 1;
  for (let index = 0; index < size; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[index] = state & 0xff;
  }
  return bytes;
};

const withArchiveFile = async <T>(run: (path: string) => Promise<T>): Promise<T> => {
  const node = nodeProcess();
  const { join } = node.getBuiltinModule('node:path');
  const { mkdtempSync, rmSync } = node.getBuiltinModule('node:fs');
  const directory = mkdtempSync(join(node.getBuiltinModule('node:os').tmpdir(), 'rxdb-backup-memory-'));
  try {
    return await run(join(directory, 'archive.rxdb'));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
};

const backupToFile = async (
  backup: (sink: WritableStream<Uint8Array>) => Promise<unknown>,
  path: string,
  meter: BackupRendererMeter
): Promise<void> => {
  const handle = await nodeProcess().getBuiltinModule('node:fs/promises').open(path, 'w');
  try {
    await backup(
      new WritableStream<Uint8Array>({
        async write(chunk) {
          meter.sample();
          await handle.write(chunk);
        }
      })
    );
  } finally {
    await handle.close();
  }
};

const fileSource = (path: string, meter: BackupRendererMeter): ReadableStream<Uint8Array> => {
  const opening = nodeProcess().getBuiltinModule('node:fs/promises').open(path, 'r');
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      meter.sample();
      const handle = await opening;
      const { bytesRead, buffer } = await handle.read(new Uint8Array(READ_CHUNK_BYTES), 0, READ_CHUNK_BYTES, null);
      if (bytesRead === 0) {
        await handle.close();
        controller.close();
        return;
      }
      controller.enqueue(buffer.subarray(0, bytesRead));
    },
    async cancel() {
      await (await opening).close();
    }
  });
};

const expectBounded = (
  small: BackupMemoryMeasurement,
  large: BackupMemoryMeasurement,
  budget: BackupMemoryBudget
): void => {
  const grown = large.databaseBytes - small.databaseBytes;
  const [smallMib, largeMib] = backupMemoryTools.sizesMib;
  expect(grown).toBeGreaterThan((largeMib - smallMib) * MIB);
  for (const { backup, restore } of [small, large]) {
    expect(backup.host).toBeLessThan(budget.hostBackup);
    expect(restore.host).toBeLessThan(budget.hostRestore);
    expect(Math.max(backup.renderer, restore.renderer)).toBeLessThan(budget.renderer);
  }
  for (const side of ['host', 'renderer'] as const) {
    expect(large.backup[side] - small.backup[side]).toBeLessThan(grown * MAX_GROWTH_RATIO);
    expect(large.restore[side] - small.restore[side]).toBeLessThan(grown * MAX_GROWTH_RATIO);
  }
};

/** 见 `testing.ts` 的 {@link BackupMemoryTools}。 */
export const backupMemoryTools: BackupMemoryTools = {
  payloadBytes: 256 * 1024,
  sizesMib: [24, 96],
  noise,
  rendererMeter,
  withArchiveFile,
  backupToFile,
  fileSource,
  expectBounded
};

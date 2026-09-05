// @vitest-environment node
import { type DesktopHostTransport } from '@aiao/rxdb-adapter-electron';
import { createElectronFileHost, type ElectronFileHost } from '@aiao/rxdb-adapter-electron/host';
import type { DevToolsNativeFilesystem } from '@aiao/rxdb-devtools';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDevToolsDesktopFilesystem, type DevToolsDesktopFilesystem } from '../devtools-desktop-filesystem.js';
import { createDevToolsStorageSnapshotPorts, type DevToolsStorageSnapshotHost } from '../devtools-desktop-snapshot.js';
import type { StorageFileMeta } from '../file-meta.entity.js';
import { PathLockManager } from '../path-lock.js';

let workspace: string;
let host: ElectronFileHost;
let filesystem: DevToolsDesktopFilesystem;

const createDirectTransport = (target: ElectronFileHost): DesktopHostTransport => ({
  request: payload => target.handle(payload),
  subscribe: () => () => undefined
});

/** 造一个只带快照端口会读的三个成员的 storage mock。 */
const mockStorage = (overrides: Partial<DevToolsStorageSnapshotHost> = {}): DevToolsStorageSnapshotHost => ({
  changeEpoch: 0,
  listAllMetas: async () => [],
  runExclusive: async fn => fn(),
  ...overrides
});

/** 造一条 metadata 行（只带快照会用到的字段）。 */
const meta = (opfsPath: string, id: string, size: number, contentVersion: number): StorageFileMeta =>
  ({ opfsPath, id, size, contentVersion }) as unknown as StorageFileMeta;

const bytes = (content: string): Uint8Array => new TextEncoder().encode(content);

async function write(
  filesystem: DevToolsNativeFilesystem,
  segments: readonly string[],
  content: string
): Promise<void> {
  const sink = await filesystem.openWrite(segments);
  await sink.write(bytes(content));
  await sink.commit();
}

beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), 'rxdb-devtools-snap-'));
  host = createElectronFileHost({ resolveStorageRoot: () => join(workspace, 'rxdb-files') });
  filesystem = createDevToolsDesktopFilesystem({ rootDir: 'files', transport: createDirectTransport(host) });
});

afterEach(async () => {
  filesystem.dispose();
  await rm(workspace, { recursive: true, force: true });
});

describe('createDevToolsStorageSnapshotPorts — 已提交文件', () => {
  it('递归枚举全部文件，目录不产出条目', async () => {
    await write(filesystem, ['top.txt'], 'top');
    await write(filesystem, ['db', 'main.sqlite'], 'main');
    await write(filesystem, ['db', 'backups', 'a.sqlite'], 'a');

    const ports = createDevToolsStorageSnapshotPorts({ storage: mockStorage(), filesystem });
    const files = await ports.readCommittedFiles(new AbortController().signal);

    expect(files.map(entry => entry.logicalPath).sort()).toEqual(['db/backups/a.sqlite', 'db/main.sqlite', 'top.txt']);
    expect(files.find(entry => entry.logicalPath === 'top.txt')).toMatchObject({
      id: null,
      size: 3,
      contentVersion: null
    });
  });

  it('signal 已中止时不触碰文件系统', async () => {
    const ports = createDevToolsStorageSnapshotPorts({ storage: mockStorage(), filesystem });
    const controller = new AbortController();
    controller.abort();

    await expect(ports.readCommittedFiles(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('createDevToolsStorageSnapshotPorts — metadata 与 epoch', () => {
  it('把 metadata 行映射成带 id / size / contentVersion 的条目', async () => {
    const ports = createDevToolsStorageSnapshotPorts({
      storage: mockStorage({
        listAllMetas: async () => [meta('db/main.sqlite', 'm-1', 11, 3)]
      }),
      filesystem
    });

    await expect(ports.readMetadata(new AbortController().signal)).resolves.toEqual([
      { logicalPath: 'db/main.sqlite', id: 'm-1', size: 11, contentVersion: '3' }
    ]);
  });

  it('signal 已中止时不读取 metadata', async () => {
    const ports = createDevToolsStorageSnapshotPorts({ storage: mockStorage(), filesystem });
    const controller = new AbortController();
    controller.abort();

    await expect(ports.readMetadata(controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('epoch 返回 storage 捕获纪元的字符串', async () => {
    const ports = createDevToolsStorageSnapshotPorts({ storage: mockStorage({ changeEpoch: 7 }), filesystem });

    await expect(ports.epoch()).resolves.toBe('7');
  });
});

describe('createDevToolsStorageSnapshotPorts — 独占锁', () => {
  it('在独占锁内执行任务并返回 held', async () => {
    let ran = false;
    const ports = createDevToolsStorageSnapshotPorts({
      storage: mockStorage({
        runExclusive: async fn => {
          ran = true;
          return fn();
        }
      }),
      filesystem
    });

    await expect(ports.lock.run(new AbortController().signal, async () => 42)).resolves.toEqual({
      outcome: 'held',
      value: 42
    });
    expect(ran).toBe(true);
  });

  it('signal 已中止时返回 aborted，不执行任务', async () => {
    let ran = false;
    const ports = createDevToolsStorageSnapshotPorts({
      storage: mockStorage({
        runExclusive: async fn => {
          ran = true;
          return fn();
        }
      }),
      filesystem
    });
    const controller = new AbortController();
    controller.abort();

    await expect(ports.lock.run(controller.signal, async () => 'never')).resolves.toEqual({ outcome: 'aborted' });
    expect(ran).toBe(false);
  });

  it('任务中途 signal 中止时返回 aborted', async () => {
    const controller = new AbortController();
    const ports = createDevToolsStorageSnapshotPorts({
      storage: mockStorage({
        runExclusive: async fn => {
          controller.abort();
          return fn();
        }
      }),
      filesystem
    });

    await expect(ports.lock.run(controller.signal, async () => 'never')).resolves.toEqual({ outcome: 'aborted' });
  });

  // 契约：等锁必须响应 signal。真实 `PathLockManager` 做持锁者，快照 waiter 排在后面被 abort。
  it('等锁期间 signal 中止：立刻返回 aborted，任务永不执行', async () => {
    const locks = new PathLockManager();
    const controller = new AbortController();
    let ran = false;
    let releaseHolder!: () => void;
    const holder = locks.withPaths(
      ['busy.txt'],
      () =>
        new Promise<void>(resolve => {
          releaseHolder = resolve;
        })
    );
    const ports = createDevToolsStorageSnapshotPorts({
      storage: mockStorage({ runExclusive: (fn, signal) => locks.withExclusive(fn, signal) }),
      filesystem
    });

    const waiting = ports.lock.run(controller.signal, async () => {
      ran = true;
      return 'never';
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    controller.abort();

    await expect(waiting).resolves.toEqual({ outcome: 'aborted' });
    releaseHolder();
    await holder;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(ran).toBe(false);
  });

  it('未中止的等待者在持锁者释放后照常执行', async () => {
    const locks = new PathLockManager();
    const log: string[] = [];
    let releaseHolder!: () => void;
    const holder = locks.withPaths(['busy.txt'], async () => {
      log.push('holder:start');
      await new Promise<void>(resolve => {
        releaseHolder = resolve;
      });
      log.push('holder:end');
    });
    const ports = createDevToolsStorageSnapshotPorts({
      storage: mockStorage({ runExclusive: (fn, signal) => locks.withExclusive(fn, signal) }),
      filesystem
    });

    const waiting = ports.lock.run(new AbortController().signal, async () => {
      log.push('snapshot');
      return 1;
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(log).toEqual(['holder:start']);

    releaseHolder();
    await expect(waiting).resolves.toEqual({ outcome: 'held', value: 1 });
    await holder;
    expect(log).toEqual(['holder:start', 'holder:end', 'snapshot']);
  });
});

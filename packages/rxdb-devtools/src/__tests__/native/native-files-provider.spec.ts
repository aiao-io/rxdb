import { describe, expect, it } from 'vitest';

import { createDevToolsNativeFilesProvider } from '../../native/native-files-provider.js';
import type { DevToolsProviderRuntime } from '../../provider/descriptor.js';
import { DEVTOOLS_MAX_INFLIGHT_REQUESTS } from '../../v2/constants.js';
import { createFakeNativeFilesystem, expectedBytes, type FakeNativeFilesystem } from './fake-native-filesystem.js';

const MAX_TRANSFER_BYTES = 64;

function setup(seed?: (filesystem: FakeNativeFilesystem) => void, runtime: DevToolsProviderRuntime = 'electron') {
  const filesystem = createFakeNativeFilesystem();
  seed?.(filesystem);
  const provider = createDevToolsNativeFilesProvider({ filesystem, maxTransferBytes: MAX_TRANSFER_BYTES, runtime });
  return { filesystem, provider };
}

function codeOf(result: { outcome: string; error?: { code: string } }): string {
  return result.outcome === 'failed' ? (result.error?.code ?? '') : 'ok';
}

/** 逐字节读空一个字节源，用来断言「下载的字节与源一致」。 */
async function drain(source: { totalBytes: number; read(offset: number, length: number): Promise<Uint8Array> }) {
  const out = new Uint8Array(source.totalBytes);
  let offset = 0;
  while (offset < source.totalBytes) {
    const chunk = await source.read(offset, Math.min(16, source.totalBytes - offset));
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

describe('native files provider — descriptor', () => {
  it('MUST declare the electron native-files kind with the protocol operation order', () => {
    const { provider } = setup();

    expect(provider.descriptor).toEqual({
      domain: 'files',
      version: 1,
      kind: 'native-files',
      operations: ['list', 'download', 'upload', 'create-directory', 'delete'],
      runtime: 'electron',
      limits: { maxTransferBytes: MAX_TRANSFER_BYTES }
    });
  });

  it('MUST report the host transfer limit verbatim instead of a shared constant', () => {
    const filesystem = createFakeNativeFilesystem();
    const provider = createDevToolsNativeFilesProvider({ filesystem, maxTransferBytes: 7, runtime: 'electron' });

    // 谎报上限意味着面板按一个上限校验、host 按另一个上限拒收，而拒收发生在字节已经上路之后。
    expect(provider.descriptor.limits.maxTransferBytes).toBe(7);
  });

  it('MUST pass the caller runtime through without letting it fork behaviour (US-905 AC#10)', () => {
    const { provider: electron } = setup(undefined, 'electron');
    const { provider: tauri } = setup(undefined, 'tauri');

    // `kind: 'native-files'` 是宿主**无关**的：Electron 与 Tauri 用同一个 kind、同一套操作与限额。
    // runtime 只是显示来源，写死在 provider 里会让接了原生后端的宿主永远自称 electron。
    expect(tauri.descriptor.runtime).toBe('tauri');
    expect(electron.descriptor.runtime).toBe('electron');
    expect({ ...tauri.descriptor, runtime: 'electron' }).toEqual(electron.descriptor);
  });
});

describe('native files provider — list', () => {
  it('MUST return only the direct children, not the subtree', async () => {
    const { provider } = setup(filesystem => {
      filesystem.seedFile(['db', 'main.sqlite'], 4);
      filesystem.seedFile(['db', 'backups', 'a.sqlite'], 4);
      filesystem.seedDirectory(['db', 'backups']);
    });

    const result = await provider.invoke('list', { path: 'db' });

    // `backups` 出现，`backups/a.sqlite` 不出现——一层就是一层。
    expect(result).toEqual({
      outcome: 'ok',
      result: {
        path: 'db',
        entries: [
          { name: 'backups', kind: 'directory', size: 0, lastModified: 1, path: 'db/backups' },
          { name: 'main.sqlite', kind: 'file', size: 4, lastModified: 1, path: 'db/main.sqlite' }
        ]
      }
    });
  });

  it('MUST list the plugin root for the empty path', async () => {
    const { provider } = setup(filesystem => {
      filesystem.seedFile(['top.sqlite'], 1);
    });

    const result = await provider.invoke('list', { path: '' });

    expect(result).toEqual({
      outcome: 'ok',
      result: {
        path: '',
        entries: [{ name: 'top.sqlite', kind: 'file', size: 1, lastModified: 1, path: 'top.sqlite' }]
      }
    });
  });

  it('MUST map a missing directory onto the shared not-found code', async () => {
    const { provider } = setup();

    expect(codeOf(await provider.invoke('list', { path: 'nope' }))).toBe('resource_not_found');
  });
});

describe('native files provider — path validation', () => {
  const ESCAPES = ['..', '../etc/passwd', 'a/../../b', 'a\\..\\b', 'C:\\Windows'] as const;
  const OPERATIONS = ['list', 'download', 'upload', 'create-directory', 'delete'] as const;

  it('MUST reject escape paths before the filesystem is touched at all', async () => {
    for (const operation of OPERATIONS) {
      for (const path of ESCAPES) {
        const { filesystem, provider } = setup();
        const params = { path, requestId: 'r-1', transferId: 't-1', name: 'x', size: 0 };

        expect(codeOf(await provider.invoke(operation, params)), `${operation} ${path}`).toBe('invalid_path');
        // 「拒了」还不够：拒绝必须发生在**碰 host 之前**，否则一次逃逸尝试仍然打开了句柄。
        expect(filesystem.opened, `${operation} ${path}`).toEqual({ read: 0, write: 0 });
      }
    }
  });

  it('MUST reject an upload whose name is itself a path', async () => {
    const { provider } = setup();

    const result = await provider.invoke('upload', { path: 'db', name: 'a/b', size: 1, transferId: 't-1' });

    expect(codeOf(result)).toBe('invalid_path');
  });

  it('MUST refuse the root as a mutation target', async () => {
    const { provider } = setup();

    // 根已经存在且不可删；把它当目标是这三个操作的非法输入，不是一次「对根的操作」。
    expect(codeOf(await provider.invoke('create-directory', { path: '' }))).toBe('invalid_path');
    expect(codeOf(await provider.invoke('delete', { path: '/' }))).toBe('invalid_path');
    expect(codeOf(await provider.invoke('download', { path: '', requestId: 'r-1' }))).toBe('invalid_path');
  });

  it('MUST reject an unknown operation with the shared unsupported code', async () => {
    const { provider } = setup();

    expect(codeOf(await provider.invoke('rename', { path: 'a' }))).toBe('provider_unsupported');
    // 原型链上的键不是操作：`toString` 命中的话，一次探测就能拿到一个可调用的东西。
    expect(codeOf(await provider.invoke('toString', {}))).toBe('provider_unsupported');
  });
});

describe('native files provider — download', () => {
  it('MUST stream the exact bytes of the requested file', async () => {
    const { provider } = setup(filesystem => {
      filesystem.seedFile(['db', 'main.sqlite'], 40);
    });

    const response = await provider.invoke('download', { path: 'db/main.sqlite', requestId: 'r-1' });
    const source = provider.createChunkSource('r-1');

    expect(response).toEqual({ outcome: 'ok', result: { path: 'db/main.sqlite', name: 'main.sqlite', size: 40 } });
    expect(source?.totalBytes).toBe(40);
    expect(source === undefined ? undefined : await drain(source)).toEqual(expectedBytes(40));
  });

  it('MUST expose totalBytes before any handle is opened', async () => {
    const { filesystem, provider } = setup(f => {
      f.seedFile(['big.bin'], MAX_TRANSFER_BYTES);
    });

    await provider.invoke('download', { path: 'big.bin', requestId: 'r-1' });
    const source = provider.createChunkSource('r-1');

    // 端点在发 TRANSFER_START 之前就读 `totalBytes`，那时读句柄还没开。两个数必须同源。
    expect(source?.totalBytes).toBe(MAX_TRANSFER_BYTES);
    expect(filesystem.opened.read).toBe(0);
  });

  it('MUST open no handle when the stream never starts', async () => {
    const { filesystem, provider } = setup(f => {
      f.seedFile(['a.bin'], 8);
    });

    await provider.invoke('download', { path: 'a.bin', requestId: 'r-1' });
    const source = provider.createChunkSource('r-1');
    await source?.close();

    // 请求被拒、session 断掉、面板改主意，都会让流永远开不起来；那时 host 不该留着一个读者。
    expect(filesystem.opened.read).toBe(0);
  });

  it('MUST serve a zero-byte file without opening a handle', async () => {
    const { filesystem, provider } = setup(f => {
      f.seedFile(['empty.bin'], 0);
    });

    await provider.invoke('download', { path: 'empty.bin', requestId: 'r-1' });
    const source = provider.createChunkSource('r-1');

    expect(source?.totalBytes).toBe(0);
    expect(filesystem.opened.read).toBe(0);
  });

  it('MUST refuse a file above the declared limit without opening it', async () => {
    const { filesystem, provider } = setup(f => {
      f.seedFile(['big.bin'], MAX_TRANSFER_BYTES + 1);
    });

    const result = await provider.invoke('download', { path: 'big.bin', requestId: 'r-1' });

    expect(codeOf(result)).toBe('transfer_size_exceeded');
    expect(provider.createChunkSource('r-1')).toBeUndefined();
    expect(filesystem.opened.read).toBe(0);
  });

  it('MUST refuse to download a directory', async () => {
    const { provider } = setup(f => {
      f.seedDirectory(['db']);
    });

    expect(codeOf(await provider.invoke('download', { path: 'db', requestId: 'r-1' }))).toBe('resource_not_found');
  });

  it('MUST hand out a registered source at most once', async () => {
    const { provider } = setup(f => {
      f.seedFile(['a.bin'], 4);
    });

    await provider.invoke('download', { path: 'a.bin', requestId: 'r-1' });

    expect(provider.createChunkSource('r-1')).toBeDefined();
    // 第二次是「源侧已交付」，不是第二条流：同一个 requestId 上开两条流会让面板收到两份字节。
    expect(provider.createChunkSource('r-1')).toBeUndefined();
  });

  it('MUST report no source for a requestId that never asked for a download', () => {
    const { provider } = setup();

    expect(provider.createChunkSource('r-unknown')).toBeUndefined();
  });

  it('MUST NOT accumulate registrations for downloads whose request never settled', async () => {
    const { provider } = setup(f => {
      f.seedFile(['a.bin'], 4);
    });

    // 请求超时那条路上 `createChunkSource` 永远不会来，provider 也收不到任何通知。
    for (let index = 0; index <= DEVTOOLS_MAX_INFLIGHT_REQUESTS; index += 1) {
      await provider.invoke('download', { path: 'a.bin', requestId: `r-${index}` });
    }

    expect(provider.createChunkSource('r-0')).toBeUndefined();
    expect(provider.createChunkSource(`r-${DEVTOOLS_MAX_INFLIGHT_REQUESTS}`)).toBeDefined();
  });
});

describe('native files provider — upload', () => {
  it('MUST commit the exact bytes to the declared path', async () => {
    const { filesystem, provider } = setup();

    const response = await provider.invoke('upload', { path: 'db', name: 'in.bin', size: 6, transferId: 't-1' });
    const sink = provider.createChunkSink('t-1');
    await sink.write(expectedBytes(6));
    await sink.commit();

    expect(response).toEqual({ outcome: 'ok', result: { path: 'db/in.bin', transferId: 't-1' } });
    expect(filesystem.contentOf(['db', 'in.bin'])).toEqual(expectedBytes(6));
  });

  it('MUST create a zero-byte file when a legal empty upload commits', async () => {
    const { filesystem, provider } = setup();

    await provider.invoke('upload', { path: '', name: 'empty.bin', size: 0, transferId: 't-1' });
    await provider.createChunkSink('t-1').commit();

    // 不开句柄就什么都不会创建，而「上传了一个空文件」和「什么都没上传」必须可区分。
    expect(filesystem.contentOf(['empty.bin'])).toEqual(new Uint8Array(0));
  });

  it('MUST accept exactly the declared limit and refuse one byte more', async () => {
    const { provider } = setup();

    const atLimit = { path: '', name: 'a.bin', size: MAX_TRANSFER_BYTES, transferId: 't-1' };
    const overLimit = { path: '', name: 'b.bin', size: MAX_TRANSFER_BYTES + 1, transferId: 't-2' };

    expect(codeOf(await provider.invoke('upload', atLimit))).toBe('ok');
    expect(codeOf(await provider.invoke('upload', overLimit))).toBe('transfer_size_exceeded');
  });

  it('MUST leave no visible file and no temporary behind when a transfer is discarded', async () => {
    const { filesystem, provider } = setup();

    await provider.invoke('upload', { path: 'db', name: 'in.bin', size: 6, transferId: 't-1' });
    const sink = provider.createChunkSink('t-1');
    await sink.write(expectedBytes(3));
    await sink.discard();

    // AC#47 的「失败/取消/超时无半写文件或孤儿 metadata」就是这两条断言。
    expect(filesystem.contentOf(['db', 'in.bin'])).toBeUndefined();
    expect(filesystem.pendingTemporaries()).toBe(0);
  });

  it('MUST open no write handle when the stream never starts', async () => {
    const { filesystem, provider } = setup();

    await provider.invoke('upload', { path: 'db', name: 'in.bin', size: 6, transferId: 't-1' });
    await provider.createChunkSink('t-1').discard();

    expect(filesystem.opened.write).toBe(0);
    expect(filesystem.pendingTemporaries()).toBe(0);
  });

  it('MUST reject a duplicate transferId instead of rebinding it', async () => {
    const { provider } = setup();
    const params = { path: 'db', name: 'in.bin', size: 6, transferId: 't-1' };

    expect(codeOf(await provider.invoke('upload', params))).toBe('ok');
    // 重绑会让第一条传输的字节落进第二条声明的路径。
    expect(codeOf(await provider.invoke('upload', params))).toBe('resource_conflict');
  });

  it('MUST refuse to hand out a sink for an unregistered transfer', () => {
    const { provider } = setup();

    expect(() => provider.createChunkSink('t-unknown')).toThrow();
  });

  it('MUST hand out a registered sink at most once', async () => {
    const { provider } = setup();

    await provider.invoke('upload', { path: 'db', name: 'in.bin', size: 6, transferId: 't-1' });

    expect(provider.createChunkSink('t-1')).toBeDefined();
    expect(() => provider.createChunkSink('t-1')).toThrow();
  });
});

describe('native files provider — create-directory and delete', () => {
  it('MUST create a directory and report its logical path', async () => {
    const { filesystem, provider } = setup();

    const result = await provider.invoke('create-directory', { path: 'db/backups' });

    expect(result).toEqual({ outcome: 'ok', result: { path: 'db/backups' } });
    expect(await filesystem.stat(['db', 'backups'])).toEqual({
      name: 'backups',
      kind: 'directory',
      size: 0,
      lastModified: 1
    });
  });

  it('MUST report a conflict rather than succeed idempotently on an existing target', async () => {
    const { provider } = setup(f => {
      f.seedDirectory(['db']);
    });

    // 宿主的建目录语义是幂等成功；不先探一次，`resource_conflict` 就永远发不出来。
    expect(codeOf(await provider.invoke('create-directory', { path: 'db' }))).toBe('resource_conflict');
  });

  it('MUST delete a directory together with everything under it', async () => {
    const { filesystem, provider } = setup(f => {
      f.seedFile(['db', 'backups', 'a.sqlite'], 4);
    });

    const result = await provider.invoke('delete', { path: 'db' });

    expect(result).toEqual({ outcome: 'ok', result: { path: 'db' } });
    expect(filesystem.contentOf(['db', 'backups', 'a.sqlite'])).toBeUndefined();
  });

  it('MUST report a missing delete target instead of succeeding silently', async () => {
    const { provider } = setup();

    // 静默成功会让 UI 显示「已删除」，而那句话此刻没有证据。
    expect(codeOf(await provider.invoke('delete', { path: 'nope' }))).toBe('resource_not_found');
  });
});

describe('native files provider — error mapping', () => {
  it('MUST map a host errno onto a shared provider code and carry no message', async () => {
    const filesystem = createFakeNativeFilesystem();
    const provider = createDevToolsNativeFilesProvider({
      filesystem,
      maxTransferBytes: MAX_TRANSFER_BYTES,
      runtime: 'electron'
    });
    filesystem.seedDirectory(['db']);
    // 宿主抛 EACCES；provider 不得把 errno、路径或消息透传上 wire。
    filesystem.list = () => Promise.reject(Object.assign(new Error('denied /Users/someone/db'), { code: 'EACCES' }));

    const result = await provider.invoke('list', { path: 'db' });

    expect(result).toEqual({ outcome: 'failed', error: { code: 'permission_denied', retryable: false } });
  });

  it('MUST fall back to operation_failed for an unregistered host error', async () => {
    const filesystem = createFakeNativeFilesystem();
    const provider = createDevToolsNativeFilesProvider({
      filesystem,
      maxTransferBytes: MAX_TRANSFER_BYTES,
      runtime: 'electron'
    });
    filesystem.seedDirectory(['db']);
    filesystem.list = () => Promise.reject(new Error('something went wrong at /Users/someone'));

    expect(await provider.invoke('list', { path: 'db' })).toEqual({
      outcome: 'failed',
      error: { code: 'operation_failed', retryable: false }
    });
  });
});

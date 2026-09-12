/**
 * Tauri 桌面端 DevTools provider 装配（US-905 阶段 2，AC#10 / AC#11 / AC#14 的页内一半）。
 *
 * @remarks
 * 这里只验装配层的三件事，都与 RxDB 无关、也都只会在运行时以「看起来没接上」的形态暴露：
 *
 * 1. 文件请求走**注入的** transport，而不是 preload 全局桥接（Tauri 没有那一层）；
 * 2. `files` 与 `settings` 报的 runtime 与 `database` 同源，都是 `tauri`；
 * 3. 页面刷新时 host 文件会话被释放。
 *
 * 真实双窗口那一半在 `apps/dev-rxdb-tauri-e2e`，本文件不越界去做它。
 */
import { DESKTOP_HOST_PROTOCOL_VERSION, type DesktopHostTransport } from '@aiao/rxdb-adapter-tauri';
import { createConnectorProviders } from '@aiao/rxdb-devtools';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDesktopDevToolsProviders,
  DESKTOP_STORAGE_ROOT_DIR,
  resolveDevToolsProviders
} from './setup_rxdb_desktop';

/** 记录请求种类的假宿主；只答 devtools 文件系统会发的那几种。 */
const createRecordingTransport = (): { kinds: string[]; transport: DesktopHostTransport } => {
  const kinds: string[] = [];
  return {
    kinds,
    transport: {
      request: payload => {
        kinds.push(payload.kind);
        if (payload.kind === 'file.open') {
          return Promise.resolve({
            kind: 'file.open',
            result: { sessionId: 'session-1', protocolVersion: DESKTOP_HOST_PROTOCOL_VERSION }
          });
        }
        // `file.list` 的 result 就是条目数组本身（见 `devtools-desktop-filesystem.ts` 的 `result.map`）。
        if (payload.kind === 'file.list') return Promise.resolve({ kind: 'file.list', result: [] });
        return Promise.resolve({ kind: payload.kind });
      },
      subscribe: () => () => undefined
    }
  };
};

/** 快照用不到的 storage 桩：本文件的用例都不触发 capture。 */
const neverCalledStorage = () => {
  throw new Error('storage MUST NOT be read at assembly time');
};

describe('createDesktopDevToolsProviders', () => {
  beforeEach(() => {
    // happy-dom 的 window 在用例之间是同一个，而装配会挂 pagehide 监听。
    // 不清的话，上一条用例的 filesystem 会跟着这一条的 pagehide 一起 dispose，
    // 断言就会验到一个不属于本用例的会话。
    globalThis.dispatchEvent(new Event('pagehide'));
  });

  it('文件请求走注入的 transport，而不是 preload 全局桥接', async () => {
    const { kinds, transport } = createRecordingTransport();
    const providers = createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage });

    await providers.nativeFiles.filesystem.list([]);

    // 照抄 Electron 那句无参的 `createDevToolsDesktopFilesystem({ rootDir })` 会编译通过，
    // 但它去读的是 preload 注入的全局键——Tauri 没有 preload，症状要等用户点开文件页才冒出来。
    expect(kinds).toEqual(['file.open', 'file.list']);
  });

  it('与 storage 插件共用同一个逻辑根', () => {
    // 两边各写一个字面量的话，面板与应用会看着两个同名却不同的目录。
    expect(DESKTOP_STORAGE_ROOT_DIR).toBe('files');
  });

  it('装配时不读 storage：快照来源延迟到 capture 那一刻', () => {
    const { transport } = createRecordingTransport();

    // `rxdb.storage` 要等 `connect()` 才挂上。装配期就读的话，快照拿到的是一个还没连上的
    // storage——而那条错误只会在有人翻诊断快照时才出现。`neverCalledStorage` 一被调用就抛。
    expect(() => createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage })).not.toThrow();
  });

  it('三个领域报同一个 runtime: tauri（AC#10）', () => {
    const { transport } = createRecordingTransport();
    const ports = createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage });

    const registry = createConnectorProviders({
      ...ports,
      database: { getRxDB: () => undefined, getEntityMetadata: () => undefined, emitEvent: () => undefined }
    });
    const byDomain = new Map(registry.descriptors.map(descriptor => [descriptor.domain, descriptor]));

    // AC#10 的判据是「UI 仅用 runtime: tauri 显示来源」；面板读的就是这三个 descriptor。
    expect(byDomain.get('files')).toMatchObject({ kind: 'native-files', runtime: 'tauri' });
    expect(byDomain.get('settings')).toMatchObject({ kind: 'sqlite', runtime: 'tauri' });
    expect(byDomain.get('database')?.runtime).toBe('tauri');
  });

  it('页面刷新时释放 host 文件会话（AC#14）', async () => {
    const { kinds, transport } = createRecordingTransport();
    const providers = createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage });
    await providers.nativeFiles.filesystem.list([]);
    kinds.length = 0;

    // 主窗口**刷新**不触发 Rust 的 `WindowEvent::Destroyed`，host 不会自己回收；
    // 没有这条接线，每刷一次泄一条会话——连同它持有的锁，而那把锁没有超时能解开。
    globalThis.dispatchEvent(new Event('pagehide'));
    await Promise.resolve();

    expect(kinds).toContain('file.close');
  });
});

/**
 * US-905 AC#2 的 fake 档装配分叉：provider 源档位决定连接器吃真实桌面端口还是整份 fake
 * registry。真实端口包在 thunk 里，fake 档下**一次都不该装配** —— 装配它会把 pagehide
 * 监听与 host 文件会话都建起来，而 fake 档的本意是连 host 都不碰。
 */
describe('resolveDevToolsProviders（US-905 AC#2 fake 档装配分叉）', () => {
  const neverCalled = (): ReturnType<typeof createDesktopDevToolsProviders> => {
    throw new Error('real providers MUST NOT be assembled under the fake tier');
  };

  it('fake 档返回整份 gear registry，真实端口不装配', () => {
    const real = vi.fn(neverCalled);
    const resolved = resolveDevToolsProviders('fake', 'ok', real);

    expect(real).not.toHaveBeenCalled();
    expect(resolved).toHaveProperty('providerRegistry');
    if ('providerRegistry' in resolved) {
      expect(resolved.providerRegistry.descriptors.map(({ domain, kind }) => [domain, kind])).toEqual([
        ['database', 'rxdb'],
        ['files', 'native-files'],
        ['settings', 'sqlite']
      ]);
    }
  });

  it('fake 档缺场景时按 Rust 侧默认 ok', () => {
    // Rust 的 plan_from_env 恒填 snapshotScenario（默认 ok），页侧同值兜的是类型上的
    // undefined —— 不是运行时改道。
    const resolved = resolveDevToolsProviders('fake', undefined, neverCalled);
    expect(resolved).toHaveProperty('providerRegistry');
  });

  it('real 档与未配源档（release 形态）都走真实装配', () => {
    const { transport } = createRecordingTransport();
    const ports = createDesktopDevToolsProviders({ transport, getStorage: neverCalledStorage });
    const real = vi.fn(() => ports);

    expect(resolveDevToolsProviders('real', 'ok', real)).toBe(ports);
    expect(resolveDevToolsProviders(undefined, undefined, real)).toBe(ports);
    expect(real).toHaveBeenCalledTimes(2);
  });
});

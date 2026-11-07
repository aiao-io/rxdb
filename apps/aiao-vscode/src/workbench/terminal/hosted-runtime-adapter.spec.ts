import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeHostConnection } from './runtime-host-protocol.js';

const frames = vi.hoisted(() => ({ openRuntimeHost: vi.fn() }));
vi.mock('./runtime-host-frame.js', () => frames);

import { createHostedRuntimeAdapter, isHostedRuntime } from './hosted-runtime-adapter.js';

const HOST = 'http://localhost:4331';

function connection(boot: () => Promise<void> = async () => undefined) {
  return { boot: vi.fn(boot), teardown: vi.fn() } as unknown as RuntimeHostConnection & {
    boot: ReturnType<typeof vi.fn>;
    teardown: ReturnType<typeof vi.fn>;
  };
}

beforeEach(() => {
  vi.stubGlobal('crossOriginIsolated', true);
  vi.stubGlobal('document', {});
  frames.openRuntimeHost.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('独立源宿主里的运行时适配器', () => {
  it('只有 vivari 与 Nodepod 跑在独立源宿主里', () => {
    expect(['vivari', 'nodepod'].every(isHostedRuntime)).toBe(true);
    expect(['webcontainer', 'esbuild-wasm', 'almostnode', 'burrow'].some(isHostedRuntime)).toBe(false);
  });

  it('交互 Shell 都用无参 sh；没有伪终端与带状态标记的 shell，项目运行走进程模式', () => {
    for (const id of ['vivari', 'nodepod'] as const) {
      const adapter = createHostedRuntimeAdapter(id, HOST);
      expect(adapter.id).toBe(id);
      expect(adapter.capabilities).toEqual({ shell: { command: 'sh', args: [] }, pty: false });
    }
  });

  it('没有跨源隔离时拒绝启动，不加载宿主页', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    await expect(createHostedRuntimeAdapter('vivari', HOST).boot()).rejects.toThrow('跨源隔离');
    expect(frames.openRuntimeHost).not.toHaveBeenCalled();
  });

  it('在配置的宿主源上打开宿主页并启动运行时，连接即容器', async () => {
    const host = connection();
    frames.openRuntimeHost.mockResolvedValueOnce(host);
    await expect(createHostedRuntimeAdapter('nodepod', 'http://localhost:4332').boot()).resolves.toBe(host);
    expect(frames.openRuntimeHost).toHaveBeenCalledWith(document, { origin: 'http://localhost:4332', runtime: 'nodepod' });
    expect(host.boot).toHaveBeenCalledOnce();
    expect(host.teardown).not.toHaveBeenCalled();
  });

  it('宿主里的运行时启动失败时按原因拒绝并拆除宿主页', async () => {
    const host = connection(async () => {
      throw new Error('ERR_NOT_ISOLATED');
    });
    frames.openRuntimeHost.mockResolvedValueOnce(host);
    await expect(createHostedRuntimeAdapter('vivari', HOST).boot()).rejects.toThrow('ERR_NOT_ISOLATED');
    expect(host.teardown).toHaveBeenCalledOnce();
  });
});

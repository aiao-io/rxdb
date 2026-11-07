import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({
  configureAPIKey: vi.fn(),
  boot: vi.fn(async () => ({ teardown: vi.fn() }))
}));

vi.mock('@webcontainer/api', () => ({ configureAPIKey: api.configureAPIKey, WebContainer: { boot: api.boot } }));

async function freshAdapter(options?: { apiKey?: string }) {
  vi.resetModules();
  const { createWebContainerAdapter } = await import('./webcontainer-adapter.js');
  return createWebContainerAdapter(options);
}

beforeEach(() => {
  vi.stubGlobal('crossOriginIsolated', true);
  api.configureAPIKey.mockClear();
  api.boot.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('WebContainer 运行时适配器', () => {
  it('声明 jsh 交互 Shell 与带状态标记的项目 Shell', async () => {
    const adapter = await freshAdapter();
    expect(adapter.id).toBe('webcontainer');
    expect(adapter.capabilities).toEqual({
      shell: { command: 'jsh', args: [] },
      markedShell: { command: 'jsh', args: ['--osc'] }
    });
  });

  it('没有跨源隔离时拒绝启动，不加载 WebContainer', async () => {
    vi.stubGlobal('crossOriginIsolated', false);
    const adapter = await freshAdapter();
    await expect(adapter.boot()).rejects.toThrow('跨源隔离');
    expect(api.boot).not.toHaveBeenCalled();
  });

  it('按 require-corp 启动，授权 key 只在首次启动前配置一次', async () => {
    vi.resetModules();
    const { createWebContainerAdapter } = await import('./webcontainer-adapter.js');
    await createWebContainerAdapter({ apiKey: 'key-1' }).boot();
    await createWebContainerAdapter({ apiKey: 'key-1' }).boot();
    expect(api.configureAPIKey).toHaveBeenCalledExactlyOnceWith('key-1');
    expect(api.boot).toHaveBeenCalledWith({ coep: 'require-corp', workdirName: 'project' });
    await expect(createWebContainerAdapter({ apiKey: 'key-2' }).boot()).rejects.toThrow('刷新页面');
    expect(api.boot).toHaveBeenCalledTimes(2);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({ initialize: vi.fn(), build: vi.fn(), compileProject: vi.fn() }));
vi.mock('esbuild-wasm', () => ({ initialize: services.initialize, build: services.build }));
vi.mock('./compiler-project.js', () => ({ compileProject: services.compileProject }));

describe('浏览器 WASM 编译器初始化', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    services.initialize.mockResolvedValue(undefined);
    services.compileProject.mockResolvedValue({ js: 'compiled', css: '' });
  });

  it('并发编译共用一次初始化，并关闭内部嵌套 Worker', async () => {
    const { compileInBrowser } = await import('./compiler-browser.js');
    const input = { template: 'vanilla' as const, entry: 'main.ts', files: { 'main.ts': '' } };
    await Promise.all([
      compileInBrowser(input, { wasmURL: '/fixed/esbuild.wasm' }),
      compileInBrowser(input, { wasmURL: '/fixed/esbuild.wasm' })
    ]);
    expect(services.initialize).toHaveBeenCalledExactlyOnceWith({ wasmURL: '/fixed/esbuild.wasm', worker: false });
    expect(services.compileProject).toHaveBeenCalledTimes(2);
  });

  it('已选编译器拒绝切换 WASM 版本，Angular 适配器保持同一入口', async () => {
    const { compileInBrowser } = await import('./compiler-browser.js');
    const input = { template: 'angular' as const, entry: 'main.ts', files: { 'main.ts': '' } };
    const transform = async () => 'angular';
    await compileInBrowser(input, { wasmURL: '/fixed/esbuild.wasm', angularTransform: transform });
    expect(services.compileProject).toHaveBeenCalledWith(input, { build: services.build, angularTransform: transform });
    await expect(compileInBrowser(input, { wasmURL: '/other/esbuild.wasm' })).rejects.toThrow('不允许切换');
    expect(services.initialize).toHaveBeenCalledOnce();
  });

  it('初始化失败保留错误，不切换引擎或伪造输出', async () => {
    services.initialize.mockRejectedValue(new Error('wasm unavailable'));
    const { compileInBrowser } = await import('./compiler-browser.js');
    await expect(
      compileInBrowser({ template: 'vanilla', entry: 'main.ts', files: {} }, { wasmURL: '/fixed/esbuild.wasm' })
    ).rejects.toThrow('wasm unavailable');
    expect(services.compileProject).not.toHaveBeenCalled();
  });
});

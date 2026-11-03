import { beforeEach, describe, expect, it, vi } from 'vitest';

const services = vi.hoisted(() => ({ compile: vi.fn(), angular: vi.fn(), post: vi.fn() }));
vi.mock('./compiler-browser.js', () => ({ compileInBrowser: services.compile }));
vi.mock('./angular-compiler.js', () => ({ compileAngular: services.angular }));

describe('编译 Worker 请求协议', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubGlobal('postMessage', services.post);
    services.compile.mockResolvedValue({ js: 'compiled', css: '' });
  });

  async function request(template = 'vanilla'): Promise<void> {
    await import('./compiler-worker.js');
    const handler = globalThis.onmessage as unknown as (event: MessageEvent) => Promise<void>;
    await handler(
      new MessageEvent('message', {
        data: { id: 'request-1', input: { template, entry: 'main.ts', files: {} }, wasmURL: '/assets/esbuild.wasm' }
      })
    );
  }

  it('编译结果保留请求标识，普通模板不加载 Angular 适配器', async () => {
    await request();
    expect(services.compile).toHaveBeenCalledWith(
      { template: 'vanilla', entry: 'main.ts', files: {} },
      { wasmURL: '/assets/esbuild.wasm', angularTransform: undefined }
    );
    expect(services.post).toHaveBeenCalledWith({ id: 'request-1', result: { js: 'compiled', css: '' } });
  });

  it('只有 Angular 请求获得 Angular 语义转译器', async () => {
    await request('angular');
    expect(services.compile.mock.calls[0][1].angularTransform).toBe(services.angular);
  });

  it('esbuild 形态的失败附带结构化诊断，前缀消息解析为定位，普通错误无诊断', async () => {
    services.compile.mockRejectedValueOnce(
      Object.assign(new Error('Build failed'), {
        errors: [
          { text: 'Unexpected "const"', location: { file: 'workbench:/src/main.ts', line: 3, column: 7 } },
          { text: 'Unresolved import', location: { file: 'src/a.ts' } }
        ]
      })
    );
    await request();
    expect(services.post).toHaveBeenCalledWith({
      id: 'request-1',
      error: 'Build failed',
      diagnostics: [
        { file: 'src/main.ts', line: 3, column: 7, message: 'Unexpected "const"' },
        { file: 'src/a.ts', line: undefined, column: undefined, message: 'Unresolved import' }
      ]
    });
    services.compile.mockRejectedValueOnce(new Error('src/app.ts:12:5 Property foo does not exist'));
    await request();
    expect(services.post).toHaveBeenCalledWith({
      id: 'request-1',
      error: 'src/app.ts:12:5 Property foo does not exist',
      diagnostics: [{ file: 'src/app.ts', line: 12, column: 5, message: 'Property foo does not exist' }]
    });
    services.compile.mockRejectedValueOnce(new Error('plain failure'));
    await request();
    expect(services.post).toHaveBeenCalledWith({ id: 'request-1', error: 'plain failure', diagnostics: undefined });
  });
});

// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompiler } from './compiler-client.js';
import type { RuntimeBundle } from './compiler/compiler-runtime.js';

const runtimeLoader = vi.hoisted(() => vi.fn());
vi.mock('./compiler/compiler-runtime.js', () => ({ loadRuntimeBundle: runtimeLoader }));
const runtime: RuntimeBundle = {
  runtimeFiles: { 'runtime/react.js': 'export const value=1;' },
  runtimeImports: { react: 'runtime/react.js' }
};

class ProbeWorker {
  static instances: ProbeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  request?: {
    id: string;
    input: unknown;
    wasmURL: string;
    runtimeFiles?: RuntimeBundle['runtimeFiles'];
    runtimeImports?: RuntimeBundle['runtimeImports'];
  };
  terminate = vi.fn();
  constructor() {
    ProbeWorker.instances.push(this);
  }
  postMessage(request: { id: string; input: unknown; wasmURL: string }): void {
    this.request = request;
  }
  emit(data: unknown): void {
    this.onmessage?.(new MessageEvent('message', { data }));
  }
}

const input = {
  template: 'vanilla' as const,
  entry: 'main.ts',
  files: {
    'index.html': '<div id="app"></div><script type="module" src="main.ts"></script>',
    'main.ts': 'console.log(1)'
  }
};

describe('可取消的编译 Worker 客户端', () => {
  beforeEach(() => {
    ProbeWorker.instances = [];
    vi.stubGlobal('Worker', ProbeWorker);
    runtimeLoader.mockReset().mockResolvedValue(runtime);
  });

  it('传递受控 HTML 样式、固定 WASM URL，并终止完成的 Worker', async () => {
    const compiler = createCompiler('https://assets.test/runtime');
    const result = compiler.compile(input);
    const worker = ProbeWorker.instances[0];
    expect(worker.request?.wasmURL).toBe('https://assets.test/runtime/esbuild.wasm');
    worker.emit({ id: worker.request?.id, result: { js: 'console.log(1)', css: '' } });
    await expect(result).resolves.toEqual({ js: 'console.log(1)', css: '', html: '<div id="app"></div>' });
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('忽略不属于请求的结果并保留编译错误', async () => {
    const compiler = createCompiler('/assets');
    const result = compiler.compile(input);
    const worker = ProbeWorker.instances[0];
    worker.emit({ id: 'another-request', result: { js: 'wrong', css: '' } });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ id: worker.request?.id, error: 'main.ts:1 Unexpected token' });
    await expect(result).rejects.toThrow('main.ts:1');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it('取消任务立即释放 Worker，预先取消不创建 Worker', async () => {
    const compiler = createCompiler('/assets');
    const controller = new AbortController();
    const result = compiler.compile(input, controller.signal);
    controller.abort();
    await expect(result).rejects.toMatchObject({ name: 'AbortError' });
    expect(ProbeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    await expect(compiler.compile(input, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(ProbeWorker.instances).toHaveLength(1);
  });

  it('销毁拒绝所有未完成任务并禁止后续编译', async () => {
    const compiler = createCompiler('/assets');
    const first = compiler.compile(input);
    const second = compiler.compile(input);
    compiler.dispose();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(ProbeWorker.instances.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    await expect(compiler.compile(input)).rejects.toThrow('已经释放');
  });

  it('Worker 启动错误和无效结果均结束任务并释放资源', async () => {
    const compiler = createCompiler('/assets');
    const failed = compiler.compile(input);
    ProbeWorker.instances[0].onerror?.(new ErrorEvent('error', { message: 'worker unavailable' }));
    await expect(failed).rejects.toThrow('worker unavailable');
    expect(ProbeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    const invalid = compiler.compile(input);
    const worker = ProbeWorker.instances[1];
    worker.emit({ id: worker.request?.id });
    await expect(invalid).rejects.toThrow('无效结果');
    expect(worker.terminate).toHaveBeenCalledOnce();
  });

  it.each([new DOMException('detached buffer', 'DataCloneError'), 'message transfer failed'])(
    '传输失败不留下运行中的 Worker：%s',
    async cause => {
      vi.spyOn(ProbeWorker.prototype, 'postMessage').mockImplementation(() => {
        throw cause;
      });
      const compiler = createCompiler('/assets');
      await expect(compiler.compile(input)).rejects.toThrow(cause instanceof Error ? cause.message : cause);
      expect(ProbeWorker.instances[0].terminate).toHaveBeenCalledOnce();
      vi.restoreAllMocks();
    }
  );

  it('运行时资源每实例读取一次，并随每次 Worker 编译传递', async () => {
    const compiler = createCompiler('/assets');
    const first = compiler.compile({ ...input, template: 'react' });
    const second = compiler.compile({ ...input, template: 'react' });
    await vi.waitFor(() => expect(ProbeWorker.instances).toHaveLength(2));
    expect(runtimeLoader).toHaveBeenCalledOnce();
    for (const worker of ProbeWorker.instances) {
      expect(worker.request?.runtimeFiles).toEqual(runtime.runtimeFiles);
      expect(worker.request?.runtimeImports).toEqual(runtime.runtimeImports);
      worker.emit({ id: worker.request?.id, result: { js: 'bundled', css: '' } });
    }
    await Promise.all([first, second]);
  });

  it('预取期间取消单次编译不创建 Worker，也不取消共享资源缓存', async () => {
    let finish!: (bundle: RuntimeBundle) => void;
    runtimeLoader.mockReturnValueOnce(
      new Promise<RuntimeBundle>(resolve => {
        finish = resolve;
      })
    );
    const compiler = createCompiler('/assets');
    const controller = new AbortController();
    const pending = compiler.compile({ ...input, template: 'react' }, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(ProbeWorker.instances).toHaveLength(0);
    finish(runtime);
    const next = compiler.compile({ ...input, template: 'react' });
    await vi.waitFor(() => expect(ProbeWorker.instances).toHaveLength(1));
    expect(runtimeLoader).toHaveBeenCalledOnce();
    const worker = ProbeWorker.instances[0];
    worker.emit({ id: worker.request?.id, result: { js: '', css: '' } });
    await next;
  });

  it('释放编译器会终止预取等待，资源迟到不能再创建 Worker', async () => {
    let finish!: (bundle: RuntimeBundle) => void;
    runtimeLoader.mockReturnValueOnce(
      new Promise<RuntimeBundle>(resolve => {
        finish = resolve;
      })
    );
    const compiler = createCompiler('/assets');
    const pending = compiler.compile({ ...input, template: 'vue' });
    compiler.dispose();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect((runtimeLoader.mock.calls[0][1] as AbortSignal).aborted).toBe(true);
    finish(runtime);
    await Promise.resolve();
    expect(ProbeWorker.instances).toHaveLength(0);
  });

  it('缺失缓存资源明确失败，资源补齐后允许显式重试', async () => {
    runtimeLoader.mockRejectedValueOnce(new Error('runtime 未缓存'));
    const compiler = createCompiler('/assets');
    await expect(compiler.compile({ ...input, template: 'react' })).rejects.toThrow('未缓存');
    const retry = compiler.compile({ ...input, template: 'react' });
    await vi.waitFor(() => expect(ProbeWorker.instances).toHaveLength(1));
    expect(runtimeLoader).toHaveBeenCalledTimes(2);
    const worker = ProbeWorker.instances[0];
    worker.emit({ id: worker.request?.id, result: { js: '', css: '' } });
    await retry;
  });
});

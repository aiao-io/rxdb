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
  requests: NonNullable<ProbeWorker['request']>[] = [];
  terminate = vi.fn();
  constructor() {
    ProbeWorker.instances.push(this);
  }
  postMessage(request: { id: string; input: unknown; wasmURL: string }): void {
    this.request = request;
    this.requests.push(request);
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

  it('传递受控 HTML 与固定 WASM URL，成功后复用同一个 Worker', async () => {
    const compiler = createCompiler('https://assets.test/runtime');
    const result = compiler.compile(input);
    const worker = ProbeWorker.instances[0];
    expect(worker.request?.wasmURL).toBe('https://assets.test/runtime/esbuild.wasm');
    worker.emit({ id: worker.request?.id, result: { js: 'console.log(1)', css: '' } });
    await expect(result).resolves.toEqual({ js: 'console.log(1)', css: '', html: '<div id="app"></div>' });
    expect(worker.terminate).not.toHaveBeenCalled();
    const second = compiler.compile(input);
    expect(ProbeWorker.instances).toHaveLength(1);
    expect(worker.requests).toHaveLength(2);
    worker.emit({ id: worker.request?.id, result: { js: 'second', css: '' } });
    await expect(second).resolves.toMatchObject({ js: 'second' });
    compiler.dispose();
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
    expect(ProbeWorker.instances).toHaveLength(1);
    compiler.dispose();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).rejects.toMatchObject({ name: 'AbortError' });
    expect(ProbeWorker.instances.every(worker => worker.terminate.mock.calls.length === 1)).toBe(true);
    await expect(compiler.compile(input)).rejects.toThrow('已经释放');
  });

  it('排队请求取消不会终止正在编译的请求，后续仍复用健康 Worker', async () => {
    const compiler = createCompiler('/assets');
    const first = compiler.compile(input);
    const controller = new AbortController();
    const queued = compiler.compile(input, controller.signal);
    const worker = ProbeWorker.instances[0];
    expect(worker.requests).toHaveLength(1);
    controller.abort();
    await expect(queued).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminate).not.toHaveBeenCalled();
    worker.emit({ id: worker.request?.id, result: { js: 'first', css: '' } });
    await expect(first).resolves.toMatchObject({ js: 'first' });
    const next = compiler.compile(input);
    expect(ProbeWorker.instances).toHaveLength(1);
    worker.emit({ id: worker.request?.id, result: { js: 'next', css: '' } });
    await expect(next).resolves.toMatchObject({ js: 'next' });
    compiler.dispose();
  });

  it('取消 active 编译只重建引擎，排队请求继续完成且忽略旧 Worker 迟到结果', async () => {
    const compiler = createCompiler('/assets');
    const controller = new AbortController();
    const first = compiler.compile(input, controller.signal);
    const queued = compiler.compile(input);
    const previous = ProbeWorker.instances[0];
    const previousId = previous.request?.id;
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(previous.terminate).toHaveBeenCalledOnce();
    const next = ProbeWorker.instances[1];
    previous.emit({ id: previousId, result: { js: 'stale', css: '' } });
    next.emit({ id: next.request?.id, result: { js: 'queued', css: '' } });
    await expect(queued).resolves.toMatchObject({ js: 'queued' });
    compiler.dispose();
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

  it.each([
    { cause: new DOMException('detached buffer', 'DataCloneError'), expected: /detached buffer/ },
    { cause: 'message transfer failed', expected: /message transfer failed/ }
  ])('传输失败不留下运行中的 Worker：$cause', async ({ cause, expected }) => {
    vi.spyOn(ProbeWorker.prototype, 'postMessage').mockImplementation(() => {
      throw cause;
    });
    const compiler = createCompiler('/assets');
    await expect(compiler.compile(input)).rejects.toThrow(expected);
    expect(ProbeWorker.instances[0].terminate).toHaveBeenCalledOnce();
    vi.restoreAllMocks();
  });

  it('运行时资源每实例读取一次，并随每次 Worker 编译传递', async () => {
    const compiler = createCompiler('/assets');
    const first = compiler.compile({ ...input, template: 'react' });
    const second = compiler.compile({ ...input, template: 'react' });
    await vi.waitFor(() => expect(ProbeWorker.instances).toHaveLength(1));
    expect(runtimeLoader).toHaveBeenCalledOnce();
    const worker = ProbeWorker.instances[0];
    expect(worker.request?.runtimeFiles).toEqual(runtime.runtimeFiles);
    expect(worker.request?.runtimeImports).toEqual(runtime.runtimeImports);
    worker.emit({ id: worker.request?.id, result: { js: 'first', css: '' } });
    await vi.waitFor(() => expect(worker.requests).toHaveLength(2));
    expect(worker.request?.runtimeFiles).toEqual(runtime.runtimeFiles);
    worker.emit({ id: worker.request?.id, result: { js: 'second', css: '' } });
    await Promise.all([first, second]);
    expect(ProbeWorker.instances).toHaveLength(1);
    compiler.dispose();
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

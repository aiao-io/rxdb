import { declaredDependencies } from './compiler/compiler-dependencies.js';
import { loadRuntimeBundle, type RuntimeBundle } from './compiler/compiler-runtime.js';
import type { CompiledProject, CompileProjectInput } from './compiler/compiler-types.js';
import { prepareProjectHTML } from './preview/preview-sandbox.js';

/** 复用健康 Worker，单个请求可取消的项目编译入口。 */
export interface WorkbenchCompiler {
  compile(input: CompileProjectInput, signal?: AbortSignal): Promise<CompiledProject>;
  dispose(): void;
}

interface CompilationRequest extends RuntimeBundle {
  id: string;
  input: CompileProjectInput;
  wasmURL: string;
}

interface PendingCompilation {
  request: CompilationRequest;
  html: string;
  signal?: AbortSignal;
  abort: () => void;
  resolve: (result: CompiledProject) => void;
  reject: (cause: Error) => void;
}

function waitForRuntime(
  promise: Promise<RuntimeBundle>,
  signals: readonly (AbortSignal | undefined)[]
): Promise<RuntimeBundle> {
  return new Promise((resolve, reject) => {
    const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
    const cleanup = () => active.forEach(signal => signal.removeEventListener('abort', abort));
    const abort = () => {
      cleanup();
      reject(new DOMException('编译已取消', 'AbortError'));
    };
    active.forEach(signal => signal.addEventListener('abort', abort, { once: true }));
    promise.then(
      value => {
        cleanup();
        resolve(value);
      },
      cause => {
        cleanup();
        reject(cause);
      }
    );
    if (active.some(signal => signal.aborted)) abort();
  });
}

/** 使用自托管 WASM 资源创建编译器；HTML 只在 inert fragment 中解析。 */
export function createCompiler(assetBaseURL: string): WorkbenchCompiler {
  const pending = new Map<string, PendingCompilation>();
  const base = new URL(assetBaseURL.endsWith('/') ? assetBaseURL : `${assetBaseURL}/`, location.href);
  const lifecycle = new AbortController();
  let runtimeCache: Promise<RuntimeBundle> | undefined;
  let worker: Worker | undefined;
  let activeId: string | undefined;
  let disposed = false;

  function stopWorker(): void {
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.terminate();
    }
    worker = undefined;
    activeId = undefined;
  }

  function detach(task: PendingCompilation): void {
    pending.delete(task.request.id);
    task.signal?.removeEventListener('abort', task.abort);
    if (activeId === task.request.id) activeId = undefined;
  }

  function fail(task: PendingCompilation, cause: Error): void {
    const running = activeId === task.request.id;
    detach(task);
    if (running) stopWorker();
    task.reject(cause);
    pump();
  }

  function ensureWorker(): Worker {
    if (worker) return worker;
    const instance = new Worker(new URL('compiler-worker.js', base), { type: 'module' });
    worker = instance;
    instance.onerror = event => {
      if (worker !== instance) return;
      const task = activeId ? pending.get(activeId) : undefined;
      if (task) fail(task, new Error(event.message));
      else stopWorker();
    };
    instance.onmessage = (event: MessageEvent<{ id: string; result?: CompiledProject; error?: string }>) => {
      if (worker !== instance || event.data.id !== activeId) return;
      const task = pending.get(event.data.id);
      if (!task) return;
      if (event.data.error) {
        fail(task, new Error(event.data.error));
        return;
      }
      if (!event.data.result) {
        fail(task, new Error('编译 Worker 返回无效结果'));
        return;
      }
      detach(task);
      task.resolve({ ...event.data.result, html: task.html });
      pump();
    };
    return instance;
  }

  function pump(): void {
    if (disposed || activeId !== undefined) return;
    const task = pending.values().next().value;
    if (!task) return;
    activeId = task.request.id;
    try {
      ensureWorker().postMessage(task.request);
    } catch (cause) {
      fail(task, cause instanceof Error ? cause : new Error(String(cause)));
    }
  }

  return {
    async compile(input, signal) {
      if (disposed) throw new Error('编译器已经释放');
      if (signal?.aborted) throw new DOMException('编译已取消', 'AbortError');
      declaredDependencies(input);
      const prepared = prepareProjectHTML(input);
      let runtime: RuntimeBundle = { runtimeFiles: {}, runtimeImports: {} };
      if (input.template !== 'vanilla') {
        runtimeCache ??= loadRuntimeBundle(base, lifecycle.signal).catch(cause => {
          runtimeCache = undefined;
          throw cause;
        });
        runtime = await waitForRuntime(runtimeCache, [signal, lifecycle.signal]);
      }
      if (disposed || signal?.aborted) throw new DOMException('编译已取消', 'AbortError');
      return new Promise<CompiledProject>((resolve, reject) => {
        const id = crypto.randomUUID();
        const task: PendingCompilation = {
          request: {
            id,
            input: { ...input, styles: prepared.styles, inlineCSS: prepared.inlineCSS },
            wasmURL: new URL('esbuild.wasm', base).href,
            ...runtime
          },
          html: prepared.html,
          signal,
          abort: () => fail(task, new DOMException('编译已取消', 'AbortError')),
          resolve,
          reject
        };
        pending.set(id, task);
        signal?.addEventListener('abort', task.abort, { once: true });
        if (signal?.aborted) task.abort();
        else pump();
      });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lifecycle.abort();
      stopWorker();
      for (const task of [...pending.values()]) {
        detach(task);
        task.reject(new DOMException('编译器已经释放', 'AbortError'));
      }
    }
  };
}

import { declaredDependencies } from './compiler/compiler-dependencies.js';
import type { CompiledProject, CompileProjectInput } from './compiler/compiler-types.js';
import { loadRuntimeBundle, type RuntimeBundle } from './compiler/compiler-runtime.js';
import { prepareProjectHTML } from './preview/preview-sandbox.js';

/** 可中断且不复用过期 Worker 的项目编译入口。 */
export interface WorkbenchCompiler {
  compile(input: CompileProjectInput, signal?: AbortSignal): Promise<CompiledProject>;
  dispose(): void;
}

interface PendingCompilation {
  worker: Worker;
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
  const pending = new Set<PendingCompilation>();
  const base = new URL(assetBaseURL.endsWith('/') ? assetBaseURL : `${assetBaseURL}/`, location.href);
  const lifecycle = new AbortController();
  let runtimeCache: Promise<RuntimeBundle> | undefined;
  let disposed = false;
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
        const worker = new Worker(new URL('compiler-worker.js', base), { type: 'module' });
        const id = crypto.randomUUID();
        const finish = () => {
          worker.terminate();
          pending.delete(task);
          signal?.removeEventListener('abort', abort);
        };
        const fail = (cause: Error) => {
          finish();
          reject(cause);
        };
        const abort = () => fail(new DOMException('编译已取消', 'AbortError'));
        const task: PendingCompilation = { worker, reject: fail };
        pending.add(task);
        signal?.addEventListener('abort', abort, { once: true });
        worker.onerror = event => fail(new Error(event.message));
        worker.onmessage = (event: MessageEvent<{ id: string; result?: CompiledProject; error?: string }>) => {
          if (event.data.id !== id) return;
          if (event.data.error) {
            fail(new Error(event.data.error));
            return;
          }
          if (!event.data.result) {
            fail(new Error('编译 Worker 返回无效结果'));
            return;
          }
          finish();
          resolve({ ...event.data.result, html: prepared.html });
        };
        try {
          worker.postMessage({
            id,
            input: { ...input, styles: prepared.styles, inlineCSS: prepared.inlineCSS },
            wasmURL: new URL('esbuild.wasm', base).href,
            ...runtime
          });
        } catch (cause) {
          fail(cause instanceof Error ? cause : new Error(String(cause)));
        }
      });
    },
    dispose() {
      disposed = true;
      lifecycle.abort();
      for (const task of [...pending]) task.reject(new DOMException('编译器已经释放', 'AbortError'));
    }
  };
}

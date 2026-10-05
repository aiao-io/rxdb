import type { Plugin, Rollup } from 'vite';

/** 只经动态 `import()` 可达的模块并进的 chunk，产物里是 `rxdb-lazy.js`。 */
export const LAZY_CHUNK_NAME = 'rxdb-lazy';

/**
 * 从模块图的根沿静态 import 走得到的模块；动态 `import()` 的子树不算，除非也被静态引用。
 *
 * 根是入口，或没有任何静态、动态引用者的模块。只认 `isEntry` 不够：Taro 的页面与 custom-wrapper 是后发的 chunk，
 * 分包时 `isEntry` 仍为假（支付宝构建实测只有 `app.ts?entry-loader=true` 是），按入口算会把页面整个划进懒加载 chunk。
 *
 * @param moduleIds - 模块图里的全部 id
 * @param getModuleInfo - Rollup 的模块信息查询
 * @throws 模块图里查不到某个 id
 */
export function staticallyReachableModules(
  moduleIds: Iterable<string>,
  getModuleInfo: (id: string) => Rollup.ModuleInfo | null
): Set<string> {
  const info = (id: string): Rollup.ModuleInfo => {
    const found = getModuleInfo(id);
    if (!found) throw new Error(`模块图里查不到 ${id}`);
    return found;
  };
  const isRoot = (module: Rollup.ModuleInfo) =>
    module.isEntry || (module.importers.length === 0 && module.dynamicImporters.length === 0);
  const pending = [...moduleIds].filter(id => isRoot(info(id)));
  const reached = new Set<string>();
  for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
    if (reached.has(id)) continue;
    reached.add(id);
    pending.push(...info(id).importedIds);
  }
  return reached;
}

/**
 * 包住原来的分包规则：静态可达的模块照原规则分，其余全部并进 {@link LAZY_CHUNK_NAME}。
 *
 * 可达集合在第一次分包时按 `meta` 算（此时模块图已完整，后发的 chunk 也在），本次分包内复用。
 * 每次生成产物 Rollup 都重跑 `outputOptions`、拿到新的包装，watch 重建不会读到旧图。
 *
 * @param original - Taro 的 `manualChunks`
 */
export function lazyManualChunks(original: Rollup.GetManualChunk): Rollup.GetManualChunk {
  let reachable: ReadonlySet<string> | undefined;
  return (id, meta) => {
    reachable ??= staticallyReachableModules(meta.getModuleIds(), meta.getModuleInfo);
    return reachable.has(id) ? original(id, meta) : LAZY_CHUNK_NAME;
  };
}

/**
 * 让只经动态 `import()` 可达的模块（RxDB 核心、adapter 主入口、glue、rxjs）留在懒加载 chunk 里，`import()` 时才求值。
 *
 * Taro（vite-runner `mini/config.js`）的 `manualChunks` 只看路径与引用数：`node_modules` 进 `vendors`，被引用超过一次进
 * `common`，不分静态还是动态。页面与 `app.js` 静态 `require` 这两个 chunk，Rollup 又在 `require` 时求值 chunk 里全部
 * 模块的顶层代码，于是 RxDB 栈会赶在 adapter 的 `prepareMiniProgramHostRuntime` 之前求值。支付宝模拟器逻辑层没有
 * `BigInt`，es2018 产物里模块顶层的 `BigInt("…")` 一求值就抛错，所以支付宝构建要用它；微信、抖音有 `BigInt`，不需要。
 *
 * Taro 给的 `manualChunks` 不是函数时直接失败，不另起一套分包。
 */
export function lazyChunkVitePlugin(): Plugin {
  return {
    name: 'dev-rxdb-miniprogram:lazy-chunk',
    apply: 'build',
    outputOptions(options) {
      const original = options.manualChunks;
      if (typeof original !== 'function') {
        this.error(`Taro 的 output.manualChunks 不是函数（${typeof original}），懒加载分包无从包起`);
      }
      return { ...options, manualChunks: lazyManualChunks(original) };
    }
  };
}

import { describe, expect, it } from 'vitest';
import {
  LAZY_CHUNK_NAME,
  lazyChunkVitePlugin,
  lazyManualChunks,
  staticallyReachableModules
} from '../lazy-chunk-vite-plugin';

interface FakeModule {
  readonly isEntry?: boolean;
  readonly importedIds?: readonly string[];
  readonly dynamicallyImportedIds?: readonly string[];
}

/**
 * 照 Taro 支付宝构建的实际模块图：只有 app 是 `isEntry`；页面与 custom-wrapper 是后发的 chunk，
 * 分包时 `isEntry` 仍为假，但没有任何引用者。页面静态引 preflight，preflight 静态引 /runtime；
 * 页面动态引 rxdb，rxdb 静态引 rxjs 与 /runtime（两边共用）。
 */
const GRAPH: Readonly<Record<string, FakeModule>> = {
  app: { isEntry: true, importedIds: ['taro'] },
  page: { importedIds: ['taro', 'preflight'], dynamicallyImportedIds: ['rxdb'] },
  wrapper: { importedIds: ['taro'] },
  taro: {},
  preflight: { importedIds: ['runtime'] },
  runtime: {},
  rxdb: { importedIds: ['rxjs', 'runtime'] },
  rxjs: {}
};

function importersOf(id: string, key: 'importedIds' | 'dynamicallyImportedIds'): string[] {
  return Object.entries(GRAPH)
    .filter(([, module]) => module[key]?.includes(id))
    .map(([importer]) => importer);
}

function moduleInfo(id: string) {
  const module = GRAPH[id];
  if (!module) return null;
  return {
    id,
    isEntry: false,
    importedIds: [],
    dynamicallyImportedIds: [],
    importers: importersOf(id, 'importedIds'),
    dynamicImporters: importersOf(id, 'dynamicallyImportedIds'),
    ...module
  };
}

const META = { getModuleIds: () => Object.keys(GRAPH).values(), getModuleInfo: moduleInfo } as never;

describe('staticallyReachableModules', () => {
  it('从模块图的根（入口，或没有任何引用者的模块）沿静态 import 走，动态 import 的子树不算，共用模块算静态', () => {
    expect([...staticallyReachableModules(Object.keys(GRAPH), moduleInfo as never)].sort()).toEqual([
      'app',
      'page',
      'preflight',
      'runtime',
      'taro',
      'wrapper'
    ]);
  });

  it('模块图里查不到的 id 直接报错，不当成懒加载', () => {
    expect(() => staticallyReachableModules(['page', 'ghost'], moduleInfo as never)).toThrow(/ghost/);
  });
});

describe('lazyManualChunks', () => {
  const original = (id: string) => (id === 'taro' ? 'taro' : 'common');

  it('静态可达的模块交给原来的分包规则', () => {
    const chunks = lazyManualChunks(original);
    expect(chunks('taro', META)).toBe('taro');
    expect(chunks('runtime', META)).toBe('common');
    expect(chunks('page', META)).toBe('common');
  });

  it('只经动态 import 可达的模块全部并进懒加载 chunk，不管原规则怎么分', () => {
    const chunks = lazyManualChunks(original);
    expect(chunks('rxdb', META)).toBe(LAZY_CHUNK_NAME);
    expect(chunks('rxjs', META)).toBe(LAZY_CHUNK_NAME);
  });

  it('可达集合每次分包只算一次', () => {
    let reads = 0;
    const meta = {
      getModuleIds: () => {
        reads += 1;
        return Object.keys(GRAPH).values();
      },
      getModuleInfo: moduleInfo
    } as never;
    const chunks = lazyManualChunks(original);
    chunks('taro', meta);
    chunks('rxjs', meta);
    expect(reads).toBe(1);
  });
});

type Hook = (this: unknown, ...args: unknown[]) => unknown;

function outputOptionsHook(plugin: ReturnType<typeof lazyChunkVitePlugin>): Hook {
  const value = plugin.outputOptions;
  if (typeof value !== 'function') throw new Error('插件没有函数形态的 outputOptions');
  return value as Hook;
}

const errorContext = {
  error(message: string): never {
    throw new Error(message);
  }
};

describe('lazyChunkVitePlugin', () => {
  it('outputOptions 包住 Taro 的 manualChunks，其余输出选项不动', () => {
    const output = outputOptionsHook(lazyChunkVitePlugin()).call(errorContext, {
      format: 'cjs',
      manualChunks: () => 'vendors'
    }) as { format: string; manualChunks: (id: string, meta: unknown) => unknown };

    expect(output.format).toBe('cjs');
    expect(output.manualChunks('runtime', META)).toBe('vendors');
    expect(output.manualChunks('rxjs', META)).toBe(LAZY_CHUNK_NAME);
  });

  it('Taro 没给函数形态的 manualChunks 时报错，不另起一套分包', () => {
    const outputOptions = outputOptionsHook(lazyChunkVitePlugin());

    expect(() => outputOptions.call(errorContext, {})).toThrow(/manualChunks/);
    expect(() => outputOptions.call(errorContext, { manualChunks: { vendors: ['react'] } })).toThrow(/manualChunks/);
  });
});

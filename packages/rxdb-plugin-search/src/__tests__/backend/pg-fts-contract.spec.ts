import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_FTS_ARRAY_KIND,
  DEFAULT_FTS_REGCONFIG,
  FTS_COLUMN,
  loadPgFtsDdl
} from '../../backend/pg/pg-fts-contract.js';

/**
 * 动态取而不是 `import ... from`：Nx 的 `enforce-module-boundaries` 会拦下对
 * 「别处被惰性加载的库」的静态引入，而惰性加载正是本文件要守的性质。
 * 拿到的是同一个模块命名空间对象，下面的恒等断言照样成立。
 */
const adapterFts = await import('@aiao/rxdb-adapter-pglite/fts');

/**
 * `pg-fts-contract.ts` 里那三个常量是从 `@aiao/rxdb-adapter-pglite/fts` **抄**过来的，
 * 为的是不把可选 peer 依赖拖进静态加载图。抄写的代价是可能漂移，这套用例就是抵押品：
 * 适配器那边改了值或改了名，这里当场变红。
 *
 * 本包把适配器列为 devDependency，所以这条 spec 一定跑得到——而运行时代码永远不会
 * 静态解析那个说明符。
 */
describe('pg-fts-contract mirrors the pglite adapter (US-703 AC#1)', () => {
  it('every locally declared constant equals the adapter’s value', () => {
    expect(FTS_COLUMN).toBe(adapterFts.FTS_COLUMN);
    expect(DEFAULT_FTS_REGCONFIG).toBe(adapterFts.DEFAULT_FTS_REGCONFIG);
    expect(DEFAULT_FTS_ARRAY_KIND).toBe(adapterFts.DEFAULT_FTS_ARRAY_KIND);
  });

  it('lazily resolves the two DDL builders, which stay shared rather than copied', async () => {
    const ddl = await loadPgFtsDdl();
    expect(ddl.buildCreateFtsTableSql).toBe(adapterFts.buildCreateFtsTableSql);
    expect(ddl.buildFtsTriggersSql).toBe(adapterFts.buildFtsTriggersSql);
  });

  it('no runtime module statically imports the optional pglite peer', async () => {
    // 只用 sqlite adapter 的下游同样会 import 本包的 barrel。任何一处静态 import 都会
    // 让打包器去解析一个它没装的包——三个框架绑定包的 spec 就是这么整片变红的。
    // `import()` 允许出现（安装期才走到），`import ... from` 不允许。
    const runtimeFiles = [
      'pg-fts-contract.ts',
      'pg-backend.ts',
      'pg-runtime.ts',
      'pg-engine.ts',
      'pg-search-sql.ts',
      'pg-query-compiler.ts',
      'pg-statements.ts'
    ];
    for (const file of runtimeFiles) {
      const source = await readFile(new URL(`../../backend/pg/${file}`, import.meta.url), 'utf8');
      expect(source, file).not.toMatch(/^\s*import\s[^(]*from\s+'@aiao\/rxdb-adapter-pglite/m);
    }
  });
});

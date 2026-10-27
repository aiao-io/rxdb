import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

/**
 * iOS 微信的 `WXWebAssembly` 不支持导出 Global：实例的 exports 里没有它们，glue 读 `.value` 时直接抛
 * `undefined is not an object`，开发者工具模拟器用的是标准 WebAssembly，测不出来。
 * `@subframe7536/sqlite-wasm` 1.4.0 的 glue 开始把 `_sqlite3_version` 改成读导出 Global，iOS 真机初始化即失败。
 * 这里盯住 adapter 实际加载的那份 glue，升级依赖时先在这里红。
 */
const EXPORTED_GLOBAL_READ = /wasmExports\[\s*["'][^"']+["']\s*\]\.value/g;

function pinnedGlueSource(): string {
  const loader = readFileSync(new URL('../subframe-glue.ts', import.meta.url), 'utf8');
  const specifier = /'(@subframe7536\/sqlite-wasm\/dist\/wa-sqlite-[^']+\.js)'/.exec(loader)?.[1];
  if (!specifier) throw new Error('subframe-glue.ts 里找不到 glue 的 import');
  const require = createRequire(new URL('../../package.json', import.meta.url));
  return readFileSync(require.resolve(specifier), 'utf8');
}

describe('adapter 加载的 subframe glue', () => {
  it('不读取 wasm 导出的 Global（iOS WXWebAssembly 不导出 Global）', () => {
    expect(pinnedGlueSource().match(EXPORTED_GLOBAL_READ) ?? []).toEqual([]);
  });
});

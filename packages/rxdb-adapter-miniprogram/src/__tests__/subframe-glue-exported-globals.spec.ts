import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

/**
 * iOS 微信的 `WXWebAssembly` 不支持导出 Global：实例的 exports 里没有它们，glue 读 `.value` 时直接抛
 * `undefined is not an object`，开发者工具模拟器用的是标准 WebAssembly，测不出来。
 * `@subframe7536/sqlite-wasm` 1.4.0 的原始 glue 把 `_sqlite3_version` 改成读导出 Global，iOS 真机初始化即失败。
 * adapter 加载的是 `src/vendor/` 里的固化副本（回退随包发布），这里把副本里守卫读的那段代码取出来
 * 放进隔离作用域执行——条件写错（比如先读 `versionGlobal.value` 再判空）会在缺失场景下直接抛，
 * 而不是只按文本猜。
 */
const UPSTREAM_UNGUARDED_READ = 'Module["_sqlite3_version"] = wasmExports["$e"].value';
const GUARD_BLOCK =
  /const versionGlobal = wasmExports\["\$e"\];\s*Module\["_sqlite3_version"\] =\s*[\s\S]*?Module\["_sqlite3_libversion"\]\(\);/;

function vendoredGlueSource(): string {
  const loader = readFileSync(new URL('../subframe-glue.ts', import.meta.url), 'utf8');
  const specifier = /'(\.\/vendor\/wa-sqlite-[^']+\.js)'/.exec(loader)?.[1];
  if (!specifier) throw new Error('subframe-glue.ts 里找不到 vendor glue 的 import');
  return readFileSync(new URL(`../${specifier}`, import.meta.url), 'utf8');
}

/** 取出固化副本里守卫读的语句段，在隔离作用域里执行并返回 `_sqlite3_version`。 */
function runGuardBlock(wasmExports: Record<string, unknown>, libversion: () => string): string {
  const source = vendoredGlueSource();
  const block = GUARD_BLOCK.exec(source)?.[0];
  if (!block) throw new Error('vendor glue 里找不到 _sqlite3_version 的守卫读');
  return runInNewContext(`${block}\nModule["_sqlite3_version"]`, {
    wasmExports,
    Module: { _sqlite3_libversion: libversion }
  }) as string;
}

describe('adapter 加载的 vendor glue', () => {
  it('上游未守卫的直接读不存在', () => {
    expect(vendoredGlueSource()).not.toContain(UPSTREAM_UNGUARDED_READ);
  });

  it('导出 Global 存在时读它的 value', () => {
    expect(runGuardBlock({ $e: { value: '3.54.1' } }, () => '3.54.1-libversion')).toBe('3.54.1');
  });

  it('Global 缺失时回退到 sqlite3_libversion（iOS WXWebAssembly 不导出 Global）', () => {
    expect(runGuardBlock({}, () => '3.54.1-libversion')).toBe('3.54.1-libversion');
  });
});

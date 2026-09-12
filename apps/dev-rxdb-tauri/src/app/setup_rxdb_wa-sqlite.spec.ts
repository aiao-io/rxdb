import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * setup_rxdb_wa-sqlite.ts 的接线门禁（US-905 AC#6 强制档）。
 *
 * @remarks
 * 这个模块的 `default()` 要建真 RxDB、开真 worker，单测环境跑不动；它要守的接线
 * 只有三处，而且写坏后只在打包窗口里以「档位没生效」的形态暴露 —— 所以像
 * `setup_rxdb.spec.ts` 的按需加载门禁一样走**静态**断言。决策逻辑本身是纯函数，
 * 在 `wa-sqlite-backend.spec.ts` 里有行为级测试，这里只钉接线。
 */
const read = (file: string): string => readFileSync(resolve(import.meta.dirname, file), 'utf8');

const stripTsComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[^'"`\n]*?\/\/.*$/gm, '');

describe('US-905 强制 VFS 档的 wa-sqlite 接线', () => {
  it('default 接受强制档参数，并交给 resolveWaSqliteBackend 决定后端', () => {
    const source = read('setup_rxdb_wa-sqlite.ts');
    expect(source).toMatch(/export default \(forced\?: DevToolsForcedVfs\) =>/);
    expect(source).toMatch(/resolveWaSqliteBackend\(forced, checkOPFSAvailable, typeof SharedWorker === 'function'\)/);
  });

  it('强制档下 devtools 挂接按真实运行时上报，而不是写死 browser', () => {
    // 强制档让本模块在真 Tauri 窗口里也被选中（见 setup_rxdb.ts 的候选表），runtime 写死
    // 'browser' 会让面板把 tauri 窗口误报成浏览器来源 —— AC#6 的 wire 观察判据当场失效。
    const source = stripTsComments(read('setup_rxdb_wa-sqlite.ts'));
    expect(source).toContain("isTauriRuntime(globalThis) ? 'tauri' : 'browser'");
  });
});

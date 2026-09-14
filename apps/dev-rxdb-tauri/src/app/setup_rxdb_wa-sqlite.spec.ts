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
    expect(source).toMatch(/export default async \(forced\?: DevToolsForcedVfs\) =>/);
    expect(source).toMatch(/resolveWaSqliteBackend\(forced, checkOPFSAvailable, typeof SharedWorker === 'function'\)/);
  });

  it('强制档下 devtools 挂接按真实运行时上报，而不是写死 browser', () => {
    // 强制档让本模块在真 Tauri 窗口里也被选中（见 setup_rxdb.ts 的候选表），runtime 写死
    // 'browser' 会让面板把 tauri 窗口误报成浏览器来源 —— AC#6 的 wire 观察判据当场失效。
    const source = stripTsComments(read('setup_rxdb_wa-sqlite.ts'));
    expect(source).toContain('const isTauri = isTauriRuntime(globalThis);');
    expect(source).toContain("isTauri ? 'tauri' : 'browser'");
  });

  it('Tauri 窗口下 storage 走 worker 写通道的 OPFS 后端，浏览器预览保持插件默认', () => {
    // 强制档是让本模块出现在真 Tauri 窗口里的唯一原因；WKWebView 没有 `createWritable`，
    // 插件默认的 OPFS 后端写不进去 —— storage 探针会在那里把三个档位全部打成 failed，
    // 且错误长得一模一样。写通道改走 worker 的 `createSyncAccessHandle`（WKWebView 的
    // worker 里有、页面上没有），读与目录操作仍委托插件默认后端 —— 文件与 metadata
    // 都留在 WebView 存储域里，AC#9 的备份域不裂开。经**动态** import 接入：静态 import
    // 会把 worker 装配拖进浏览器预览 bundle，正是 US-207 E11 要挡的。
    const source = stripTsComments(read('setup_rxdb_wa-sqlite.ts'));
    expect(source).toContain("await import('./opfs-worker-filesystem')");
    expect(source).toMatch(/createOpfsWorkerFilesystem\(\)/);
    expect(source).toMatch(/\.use\(rxDBPluginStorage, storageOptions\)/);
    expect(source).not.toMatch(/^import .*opfs-worker-filesystem/m);
  });

  it('Tauri 宿主下 devtools 挂接经动态 import 挂中继传输', () => {
    // 没有传输，connector 不会去连 Rust 中继：面板窗口发来的 HELLO 无人应答，握手永不
    // 完成 —— AC#6 的 wire 观察（HANDSHAKE 帧里的 descriptors）因此一个字段都拿不到。
    // 桌面那条路在装配时显式传同一份传输，这里按宿主动态补上。动态 import 的原因与
    // storage 门禁相同：静态 import 会把 Tauri connector 客户端拖进浏览器预览 bundle。
    const source = stripTsComments(read('setup_rxdb_wa-sqlite.ts'));
    expect(source).toContain("await import('../devtools/tauri-connector-transport')");
    expect(source).toMatch(/transport: createTauriConnectorTransport\(\)/);
    expect(source).not.toMatch(/^import .*tauri-connector-transport/m);
  });

  it('强制档的 storage 文件域按档位分根，避免跨档同域互撞', () => {
    // opfs / idb 两档的 metadata 各在各自的库里（OPFS 库 vs IDB 库），文件却落在同一个
    // WebView 存储域；同根下前档留下的探针文件会让后档的首次上传报「文件已存在」——
    // 幂等探针的前提（metadata 与文件同域）因此不成立。分根让两档的文件域与它们本就
    // 不同的 metadata 域对齐；unavailable 档开不起库、写不到文件，也照分根，三档不搞
    // 特例。文件根不受 wire 观察（descriptors 只报 kind/runtime），不影响 AC#6 判据。
    const source = stripTsComments(read('setup_rxdb_wa-sqlite.ts'));
    expect(source).toMatch(/forced === undefined \? 'files' : `files-\$\{forced\}`/);
  });

  it('强制 idb 档走 dedicated Worker；SharedWorker 存在性检查只守生产路径', () => {
    // 强制档是单窗口的实测脚手架，共享语义没有意义；三平台首跑实测里 idb 档在 win32 上
    // 挂在 SharedWorker 传输、60s 看门狗报 timedOut（AC#6 平台事实表由那次回填），
    // 强制档因此改走与 opfs 档同形态的 dedicated Worker。生产路径（浏览器无 OPFS 回落到
    // IDB）保留 SharedWorker 让多标签页共享同一条连接——`new SharedWorker` 需要存在性检查：
    // WKWebView 没有它时缺检查就是一条裸 ReferenceError，而那条专门写好的诊断只有
    // unavailable 档能到（AC#6 三态走查里 idb 档的意义就是给出可读的 VFS 诊断，
    // 不是让错误形态取决于平台）。
    const source = stripTsComments(read('setup_rxdb_wa-sqlite.ts'));
    expect(source).toContain('resolveWaSqliteIdbTransport(forced)');
    expect(source).toMatch(/transport === 'shared' && typeof SharedWorker !== 'function'/);
    expect(source).toMatch(/throw new Error\('wa-sqlite requires OPFS or SharedWorker support'\)/);
    expect(source).toContain("name: 'rxdb-wa-sqlite-idb-worker'");
  });
});

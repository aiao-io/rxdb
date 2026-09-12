import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * US-905 AC#1 / AC#8：devtools 窗口 / 专用 command / capability 的 release 隔离——结构证据。
 *
 * @remarks
 * 这里锁的是**源码结构**：`#[cfg(dev)]` 在 command 与窗口两侧一起消失、capability 只授
 * `rxdb-devtools` 且不继承 `main` 的 `core:default`。为什么是结构证据而不是去翻 release 二进制：
 *
 * - release 二进制会把前端产物编进去，而主 app 的 JS bundle 里就有 `devtools_message` 这个
 *   `invoke` 命令名字符串（connector 侧传输适配器用）——拿 `strings` 去搜它必然命中，
 *   但那命中的是 renderer 侧的字符串，不是 Rust 侧的 command 注册。用二进制字符串当判据
 *   会把「renderer 还留着一句会失败的调用」误报成「专用 command 还在」。
 * - 真正决定「release 是否注册这条 command」的是 Rust 侧的 `#[cfg(dev)]`：它在
 *   `custom-protocol`（release）构建里把函数与 `generate_handler!` 的臂一起抹掉。这一事实
 *   只能从源码静态地证，且由 `cargo check --features tauri/custom-protocol` 在 PR 门禁里复验。
 *
 * 因此本文件是纯静态检查，不 spawn 打包产物——它跟真实 Tauri build 环境解耦，任何 runner
 * 上都能跑。真实窗口开/关/重开、双 WebView 握手与 session 释放属于阶段 2 / AC#17 的 smoke，
 * 不在这里。
 *
 * @module apps/dev-rxdb-tauri-e2e/devtools-release-isolation
 */

/** `apps/dev-rxdb-tauri/src-tauri` 的绝对路径。 */
const SRC_TAURI = join(import.meta.dirname, '..', '..', 'dev-rxdb-tauri', 'src-tauri');

/** 读一份 capability 文件并解析成对象；读不到或解析失败直接抛。 */
const readCapability = (name: string): { windows: readonly string[]; permissions: readonly string[] } => {
  const raw = readFileSync(join(SRC_TAURI, 'capabilities', name), 'utf8');
  return JSON.parse(raw) as { windows: readonly string[]; permissions: readonly string[] };
};

/** 读 `src-tauri/src/lib.rs` 原文。 */
const libRs = (): string => readFileSync(join(SRC_TAURI, 'src', 'lib.rs'), 'utf8');

/** 该行是否是一条非注释行、且带着 `#[cfg(dev)]` 属性。 */
const hasCfgDev = (line: string): boolean => !line.trim().startsWith('//') && line.includes('#[cfg(dev)]');

/**
 * 该处提及是否**没有被 cfg 守**。
 *
 * 从提及行往回走：先撞上 `#[cfg(dev)]`（同一 item 体内的局部 cfg，如 `setup` 里的
 * `let devtools_config` 与插件 match 块首）即被守；撞上函数定义行则看它头上有没有 cfg
 * （`open_devtools_window` 整体被守、其体内的提及离块首 cfg 不止几行）；撞上顶格
 * 闭括号（当前 item 的边界）即无守。注释行一概跳过——注释里引用的 `#[cfg(dev)]`
 * 字样不是属性。
 */
const isUnguarded = (lines: readonly string[], index: number): boolean => {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const prior = lines[cursor];
    if (prior.trim().startsWith('//')) continue;
    if (hasCfgDev(prior)) return false;
    if (/^\s*fn\s/.test(prior)) {
      const attribute = cursor > 0 ? lines[cursor - 1] : undefined;
      return attribute === undefined || !hasCfgDev(attribute);
    }
    if (/^}/.test(prior)) return true;
  }
  return true;
};

describe('US-905 devtools 的 release 隔离（结构证据）', () => {
  it('default capability 只授 main 窗口，不授 rxdb-devtools', () => {
    const capability = readCapability('default.json');
    expect(capability.windows).toEqual(['main']);
    expect(capability.windows).not.toContain('rxdb-devtools');
  });

  it('devtools capability 只授 rxdb-devtools，且不继承 main 的 core:default', () => {
    const capability = readCapability('devtools.json');
    expect(capability.windows).toEqual(['rxdb-devtools']);
    // 最小授权：只有 event 通道，没有 core:default —— 调试窗口拿不到 window 控制、SQL、filesystem。
    expect(capability.permissions).toEqual(['core:event:default']);
    expect(capability.permissions).not.toContain('core:default');
  });

  it('devtools_message 命令是 #[cfg(dev)]，release 不注册', () => {
    const lib = libRs();
    // 命令定义带 #[cfg(dev)]（在 #[tauri::command] 之前）。
    expect(/#\[cfg\(dev\)\]\s+#\[tauri::command\]\s+fn devtools_message/.test(lib)).toBe(true);
    // generate_handler! 列表里对应臂也带 #[cfg(dev)]，否则 release 仍会引用一个不存在的函数。
    expect(/#\[cfg\(dev\)\]\s+devtools_message/.test(lib)).toBe(true);
  });

  it('open_devtools_window 是 #[cfg(dev)]，release 无窗口入口', () => {
    expect(/#\[cfg\(dev\)\]\s+fn open_devtools_window/.test(libRs())).toBe(true);
  });

  it('wire 驱动脚本只进 dev 二进制：include_str! 与注入点都在 #[cfg(dev)] 下（阶段 2）', () => {
    const lib = libRs();

    // `include_str!` 把脚本**内容**编进二进制。这一条一旦丢了 cfg，那段测试脚手架就会
    // 随 release 一起发出去——这正是 D1 不把驱动放进面板 bundle 的理由（面板产物整份
    // 嵌在 frontendDist 里），在 Rust 这侧不能自己再破一次。
    expect(/#\[cfg\(dev\)\]\s+const DEVTOOLS_DRIVER_SCRIPT: &str = include_str!/.test(lib)).toBe(true);
    // 注入点在 `open_devtools_window` 里，而那个函数整体已是 #[cfg(dev)]（上一条用例）。
    expect(lib).toContain('builder.initialization_script(DEVTOOLS_DRIVER_SCRIPT)');
  });

  it('DevTools 授权档模块与插件注册两侧都是 #[cfg(dev)]，release 既不读 env 也不注入全局键', () => {
    const lib = libRs();
    // 模块声明与注册两处都要带：只带一处的话，release 要么编不过（引用不存在的模块），
    // 要么把一段读 `DEV_RXDB_DEVTOOLS*` 的代码连同那个全局键一起发给用户。
    expect(/#\[cfg\(dev\)\]\s+mod devtools_config;/.test(lib)).toBe(true);
    expect(/#\[cfg\(dev\)\]\s+let devtools_config = devtools_config::plan_or_exit\(\);/.test(lib)).toBe(true);
    expect(/#\[cfg\(dev\)\]\s+let builder = match &devtools_config/.test(lib)).toBe(true);

    // 判据的另一半：不能**另有**一条没带 cfg 的路径提到这个模块。上面三条只说明
    // 「这三处带了 cfg」，挡不住第四处；而第四处正是 release 把整段代码带进产物的形态。
    //
    // 判定用 isUnguarded 往回扫：插件注册那两行（`Some(config) => …` / `None => builder`）
    // 在 match 块里，往回先撞到块首那个 cfg；`open_devtools_window` 调用点的实参行离
    // cfg 有四行（fn 名跨多行），函数体内的提及离块首 cfg 更远——都靠「撞上函数定义
    // 行时看它头上有没有 cfg」兜住，而不是数行号。
    const lines = lib.split('\n');
    const unguarded = lines.filter(
      (line, index) => line.includes('devtools_config') && !line.trim().startsWith('//') && isUnguarded(lines, index)
    );
    expect(unguarded).toEqual([]);

    // 全局键只存在于 `devtools_config.rs`（本身整个 #[cfg(dev)]），不该泄进接线文件。
    expect(lib).not.toContain('__aiaoRxdbDevToolsConfig__');
  });

  it('档位三开关只定义在 devtools_config.rs，驱动档位键不进接线文件（阶段 1 收尾）', () => {
    const lib = libRs();
    const config = readFileSync(join(SRC_TAURI, 'src', 'devtools_config.rs'), 'utf8');
    const envNames = [
      'DEV_RXDB_DEVTOOLS_PROVIDER_SOURCE',
      'DEV_RXDB_DEVTOOLS_SNAPSHOT_SCENARIO',
      'DEV_RXDB_DEVTOOLS_FORCE_VFS'
    ];
    // 三个档位开关都定义在被整体 #[cfg(dev)] 的 devtools_config 模块里……
    for (const name of envNames) expect(config).toContain(name);
    // ……而接线文件里一处都不能出现：读 env 的代码只准住在那一个模块里，
    // lib.rs 上的任何出现都是「release 也在读档位开关」的形态。
    for (const name of envNames) expect(lib).not.toContain(name);
    // 驱动档位键同样只存在于 devtools_config.rs（`driver_init_script` 生成的注入脚本读它）；
    // 驱动脚本里读键的那一行随 `include_str!` 走，那条路已有 #[cfg(dev)] 用例锁着。
    expect(config).toContain('__aiaoRxdbDevToolsDriverConfig__');
    expect(lib).not.toContain('__aiaoRxdbDevToolsDriverConfig__');
  });

  it('devtools 入口只在 dev 窗口加载，不进主 app 的单入口构建', () => {
    // `devtools.html` 由独立的 `vite.config.devtools.mts` 单独打包成 `devtools/` 子目录；
    // 主 app 走 `@angular/build:application` 的 `src/main.ts` 单入口，不把 `src/devtools/main.ts`
    // 编进去。这里只锁住「窗口 URL 指向 App 资源」，真正的产物隔离由 project.json 的
    // `build-devtools` target + `WebviewUrl::App("devtools/devtools.html")` 共同成立。
    expect(libRs()).toContain('devtools/devtools.html');
  });
});

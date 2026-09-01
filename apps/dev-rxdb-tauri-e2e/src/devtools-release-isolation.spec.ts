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

  it('devtools 入口只在 dev 窗口加载，不进主 app 的单入口构建', () => {
    // `devtools.html` 由独立的 `vite.config.devtools.mts` 单独打包成 `devtools/` 子目录；
    // 主 app 走 `@angular/build:application` 的 `src/main.ts` 单入口，不把 `src/devtools/main.ts`
    // 编进去。这里只锁住「窗口 URL 指向 App 资源」，真正的产物隔离由 project.json 的
    // `build-devtools` target + `WebviewUrl::App("devtools/devtools.html")` 共同成立。
    expect(libRs()).toContain('devtools/devtools.html');
  });
});

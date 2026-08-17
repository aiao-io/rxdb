/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * 打包产物跨进程 smoke 的独立配置（US-210 AC#1 / AC#9）。
 *
 * @remarks
 * **文件名刻意不叫 `vitest.config.mts`**：`@nx/vitest` 插件的发现 glob 是
 * `**\/{vite,vitest}.config.{js,ts,mjs,mts,cjs,cts}`，一旦命中就会自动推断出一个 `test`
 * target，而 `ci-template.yml` 正是用 `nx show projects --withTarget=test` 组 PR 门禁矩阵 ——
 * 本套件会被拖进每个 PR 跑一次 Rust release 编译。同样的理由，`dev-rxdb-tauri` 的一致性
 * 套件也叫 `vitest.conformance.mts`。
 *
 * 不用 Playwright：这里不驱动任何 UI，只有 `spawn` 一个二进制 + 读一份 JSON 报告。
 * Tauri 的窗口里没有 CDP/WebDriver 端点可接（那是 `tauri-driver` 的活，且它在 macOS 上不可用），
 * 所以自检结论走的是「Rust 侧写报告文件 + 进程退出码」这条进程级通道。
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-tauri-e2e',
  test: {
    name: 'dev-rxdb-tauri-e2e',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    reporters: ['default'],
    // 一次启动要跑完 Angular bootstrap + 建库 + 写入 + 退出；用例本身还要串两次。
    // Rust 侧看门狗是 60s，这里必须给得比「两次启动 + 看门狗」更宽，否则超时的是 vitest，
    // 拿到的就只有一句「测试超时」而不是那份写着原因的报告。
    testTimeout: 240_000,
    hookTimeout: 240_000
  }
});

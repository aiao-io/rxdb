/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * dev 产物的 DevTools 双 WebView 套件（US-905 阶段 1 AC#1 / AC#2）。
 *
 * @remarks
 * 与 `vitest.smoke.mts` 分开，是因为两者驱动的是**两份能力不同的产物**：
 * smoke 跑 `target/release`（`tauri build`，带 `custom-protocol` feature，
 * 因此 `cfg(dev)` 不成立、调试窗口不存在）；本套件跑 `target/debug`（裸 `cargo build`，
 * 调试窗口在）。合成一个配置只会让「这条断言看的是哪一份产物」不可读。
 *
 * 文件名同样刻意不叫 `vitest.config.mts`，理由见 `vitest.smoke.mts` 的头注。
 *
 * 没有 `globalSetup` 预热：预热脚本拉的是 release 产物，对这里没有意义；
 * 本套件只启动一次，冷启动成本由 `beforeAll` 自己的超时覆盖。
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-tauri-e2e-devtools',
  test: {
    name: 'dev-rxdb-tauri-e2e-devtools',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/devtools-window-transport.spec.ts'],
    reporters: ['default'],
    fileParallelism: false,
    // 一次冷启动要跑完 Angular bootstrap + 建库 + 等调试窗口握手（探针预算 20s），
    // Rust 侧看门狗是 60s。给得比它宽，超时的才不会是 vitest 本身——
    // 那样拿到的只有一句「测试超时」，而不是那份写着原因的报告。
    testTimeout: 240_000,
    hookTimeout: 240_000
  }
});

/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * Rust 宿主一致性套件的独立配置（US-210）。
 *
 * 为什么不并进 `vite.config.mts`：那份配置跑的是 `happy-dom` 里的 Angular 组件测试，
 * 而这里要 `spawn` 一个 Rust 二进制、读写临时目录 —— 需要 node 环境，也需要 Rust 工具链。
 * 合在一起会让 `dev-rxdb-tauri:test` 平白多出一条工具链依赖。
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/apps/dev-rxdb-tauri-conformance',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'dev-rxdb-tauri-conformance',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['conformance/**/*.spec.ts'],
    // 每个 spec 文件起一个独立的宿主进程与临时工作区，因此文件之间可以并行；
    // 单个文件内部必须串行，套件本身就是这么写的。
    reporters: ['default'],
    // 走真实进程 + 真实磁盘，比 in-process 的 `node:sqlite` 慢一档：
    // 默认 5s 会在最重的迁移套件上假阳性。
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});

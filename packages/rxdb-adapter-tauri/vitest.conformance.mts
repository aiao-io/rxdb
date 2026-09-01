/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

/**
 * Rust 宿主一致性套件的独立配置（US-210）。
 *
 * 为什么不并进 `vite.config.mts`：那份配置既是包的构建配置也是它的单测配置，跑的是纯
 * renderer 侧的代码；而这里要 `spawn` 一个 Rust 二进制、读写临时目录 —— 需要 Rust 工具链。
 * 合在一起会让 `rxdb-adapter-tauri:test` 平白多出一条工具链依赖，本来只想跑单测的人
 * 得先装 cargo。
 *
 * 套件与被测的 Rust 宿主同住 `packages/rxdb-adapter-tauri/`：线协议的两端一起改、一起发，
 * 证明两端一致的用例自然也归在这里（US-210 T4）。
 */
export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/packages/rxdb-adapter-tauri-conformance',
  resolve: { tsconfigPaths: true },
  test: {
    name: 'rxdb-adapter-tauri-conformance',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['conformance/**/*.spec.ts'],
    // 每个 spec 文件起一个独立的宿主进程与临时工作区，因此文件之间可以并行；
    // 单个文件内部必须串行，套件本身就是这么写的。
    reporters: ['default'],
    // `storage-large-file.spec.ts`（US-505 AC#5）要证明「内容不整体进 JS 堆」，
    // 而不强制回收测到的是 GC 的调度节奏：同一份实现两次运行能差一个数量级。
    // 开关加在这里而不是某条命令行上，是为了让直接跑该文件的人也拿得到它。
    execArgv: ['--expose-gc'],
    // 走真实进程 + 真实磁盘，比 in-process 的 `node:sqlite` 慢一档：
    // 默认 5s 会在最重的迁移套件上假阳性。
    // 52 MiB 那两条另有更宽的单条超时，不在这里放宽全局——放宽了，真挂住的用例
    // 也要等三分钟才报。
    testTimeout: 60_000,
    hookTimeout: 60_000
  }
});

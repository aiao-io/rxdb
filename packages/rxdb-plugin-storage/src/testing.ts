/**
 * @fileoverview 共享测试套件入口，供包外的后端实现证明自己与内置后端行为一致。
 *
 * @remarks
 * 目前只导出一件东西：整组 storage 行为断言（{@link storageBackendParitySuite}）。
 * `apps/dev-rxdb-tauri` 用它把同一份断言压到真实 Rust 宿主进程上——套件只写一遍，
 * 三个后端各跑一次，「换后端不改行为」这句话才有凭据（US-504 AC#2 / US-505 AC#2）。
 *
 * 本入口依赖 `vitest`，**只在测试环境使用**：它不从主入口再导出，也不会进产品 bundle。
 *
 * @module rxdb-plugin-storage/testing
 */

export {
  isTemporaryStorageName,
  storageBackendParitySuite,
  type ParityBackend
} from './__tests__/storage-backend-parity.suite.js';

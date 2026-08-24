/**
 * @fileoverview HTTP 远端适配器包入口（US-212）。
 *
 * v1 只服务 `SyncType.QueryCache` 的 remote 槽位：远端是权威源，本地 sqlite 行缓存由
 * 使用方**独立注册**。changelog / 分支同步（Full、Filter）一律 unsupported throw，
 * 不返回空数组或 `0` 装作「远端无变更」。
 *
 * 各模块导出约定：
 * - `errors.ts`           → `HttpAdapterError` 及具体错误子类（**判别位是类名**）
 * - `http.interface.ts`   → handler、配置与适配器选项类型
 * - `config.ts`           → 六个数值配置的默认值
 * - `RxDBAdapterHttp.ts`  → `RxDBAdapterHttp` 适配器主体与 `ADAPTER_NAME`
 * - `rest.ts`             → REST 资源 URL 模板工厂（阶段 B AC#27），产出的仍是普通 handler
 *
 * 翻页（`pagination.ts`）、分块（`chunking.ts`）、metadata 规范化（`metadata.ts`）与
 * 条件请求缓存（`conditional-cache.ts`）是实现细节，不出现在公共 API 上：它们的终止条件、
 * fail-fast 判据与「调用方之间不共享对象」是本包对上层的担保，一旦可被外部替换，
 * 那些担保就没有单一负责人了。
 */

export { DEFAULT_HTTP_CONFIG } from './config.js';
export * from './errors.js';
export * from './http.interface.js';
export * from './rest.js';
export * from './RxDBAdapterHttp.js';

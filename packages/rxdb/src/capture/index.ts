/**
 * @fileoverview 写捕获的**接缝**：核心这一侧的装卸机制与两道转交门。
 *
 * @remarks
 * 本目录与 `@aiao/rxdb-plugin-working-tree` 的分界不是文件数量，而是**谁改它**：
 *
 * - 这里的东西随**核心的写原语**变——多一个 `RxDBAdapterLocalBase` 写方法、挂载点换一种包法，
 *   改的是这里。它们归核心，因为 `setWorkingTreeCaptureHook()` 就在核心的适配器基类上，
 *   搬走等于核心反向依赖插件。
 * - 插件那一侧的东西随**捕获规则**变——哪些表受保护、一次写算不算净变更、
 *   行 11 对 QueryCache 是放是拒。整套随 `@aiao/rxdb-plugin-working-tree` 走。
 *
 * 于是本目录一个捕获语义都不认识：{@link WorkingTreeCaptureHook} 上没有域、没有实体归类，
 * 只有四个挂载点、一次认领与两道原样转交的门。没装插件的库上，这里的每一样东西都停在
 * 「槽位是 `undefined`」这一步——五个写原语连一层包装都没有。
 */
export * from './capture-interceptor.js';
export * from './raw-write-gate.js';

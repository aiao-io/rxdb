/**
 * @fileoverview 两个本地后端的逻辑库名。
 *
 * @remarks
 * 单独成文件，是 US-207 E11 的直接要求：候选表要在**不加载**任何建库工厂的前提下
 * 报出各自的库名（`selectLocalBackend` 拿它查重、卡片拿它显示）。若把常量留在
 * `setup_rxdb_desktop.ts` / `setup_rxdb_wa-sqlite.ts` 里，`setup_rxdb.ts` 就得静态
 * import 它们 —— 动态 `import()` 也就白做了，两个后端的实现照样进同一个 chunk。
 *
 * 反过来让工厂从 `setup_rxdb.ts` 里 import 常量则会成环。故单独一个无依赖的模块。
 *
 * @module db-names
 */

/**
 * 桌面后端的逻辑库名（落盘为 `rxdb-data/desktop_demo@<schema>.sqlite3`）。
 *
 * @remarks
 * 与浏览器预览的 {@link WEB_PREVIEW_DB_NAME} **必须不同名**，这条已由 `selectLocalBackend`
 * 的候选表校验强制：两个候选写的是两份永不互通的物理存储（主进程的原生文件 vs 渲染进程的
 * OPFS），共用一个逻辑名等于让「现在连的是哪个库」这个问题没有答案。
 *
 * 取值与 Tauri demo 的同名常量一致 —— 两个 demo 摆在一起时库名对得上，差别才真的只剩宿主。
 */
export const DESKTOP_DEMO_DB_NAME = 'desktop_demo';

/**
 * 浏览器预览后端（wa-sqlite）的逻辑库名。
 *
 * @remarks
 * 沿用其余 demo 的 `test_6`，方便与浏览器版 demo 对照同一份数据结构。
 */
export const WEB_PREVIEW_DB_NAME = 'test_6';

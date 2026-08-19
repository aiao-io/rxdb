/**
 * @fileoverview 两个本地后端的逻辑库名。
 *
 * @module db-names
 *
 * @remarks
 * 单独成文件，是因为候选表（`setup_rxdb.ts`）需要在**不加载**任一建库模块的前提下
 * 说出它们的库名 —— 那两个模块经由动态 `import()` 加载（US-207 E11），从这里静态
 * 取名字就等于把它们连同各自的适配器一起拉回首包，代码分割白做。
 *
 * 反过来让建库模块从 `setup_rxdb.ts` 取名字会成环。所以名字落在一个谁都能引、
 * 自己不引任何东西的模块里。
 */

/**
 * 桌面后端的逻辑库名（落盘为 `rxdb-data/desktop_demo@<schema>.sqlite3`）。
 *
 * @remarks
 * 与浏览器预览的 {@link WEB_PREVIEW_DB_NAME} **必须不同名**，且这条已经由
 * `selectLocalBackend` 的候选表校验强制：两个候选写的是两份永不互通的物理存储
 * （Rust 宿主的原生文件 vs WebView 的 OPFS），共用一个逻辑名等于让
 * 「现在连的是哪个库」这个问题没有答案。
 *
 * 取值与 Electron demo 的同名常量一致 —— 两个 demo 摆在一起时，磁盘布局与库名都
 * 对得上，差别才真的只剩宿主。
 */
export const DESKTOP_DEMO_DB_NAME = 'desktop_demo';

/**
 * 浏览器预览后端的逻辑库名（落在 WebView 的 OPFS/IDB 里）。
 *
 * @remarks
 * 与其余三个 web demo 取同一个名字。
 */
export const WEB_PREVIEW_DB_NAME = 'test_6';

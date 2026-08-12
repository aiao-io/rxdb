/**
 * @packageDocumentation
 * RxDB 版本信息
 */

/**
 * RxDB 运行时版本号，`rxdb.version` 的返回值。
 *
 * @remarks
 * 必须与 `package.json` 的 `version` 保持一致，由 `__tests__/version.spec.ts` 断言防漂移。
 * 发版改动 `package.json` 时同步改这里。
 */
export const RXDB_VERSION = '0.0.25';

/**
 * 本地数据库名后缀（`<dbName>@<suffix>`）。
 *
 * @remarks
 * **这个值被永久冻结，任何改动都是一次破坏性数据迁移。**
 *
 * 它进入 IndexedDB / OPFS 的物理库名。改一个字符，所有既有用户下次打开应用时
 * 连到的是一个全新的空库 —— 旧数据不会报错、不会提示，只是再也找不到。
 *
 * 历史上它由 `RXDB_VERSION.replace(/\./g, '_')` 推导，而 `RXDB_VERSION` 长期停在
 * `'0.0.15'`（`package.json` 已到 `0.0.21`）。这个 bug 恰好把后缀钉死在 `0_1`，
 * 于是线上所有库名都是 `<dbName>@0_1`。修正 `RXDB_VERSION` 的同时必须把后缀
 * 从版本号解耦出来，否则「修一个错版本号」会变成「静默清空所有用户数据」。
 *
 * 要改动它，必须先有数据迁移方案；`__tests__/version.spec.ts` 的断言会拦住无意识的修改。
 */
export const RXDB_DB_NAME_SUFFIX = '0_1';

/**
 * 说这套桌面 host 协议的适配器名登记表。
 *
 * @remarks
 * 名字本身仍归各运行时包所有（`@aiao/rxdb-adapter-electron` 的 `ELECTRON_ADAPTER_NAME`、
 * `@aiao/rxdb-adapter-tauri` 的 `TAURI_ADAPTER_NAME`），共享层不替它们定名——这里登记的是
 * 另一件事：**谁在说这套协议**。
 *
 * 之所以要有这张表，是因为第三方需要按「本地适配器是不是桌面的」做判定，而它们不该
 * 为了读两个字符串常量就装上两个运行时包。`@aiao/rxdb-plugin-storage/desktop` 就是这样一个
 * 第三方：文件后端与 metadata 库必须落在同一个备份域，错配时要拒绝启用（US-504 AC#9 /
 * US-505 AC#11），而它自己只依赖协议层。
 *
 * 表与各包的 `ADAPTER_NAME` 靠 `satisfies` 对齐，任一端改名而另一端没跟上都是编译错误。
 *
 * @module desktop-adapter-name
 */

/**
 * 说这套桌面 host 协议的适配器名。
 *
 * @remarks
 * 名字按 `<引擎>-<运行时>` 构成，与 `@aiao/rxdb-adapter-miniprogram` 的
 * `wa-sqlite-miniprogram` 同构。US-208 的 `pglite-electron` 走的是另一套事务语义，
 * 不在本表内；它若要复用桌面**文件**后端，届时由那个故事判断该不该加进来。
 */
export const DESKTOP_HOST_ADAPTER_NAMES = ['sqlite-electron', 'sqlite-tauri'] as const;

/** 说这套桌面 host 协议的适配器名。 */
export type DesktopHostAdapterName = (typeof DESKTOP_HOST_ADAPTER_NAMES)[number];

/**
 * 判断一个适配器名是否属于桌面 host 协议。
 *
 * @param value - 任意值，通常来自运行期的 `sync.local.adapter` 配置
 * @returns 是登记在册的桌面适配器名时为 `true`
 */
export function isDesktopHostAdapterName(value: unknown): value is DesktopHostAdapterName {
  return DESKTOP_HOST_ADAPTER_NAMES.includes(value as DesktopHostAdapterName);
}

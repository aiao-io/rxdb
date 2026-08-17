import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 一次应用启动 = 一行记录。
 *
 * @remarks
 * 这是 US-210 AC#1「数据在应用重启后仍然存在」在 demo 里的可见形态：每次启动追加一行、
 * 读回总行数 —— 数字随重启递增，就说明数据真的落在了 Rust 宿主持有的 SQLite 文件里，
 * 而不是 WebView 的 OPFS / IndexedDB。
 *
 * 判据必须是**跨进程的累计计数**，不能是「写一条读一条」：后者在单次启动内恒为真，
 * 而 US-207 正是靠累计计数抓到过「库目录名与 Chromium 撞车 → 每次启动一个全新空库、
 * 应用照常显示已连接」这种静默丢数据。
 *
 * 与 `apps/dev-rxdb-electron/src/app/desktop-launch.entity.ts` 逐字同名（实体名、表名、
 * 字段名）：两个桌面 demo 的磁盘布局可比，才谈得上「换掉的只是宿主」。
 */
@Entity({
  name: 'DesktopLaunch',
  tableName: 'desktop_launch',
  properties: [{ name: 'startedAt', type: PropertyType.string, required: true }]
})
export class DesktopLaunch extends EntityBase {
  /** 本次启动的时间戳（ISO 8601）。 */
  startedAt!: string;
}

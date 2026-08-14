import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 一次应用启动 = 一行记录。
 *
 * @remarks
 * 这是 US-207 AC#1「数据在应用重启后仍然存在」在 demo 里的可见形态：
 * 每次启动追加一行，页面显示总行数 —— 数字随重启递增，就说明数据真的落在了
 * 主进程持有的 SQLite 文件里，而不是渲染进程的 OPFS / IndexedDB。
 *
 * 刻意不复用 `@aiao/rxdb-test` 里的 `Todo`：那个类已经绑在 wa-sqlite 那个实例上，
 * 同一个实体类注册到两个 RxDB 实例后，`new Todo()` 无从判断目标库而直接抛错。
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

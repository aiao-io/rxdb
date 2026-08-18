import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

/**
 * 一次应用启动 = 一行记录。
 *
 * @remarks
 * 这是 US-207 AC#1「数据在应用重启后仍然存在」在 demo 里的可见形态：
 * 每次启动追加一行，页面显示总行数 —— 数字随重启递增，就说明数据真的落在了
 * 主进程持有的 SQLite 文件里，而不是渲染进程的 OPFS / IndexedDB。
 *
 * 两个后端（`sqlite-electron` / `wa-sqlite`）都注册这个实体：本次运行只会选中其中一个
 * （US-207 E11），另一个没建表就等于这条计数在那条路径上写不进去 —— 而同一份页面代码
 * 在两条路径上应当行为一致，差别只在数据落到哪里。
 *
 * 写入一律走 `entityManager.instantiate(DesktopLaunch, …)` 而不是 `new DesktopLaunch()`：
 * 裸构造要靠实体类自己回溯目标库，这条路径把实例上下文显式带进构造函数，与库的数量无关。
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

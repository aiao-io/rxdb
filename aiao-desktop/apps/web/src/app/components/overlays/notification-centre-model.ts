import type { AppNotification, NotificationSource } from '../../services/app-notifications';

/**
 * 通知中心分组的纯函数模型（ADESK-US-206 阶段 D）：把通知条目按来源应用分组、判断滑动手势是否越过清除阈值。
 * 不依赖 Angular 组件：组件与单测共用；spec 在 Node 环境里跑，直接 import 组件会拉起 JIT 与 PlatformLocation。
 */

/** 横向滑动超过这个距离（像素）就清除通知，macOS 的滑动手势。 */
export const SWIPE_THRESHOLD_PX = 80;

/** 横向滑动的距离是否达到清除阈值。 */
export function swipedPast(distance: number): boolean {
  return distance >= SWIPE_THRESHOLD_PX;
}

/** 通知中心里按来源应用分好的一组条目。 */
export interface NotificationGroup {
  /** 来源应用（组头显示它的名称与图标）。 */
  readonly app: NotificationSource;
  /** 组内条目，保持原来的先后（新的在前）。 */
  readonly notes: AppNotification[];
}

/**
 * 把条目按来源应用分组：组按该应用最新一条出现的先后排列（最新有通知的应用在最上），
 * 组内保持条目原来的顺序。空列表得到空数组。
 */
export function groupNotifications(entries: readonly AppNotification[]): NotificationGroup[] {
  const groups: NotificationGroup[] = [];
  const lastAt = new Map<string, number>();
  entries.forEach((note, index) => {
    const group = groups.find(candidate => candidate.app.id === note.app.id);
    if (group) group.notes.push(note);
    else groups.push({ app: note.app, notes: [note] });
    lastAt.set(note.app.id, index);
  });
  /* 组按每个应用最新一条出现的位置排序：最近有通知的应用在最上。 */
  return groups.sort((left, right) => (lastAt.get(right.app.id) ?? -1) - (lastAt.get(left.app.id) ?? -1));
}

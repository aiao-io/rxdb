import type { DESKTOP_LIMITS } from '@aiao/orbit/desktop';
import { Service, signal } from '@angular/core';

/**
 * 通知中心的限额。数值取自 Orbit 的协议常量 `DESKTOP_LIMITS.notification`：这里把类型写成协议常量的字面量类型，
 * Orbit 改了数值这里就编译不过，单测再逐项核对。不在运行时引入 Orbit 的桌面能力模块——
 * 它随远程应用的窗口按需装载，通知中心在首屏里。
 */
type NotificationLimits = (typeof DESKTOP_LIMITS)['notification'];
const PER_MINUTE: NotificationLimits['perMinute'] = 10;
const WINDOW_MS: NotificationLimits['windowMs'] = 60_000;
const ENTRIES_PER_APP: NotificationLimits['entriesPerApp'] = 20;

/** 通知的来源应用：名称与图标取自登记表，不是应用自己填的，所以应用不能冒名。 */
export interface NotificationSource {
  /** 应用 ID。 */
  readonly id: string;
  /** 登记表里的应用名。 */
  readonly name: string;
  /** 登记表里的应用图标（图标精灵里的 symbol ID）。 */
  readonly icon: string;
}

/** 应用提交的通知内容（已经过协议层的校验）。 */
export interface NotificationContent {
  /** 标题。 */
  readonly title: string;
  /** 正文。 */
  readonly body: string;
  /** 通知自己的图片：桌面登记的图标 ID，或内联图片（`data:image/…;base64,…`）。 */
  readonly icon?: string;
  /** 去重键。 */
  readonly dedupeKey?: string;
}

/** 通知中心里的一条应用通知。 */
export interface AppNotification {
  /** 条目标识。 */
  readonly id: string;
  /** 来源应用（归属调用方，不是应用自称的）。 */
  readonly app: NotificationSource;
  /** 标题。 */
  readonly title: string;
  /** 正文。 */
  readonly body: string;
  /** 通知自己的图标 ID；没有或是内联图片时为 `null`。 */
  readonly symbol: string | null;
  /** 通知自己的内联图片；没有或是图标 ID 时为 `null`。 */
  readonly image: string | null;
  /** 去重键；没有为 `null`。 */
  readonly dedupeKey: string | null;
  /** 提交时间。 */
  readonly postedAt: Date;
}

/** 提交的结果：成功带条目标识，同一应用的提交频率超限时被拒绝。 */
export type NotificationPost =
  { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: 'rate-limited' };

/**
 * 通知中心里的应用通知（ADESK-US-206 阶段 D，`notification` 能力）：条目归属调用方应用，显示该应用的名称与图标；
 * 同一应用相同的 `dedupeKey` 覆盖旧条目；同一应用每分钟提交的条数有上限；每个应用在通知中心里最多保留固定条数，超出的旧条目被挤掉。
 *
 * 已提交的通知留在通知中心由用户清除，不随提交它的窗口或应用关闭而撤回。
 * 状态只在内存里，属于当前标签页：**刷新页面后不保留**，别的标签页看不到。
 */
@Service({ autoProvided: false })
export class AppNotifications {
  private readonly entriesState = signal<readonly AppNotification[]>([]);
  private readonly recent = new Map<string, number[]>();
  private sequence = 0;

  /** 通知中心里的全部应用通知，新的在前。 */
  readonly entries = this.entriesState.asReadonly();

  /** 提交一条通知。同一应用在一分钟内提交满限额之后被拒绝（被拒绝的提交不占限额）。 */
  post(source: NotificationSource, content: NotificationContent): NotificationPost {
    const now = Date.now();
    const recent = (this.recent.get(source.id) ?? []).filter(at => now - at < WINDOW_MS);
    this.recent.set(source.id, recent);
    if (recent.length >= PER_MINUTE) return { ok: false, reason: 'rate-limited' };
    recent.push(now);
    const entry = this.entryOf(source, content, new Date(now));
    this.entriesState.update(list => this.insert(list, entry));
    return { ok: true, id: entry.id };
  }

  /** 用户清除一条通知。 */
  clear(id: string): void {
    this.entriesState.update(list => list.filter(entry => entry.id !== id));
  }

  /** 用户清除全部通知。 */
  clearAll(): void {
    this.entriesState.set([]);
  }

  private entryOf(source: NotificationSource, content: NotificationContent, postedAt: Date): AppNotification {
    const image = content.icon?.startsWith('data:image/') ? content.icon : null;
    return {
      id: `n${++this.sequence}`,
      app: { id: source.id, name: source.name, icon: source.icon },
      title: content.title,
      body: content.body,
      symbol: content.icon !== undefined && image === null ? content.icon : null,
      image,
      dedupeKey: content.dedupeKey ?? null,
      postedAt
    };
  }

  /** 新条目排最前；同一应用相同去重键的旧条目被覆盖；这个应用超出保留条数的旧条目被挤掉。 */
  private insert(list: readonly AppNotification[], entry: AppNotification): AppNotification[] {
    const replaced = (other: AppNotification) =>
      entry.dedupeKey !== null && other.app.id === entry.app.id && other.dedupeKey === entry.dedupeKey;
    let kept = 0;
    return [entry, ...list.filter(other => !replaced(other))].filter(
      other => other.app.id !== entry.app.id || ++kept <= ENTRIES_PER_APP
    );
  }
}

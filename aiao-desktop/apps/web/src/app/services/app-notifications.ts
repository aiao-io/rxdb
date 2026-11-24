import type { DESKTOP_LIMITS } from '@aiao/orbit/desktop';
import { DestroyRef, ErrorHandler, Service, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { Preferences } from '../data/preferences';
import type { DesktopAppId } from './desktop-apps';
import { WindowManager } from './window-manager';

/**
 * 通知中心的限额。数值取自 Orbit 的协议常量 `DESKTOP_LIMITS.notification`：这里把类型写成协议常量的字面量类型，
 * Orbit 改了数值这里就编译不过，单测再逐项核对。不在运行时引入 Orbit 的桌面能力模块——
 * 它随远程应用的窗口按需装载，通知中心在首屏里。
 */
type NotificationLimits = (typeof DESKTOP_LIMITS)['notification'];
const PER_MINUTE: NotificationLimits['perMinute'] = 10;
const WINDOW_MS: NotificationLimits['windowMs'] = 60_000;
const ENTRIES_PER_APP: NotificationLimits['entriesPerApp'] = 20;

/** 横幅栈最多同时显示的条数（同一应用只留最新一条，新的在最上）。 */
export const MAX_BANNERS = 3;
/** 通知中心持久化时最多保存的条数（跨应用，新的在前）。 */
export const MAX_PERSISTED_ENTRIES = 50;
/** 通知中心的持久化键：条目列表（{@link serializeEntries} 产出的 JSON），跨标签页共享。 */
export const NOTIFICATIONS_ENTRIES_KEY = 'notifications:entries';
/** 专注模式（勿扰）的持久化键：布尔。开启时新通知不弹横幅，但仍进通知中心。 */
export const FOCUS_DND_KEY = 'focus:dnd';
/** 条目的改动在写回偏好表之前的防抖（毫秒）：合并同一批提交与清除。 */
const SAVE_DELAY = 250;

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

/** 顶部右侧的通知横幅：与通知中心条目同 id，点横幅打开来源应用。 */
export interface NotificationBanner {
  /** 与对应通知中心条目相同的标识。 */
  readonly id: string;
  /** 来源应用（名称与图标取自登记表）。 */
  readonly app: NotificationSource;
  /** 标题。 */
  readonly title: string;
  /** 正文。 */
  readonly body: string;
}

/** 可持久化的通知条目：{@link AppNotification} 的 `postedAt` 换成毫秒数，读回来再还原成 `Date`。 */
export interface StoredNotification {
  readonly id: string;
  readonly app: NotificationSource;
  readonly title: string;
  readonly body: string;
  readonly symbol: string | null;
  readonly image: string | null;
  readonly dedupeKey: string | null;
  readonly postedAt: number;
}

/** 提交的结果：成功带条目标识，同一应用的提交频率超限时被拒绝。 */
export type NotificationPost =
  { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: 'rate-limited' };

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isArray = (value: unknown): value is unknown[] => Array.isArray(value);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isNullableString = (value: unknown): value is string | null => value === null || typeof value === 'string';
const isSource = (value: unknown): value is NotificationSource =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  typeof value['name'] === 'string' &&
  typeof value['icon'] === 'string';
const isStoredNotification = (value: unknown): value is StoredNotification =>
  isRecord(value) &&
  typeof value['id'] === 'string' &&
  isSource(value['app']) &&
  typeof value['title'] === 'string' &&
  typeof value['body'] === 'string' &&
  isNullableString(value['symbol']) &&
  isNullableString(value['image']) &&
  isNullableString(value['dedupeKey']) &&
  typeof value['postedAt'] === 'number' &&
  Number.isFinite(value['postedAt']);

/**
 * 把一条横幅放进队列：同一应用只留最新一条（旧的被替换），队列最多 {@link MAX_BANNERS} 条，新的在最前。
 */
export function pushBanner(
  queue: readonly NotificationBanner[],
  banner: NotificationBanner
): readonly NotificationBanner[] {
  return [banner, ...queue.filter(item => item.app.id !== banner.app.id)].slice(0, MAX_BANNERS);
}

/**
 * 把通知中心里的条目序列化成偏好表可存的 JSON：新的在前，最多 {@link MAX_PERSISTED_ENTRIES} 条。
 */
export function serializeEntries(entries: readonly AppNotification[]): StoredNotification[] {
  return entries.slice(0, MAX_PERSISTED_ENTRIES).map(entry => ({
    id: entry.id,
    app: entry.app,
    title: entry.title,
    body: entry.body,
    symbol: entry.symbol,
    image: entry.image,
    dedupeKey: entry.dedupeKey,
    postedAt: entry.postedAt.getTime()
  }));
}

/**
 * 校验并还原偏好表里的通知条目：不是数组或形状不符的条目丢弃，最多取前 {@link MAX_PERSISTED_ENTRIES} 条。
 * 偏好表里存的是不可信输入，任何字段缺了或类型不对都跳过那一行，不让坏数据进通知中心。
 */
export function parseEntries(value: unknown): AppNotification[] {
  if (!isArray(value)) return [];
  const entries: AppNotification[] = [];
  for (const item of value.slice(0, MAX_PERSISTED_ENTRIES)) {
    if (!isStoredNotification(item)) continue;
    entries.push({
      id: item.id,
      app: item.app,
      title: item.title,
      body: item.body,
      symbol: item.symbol,
      image: item.image,
      dedupeKey: item.dedupeKey,
      postedAt: new Date(item.postedAt)
    });
  }
  return entries;
}

/**
 * 启动恢复时把库里存下的旧条目并进当前条目：按 id 去重，整体按 `postedAt` 新的在前（时间相同的保持原有相对顺序），
 * 最多 {@link MAX_PERSISTED_ENTRIES} 条。库里存的顺序不可信，恢复后必须回到「新的在前」的展示顺序；
 * 时间与序号同向（新条目序号更大、时间更晚），排在前面的就是更新的。
 */
export function mergeEntries(
  current: readonly AppNotification[],
  stored: readonly AppNotification[]
): AppNotification[] {
  const known = new Set(current.map(entry => entry.id));
  return [...current, ...stored.filter(entry => !known.has(entry.id))]
    .sort((left, right) => right.postedAt.getTime() - left.postedAt.getTime())
    .slice(0, MAX_PERSISTED_ENTRIES);
}

/**
 * 从恢复的条目里找回最大序号，让新条目的 `n<N>` 标识不与恢复的冲突。
 */
export function sequenceAfter(entries: readonly AppNotification[]): number {
  let sequence = 0;
  for (const entry of entries) {
    const match = /^n(\d+)$/.exec(entry.id);
    const number = match ? Number(match[1]) : 0;
    if (number > sequence) sequence = number;
  }
  return sequence;
}

/**
 * 通知中心里的应用通知（ADESK-US-206 阶段 D，`notification` 能力）：条目归属调用方应用，显示该应用的名称与图标；
 * 同一应用相同的 `dedupeKey` 覆盖旧条目；同一应用每分钟提交的条数有上限；每个应用在通知中心里最多保留固定条数，超出的旧条目被挤掉。
 *
 * 已提交的通知留在通知中心由用户清除，不随提交它的窗口或应用关闭而撤回。条目持久化到偏好表
 * （{@link NOTIFICATIONS_ENTRIES_KEY}，JSON，上限 {@link MAX_PERSISTED_ENTRIES} 条）：启动时恢复，跨标签页共享；
 * 同一应用新提交的同去重键条目覆盖旧的，别的应用提交的频率窗口从会话开始重新计。
 *
 * 每条新通知同时在顶部右侧的横幅栈里入队（{@link banners}），5 秒后自动消失、点横幅打开来源应用；
 * 专注模式（勿扰，{@link focusMode}）开启时不弹横幅，但条目照常进通知中心。
 */
@Service({ autoProvided: false })
export class AppNotifications {
  private readonly preferences = inject(Preferences);
  private readonly windows = inject(WindowManager);
  private readonly errors = inject(ErrorHandler);
  private readonly entriesState = signal<readonly AppNotification[]>([]);
  private readonly bannersState = signal<readonly NotificationBanner[]>([]);
  private readonly focusState = signal(false);
  private readonly recent = new Map<string, number[]>();
  private sequence = 0;
  /** 启动恢复完成；之前条目的改动不写回（等恢复合并之后 effect 会再看一遍）。 */
  private readonly restored = signal(false);
  /** 有改动在等防抖写回。 */
  private pending = false;
  private saveTimer: ReturnType<typeof setTimeout> | undefined;

  /** 通知中心里的全部应用通知，新的在前。 */
  readonly entries = this.entriesState.asReadonly();
  /** 顶部右侧的横幅队列，新的在前。 */
  readonly banners = this.bannersState.asReadonly();
  /** 专注模式（勿扰）：开启时新通知仍进通知中心，但不弹横幅。 */
  readonly focusMode = this.focusState.asReadonly();

  constructor() {
    effect(() => {
      const snapshot = serializeEntries(this.entriesState());
      if (this.restored()) untracked(() => this.schedule(snapshot));
    });
    /* 库不可用时恢复与写回都不做：原因由 DesktopData.problem 与阻断界面说明，这里再报一次只会让每个服务各抛一次同样的错。 */
    this.preferences.ready.then(
      () => this.restore(),
      () => undefined
    );
    this.preferences.external$
      .pipe(
        filter(keys => keys.includes(NOTIFICATIONS_ENTRIES_KEY) || keys.includes(FOCUS_DND_KEY)),
        takeUntilDestroyed()
      )
      .subscribe(() => this.adoptExternal());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.saveTimer));
  }

  /** 提交一条通知。同一应用在一分钟内提交满限额之后被拒绝（被拒绝的提交不占限额）。 */
  post(source: NotificationSource, content: NotificationContent): NotificationPost {
    const now = Date.now();
    const recent = (this.recent.get(source.id) ?? []).filter(at => now - at < WINDOW_MS);
    this.recent.set(source.id, recent);
    if (recent.length >= PER_MINUTE) return { ok: false, reason: 'rate-limited' };
    recent.push(now);
    const entry = this.entryOf(source, content, new Date(now));
    this.entriesState.update(list => this.insert(list, entry));
    /* 专注模式（勿扰）开启时不弹横幅，条目照常进通知中心。 */
    if (!this.focusState())
      this.bannersState.update(queue =>
        pushBanner(queue, { id: entry.id, app: entry.app, title: entry.title, body: entry.body })
      );
    return { ok: true, id: entry.id };
  }

  /** 用户清除一条通知；它的横幅（还在栈里的话）一并消失。 */
  clear(id: string): void {
    this.entriesState.update(list => list.filter(entry => entry.id !== id));
    this.dismissBanner(id);
  }

  /** 用户清除全部通知；横幅栈一并清空。 */
  clearAll(): void {
    this.entriesState.set([]);
    this.bannersState.set([]);
  }

  /** 用户关掉一条横幅（×）；通知中心里的条目还在。 */
  dismissBanner(id: string): void {
    this.bannersState.update(queue => queue.filter(banner => banner.id !== id));
  }

  /** 点横幅：关掉它，并打开来源应用（已经开着的窗口被调到前台）。 */
  bannerOpen(id: string): void {
    const banner = this.bannersState().find(item => item.id === id);
    this.dismissBanner(id);
    if (banner) this.windows.open(banner.app.id as DesktopAppId);
  }

  /** 开关专注模式（勿扰）：写入 `focus:dnd` 偏好，刷新与别的标签页都随之可见。 */
  setFocusMode(on: boolean): void {
    if (this.focusState() === on) return;
    this.focusState.set(on);
    this.preferences.set(FOCUS_DND_KEY, on).catch((error: unknown) => this.errors.handleError(error));
  }

  /** 偏好表读完之后的启动恢复：库里存下的旧条目并进当前条目，整体按时间新的在前（库里读完之前的新提交在前），专注模式与序号一并找回。 */
  private restore(): void {
    const stored = parseEntries(this.preferences.get(NOTIFICATIONS_ENTRIES_KEY, isArray));
    if (stored.length) this.entriesState.set(mergeEntries(this.entriesState(), stored));
    this.sequence = Math.max(this.sequence, sequenceAfter(this.entriesState()));
    const focus = this.preferences.get(FOCUS_DND_KEY, isBoolean);
    if (focus !== undefined) this.focusState.set(focus);
    this.restored.set(true);
  }

  /** 别的标签页写了通知或专注模式：采用库里的现状。本标签页有没写出的改动时不采用——它写出之后才是最后一次提交。 */
  private adoptExternal(): void {
    if (!this.restored() || this.pending) return;
    const stored = parseEntries(this.preferences.get(NOTIFICATIONS_ENTRIES_KEY, isArray));
    this.entriesState.set(stored);
    this.sequence = Math.max(this.sequence, sequenceAfter(stored));
    const focus = this.preferences.get(FOCUS_DND_KEY, isBoolean);
    if (focus !== undefined) this.focusState.set(focus);
  }

  private schedule(snapshot: readonly StoredNotification[]): void {
    clearTimeout(this.saveTimer);
    /* 与库里一样就不必写：刚从库里恢复、刚采用了别的标签页的条目、改了又改回去。
       库里没有这个键（或值不是数组）时等于空列表——`JSON.stringify(undefined)` 是 `undefined` 不是文本，直接拿去比会把
       空列表误判成「有改动在等写回」，{@link adoptExternal} 就再也不会采用别的标签页写进库里的现状。 */
    const stored = this.preferences.get(NOTIFICATIONS_ENTRIES_KEY, isArray);
    const baseline = JSON.stringify(stored ?? []);
    this.pending = JSON.stringify(snapshot) !== baseline;
    if (!this.pending) return;
    this.saveTimer = setTimeout(() => this.write(), SAVE_DELAY);
  }

  private write(): void {
    this.pending = false;
    const snapshot = serializeEntries(this.entriesState());
    this.preferences.set(NOTIFICATIONS_ENTRIES_KEY, snapshot).catch((error: unknown) => this.errors.handleError(error));
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

import { DestroyRef, InjectionToken, Service, effect, inject, signal, untracked } from '@angular/core';

import { DesktopData } from '../data/desktop-data';
import { Preferences } from '../data/preferences';
import { SystemPreference } from '../data/system-preference.entity';
import { DESKTOP_APPS, DesktopOpenOptions } from './desktop-apps';
import { FileSystem } from './file-system';
import { Session } from './session';
import { Toast } from './toast';
import {
  STALE_LAYOUT_AFTER,
  SkippedWindow,
  TabStorage,
  WINDOW_LAYOUT_PREFIX,
  WINDOW_LAYOUT_VERSION,
  WindowLayout,
  WindowRecord,
  buildWindows,
  describeSkipped,
  parseLayout,
  resolveOpenOptions,
  restoreOptionsOf,
  restoreSteps,
  staleLayoutRows,
  tabSessionId,
  windowLayoutKey
} from './window-layout-model';
import { WindowManager } from './window-manager';

/**
 * 本标签页的会话存储（`sessionStorage`）：标签页会话标识放在这里，刷新后不变，新开的标签页各自不同；
 * 浏览器的「重新打开关闭的标签页」会带回原标签页的会话存储。浏览器禁用站点数据时读取它会抛错，此时为 `null`，布局保存停用。
 */
export const TAB_STORAGE = new InjectionToken<TabStorage | null>('TAB_STORAGE', {
  providedIn: 'root',
  factory: () => {
    try {
      return sessionStorage;
    } catch {
      return null;
    }
  }
});

/**
 * 恢复窗口时两个窗口之间让出主线程的方式，默认让给下一个宏任务（浏览器先去渲染、响应输入）。
 * 单测换成可手动放行的版本，才看得到“逐个”恢复。
 */
export const RESTORE_YIELD = new InjectionToken<() => Promise<void>>('RESTORE_YIELD', {
  providedIn: 'root',
  factory: () => () => new Promise<void>(resolve => setTimeout(resolve, 0))
});

/** 布局变化后等多久才写回：连续拖动、缩放、切换窗口只在停手后写一次。 */
const SAVE_DELAY = 400;

const UNAVAILABLE_NOTICE = 'Window positions won’t be remembered: this browser blocks tab storage.';
const UNREADABLE_NOTICE = 'Couldn’t read the saved window layout, so the desktop starts fresh.';
const SAVE_FAILED_NOTICE = 'Couldn’t save the window layout.';

type StoredJson = object | string | number | boolean | null;

/** 偏好里的原始内容可以是任何 JSON（损坏的、更新版本写的），交给 `parseLayout` 判断；这里只排除“没有这一行”。 */
const present = (value: unknown): value is StoredJson => value !== undefined;

/** 一个要恢复的窗口：布局记录，加上已经把磁盘节点取回来的开窗参数。 */
interface PlannedWindow {
  readonly record: WindowRecord;
  readonly options: DesktopOpenOptions;
}

/** 此刻窗口的快照：布局记录（按层叠从后到前），以及这些窗口的 id。 */
interface Collected {
  readonly windows: readonly WindowRecord[];
  readonly ids: ReadonlySet<string>;
}

/**
 * 窗口布局的持久化与恢复（ADESK-US-104）：每个标签页把自己的窗口布局——应用、几何、最小化与缩放状态、开窗参数、
 * 前台窗口与层叠顺序——存进系统偏好 `windows:layout:<会话标识>`，刷新后据此恢复。
 *
 * **按标签页分开**：会话标识放在 `sessionStorage`（刷新不变，新开的标签页各自不同），键里带着它，所以只读写自己的键，
 * 标签页之间既不覆盖也不同步，新标签页从空桌面开始。会话存储取不到时不退回任何共享的键：停用布局保存并提示。
 * 已知限制：浏览器的“复制标签页”会连会话存储一起复制，两个标签页因此共用一个标识（各自恢复出同一份布局，之后后写的覆盖先写的）。
 *
 * **写回**：窗口列表、层叠、几何、最小化 / 缩放状态或开窗参数变了，停手 0.4 秒后写一次；用户主动关闭的窗口立即从布局里移除；
 * 页面隐藏、关闭时调用 {@link flush} 把待写的立刻写出去。恢复完成之前不写，免得把还没恢复出来的空桌面写成布局。
 *
 * **恢复**（{@link restore}，桌面启动流程后段，磁盘挂好之后）：先恢复前台窗口并立即装载，其余可见窗口按原来的层叠从上到下
 * 逐个恢复（每个之间让出主线程，不阻塞桌面交互），最小化的窗口最后、只重建外框（第一次还原才装载）。重型应用
 * （清单声明 `restore: 'deferred'`）只重建外框，第一次点击窗口才装载，哪怕它是前台窗口。几何按当前视口拉回屏幕内。
 * 清单里已下线的应用、读不懂的记录、打开的文件已不在磁盘上的窗口被跳过，桌面可见后给一条提示。
 *
 * **遗留的布局行**：关掉的标签页会留下它的布局行。恢复完成后顺手清掉其他标签页超过 30 天没更新的行
 * （阈值与理由见 {@link STALE_LAYOUT_AFTER}），读不懂的行不动。
 */
@Service({ autoProvided: false })
export class WindowLayoutStore {
  private readonly wm = inject(WindowManager);
  private readonly preferences = inject(Preferences);
  private readonly data = inject(DesktopData);
  private readonly fs = inject(FileSystem);
  private readonly toast = inject(Toast);
  private readonly session = inject(Session);
  private readonly apps = inject(DESKTOP_APPS);
  private readonly pause = inject(RESTORE_YIELD);
  /** 等桌面看得见了再弹的提示（开机画面和登录界面盖着时弹了也看不到）。 */
  private readonly notice = signal<string | null>(null);
  private started: Promise<number> | null = null;
  /** 恢复完成才开始记录变化。 */
  private armed = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  /** 最近一次观察到（已写或待写）的窗口记录的 JSON；`null` 表示库里的内容需要被覆盖。 */
  private latest: string | null = null;
  private openIds: ReadonlySet<string> = new Set();
  /** 上一次写库失败了：同一轮失败只提示一次，写成功后复位。 */
  private failing = false;

  /** 本标签页布局的偏好键；会话存储取不到时为 `null`，布局既不恢复也不保存。 */
  readonly key: string | null;

  constructor() {
    this.key = this.openTab(inject(TAB_STORAGE));
    effect(() => {
      const collected = this.collect();
      untracked(() => this.observe(collected));
    });
    effect(() => this.showNotice());
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  /**
   * 恢复上次刷新前的窗口，只做一次（重复调用得到同一个结果）。返回恢复出来的窗口数；
   * 返回 0 就是没有任何可恢复的窗口，桌面页据此打开默认的 Finder。
   * 偏好库不可用时不恢复也不保存（原因由阻断界面说明），同样返回 0。
   */
  restore(): Promise<number> {
    return (this.started ??= this.run());
  }

  /** 把待写的布局立刻写出去：页面隐藏、关闭时调用，免得停手之前的改动随页面一起丢了。 */
  flush(): void {
    if (!this.armed) return;
    this.observe(this.collect());
    if (this.timer !== undefined) this.save();
  }

  private async run(): Promise<number> {
    const key = this.key;
    if (key === null) return 0;
    try {
      await this.preferences.ready;
    } catch {
      /* 偏好库不可用：原因由数据阻断界面说明；这里不恢复、也不保存。 */
      return 0;
    }
    await this.fs.whenReady();
    const stored = this.preferences.get(key, present);
    const parsed = parseLayout(stored, this.apps);
    const planned = this.plan(parsed.windows);
    const skipped = [...parsed.skipped, ...planned.missing];
    this.notice.set(parsed.unreadable ? UNREADABLE_NOTICE : describeSkipped(skipped));
    await this.recreate(planned.windows);
    this.latest =
      stored === undefined ? '[]'
      : parsed.unreadable || skipped.length > 0 ? null
      : JSON.stringify(parsed.windows);
    this.armed = true;
    this.observe(this.collect());
    this.prune(key).catch((error: unknown) => console.error('清理遗留的窗口布局失败', error));
    return planned.windows.length;
  }

  /** 把磁盘上的节点取回来；打开的文件已经不在了的窗口去掉，记为跳过。 */
  private plan(records: readonly WindowRecord[]): { windows: PlannedWindow[]; missing: SkippedWindow[] } {
    const windows: PlannedWindow[] = [];
    const missing: SkippedWindow[] = [];
    for (const record of records) {
      const options = resolveOpenOptions(record.options, path => this.fs.nodeAt(path));
      if (options) windows.push({ record, options });
      else
        missing.push({
          name: record.options.file ?? record.options.nodePath?.at(-1) ?? record.name,
          reason: 'file-missing'
        });
    }
    return { windows, missing };
  }

  /** 按恢复的次序逐个重建窗口，窗口之间让出主线程；层叠位置取记录的，所以先后不影响最终的叠放。 */
  private async recreate(planned: readonly PlannedWindow[]): Promise<void> {
    const base = this.wm.reserveLayers(planned.length);
    const steps = restoreSteps(planned.map(item => item.record));
    for (const [index, step] of steps.entries()) {
      if (index > 0) await this.pause();
      const { record } = step;
      const win = this.wm.restore({
        appId: record.appId,
        options: planned[step.layer].options,
        box: record.box,
        minimized: record.minimized,
        zoomed: record.zoomed,
        layer: base + step.layer + 1,
        foreground: step.foreground
      });
      if (!win) throw new Error(`“${record.name}”的窗口无法恢复：清单里没有它的装载函数`);
    }
  }

  /** 会话存储里取（或生成）本标签页的标识；取不到就停用，并等桌面可见后提示。 */
  private openTab(storage: TabStorage | null): string | null {
    let key: string | null = null;
    if (storage) {
      try {
        key = windowLayoutKey(tabSessionId(storage));
      } catch {
        /* 会话存储读写出错（站点数据被禁用、配额）：不退回共享的键，同样停用，下面提示。 */
      }
    }
    if (key === null) this.notice.set(UNAVAILABLE_NOTICE);
    return key;
  }

  /** 此刻的窗口快照；在 effect 里调用时，窗口列表与每个窗口的相关信号都被跟踪。 */
  private collect(): Collected {
    const live = this.wm.windows().filter(win => !win.closing());
    const windows = buildWindows(
      live.map(win => ({
        appId: win.appId,
        name: win.app.name,
        layer: win.zIndex(),
        box: win.box(),
        minimized: win.minimized(),
        zoomed: win.zoomed(),
        options: win.restoreOptions() ?? restoreOptionsOf(win.options)
      }))
    );
    return { windows, ids: new Set(live.map(win => win.id)) };
  }

  /** 快照有实质变化才动作：有窗口被关闭立即写，其余防抖。 */
  private observe({ windows, ids }: Collected): void {
    if (!this.armed) return;
    const json = JSON.stringify(windows);
    const closed = [...this.openIds].some(id => !ids.has(id));
    this.openIds = ids;
    if (json === this.latest) return;
    this.latest = json;
    if (closed) this.save();
    else this.schedule();
  }

  private schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.save(), SAVE_DELAY);
  }

  private save(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    if (this.key === null) return;
    const layout: WindowLayout = {
      version: WINDOW_LAYOUT_VERSION,
      updatedAt: Date.now(),
      windows: this.collect().windows
    };
    this.preferences.set(this.key, layout).then(
      () => {
        this.failing = false;
      },
      () => this.reportSaveFailure()
    );
  }

  private reportSaveFailure(): void {
    if (this.failing) return;
    this.failing = true;
    this.toast.show(SAVE_FAILED_NOTICE);
  }

  /** 开机画面和登录界面退场之后才弹提示。 */
  private showNotice(): void {
    const message = this.notice();
    if (message === null || this.session.boot() !== null || this.session.locked()) return;
    this.toast.show(message);
    this.notice.set(null);
  }

  /**
   * 清掉其他标签页遗留的、超过 {@link STALE_LAYOUT_AFTER} 没更新的布局行。偏好服务只管内存里的副本，
   * 这些行属于别的标签页，本标签页从不读写它们，所以直接经仓储删除不会让副本失效。
   */
  private async prune(ownKey: string): Promise<void> {
    const repository = await this.data.repository(SystemPreference);
    const rows = await repository.find({
      where: { combinator: 'and', rules: [{ field: 'key', operator: 'startsWith', value: WINDOW_LAYOUT_PREFIX }] }
    });
    for (const row of staleLayoutRows(rows, ownKey, Date.now(), STALE_LAYOUT_AFTER)) await repository.remove(row);
  }
}

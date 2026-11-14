import { Observable, Subject, filter, map } from 'rxjs';

/**
 * 磁盘的跨标签页独占锁：同一个来源的所有标签页共用一个 OPFS 里的库文件，磁盘的每一次读写、首次复制内置内容与
 * 抹掉都在它里面执行（目录树加文件体是多步的复合操作，不能和别的标签页交错）。名字沿用磁盘当初用来互斥复制内置内容的锁。
 */
export const DISK_LOCK = 'aiao-desktop-disk';
/** 库的启动（连接、探测、建表、升级）：两个标签页同时打开桌面时只有一个在建表与升级。 */
export const STARTUP_LOCK = 'aiao-desktop-start';
/** 系统偏好的写入：先读这一行的现状再更新或新建，不能和别的标签页交错（键有唯一索引）。 */
export const PREFERENCES_LOCK = 'aiao-desktop-preferences';
/** 一个数据域的种子：检查完成标记与写入初始数据在同一把锁里，两个标签页不会各种一遍。 */
export const seedLock = (domain: string): string => `aiao-desktop-seed:${domain}`;

/** 广播通道的名字：同源的标签页都订阅它。 */
const CHANNEL_NAME = 'aiao-desktop:sync';

/**
 * 通知的主题，即哪一类共享数据被某个标签页写过：
 *
 * - `disk`：磁盘的目录树与文件体（含终端同步写回、抹掉）；
 * - `preferences`：系统偏好（外观等系统设置、桌面图标位置、Dock 布局、最近使用）。
 *
 * 各应用的记录（备忘录、提醒事项…）不在这里：它们的活查询由 RxDB 自己的跨标签页事件驱动。
 */
export type SyncTopic = 'disk' | 'preferences';

/** 一条跨标签页消息：谁发的、哪一类数据变了。不带数据本身——数据以库为准。 */
interface SyncMessage {
  readonly from: string;
  readonly topic: SyncTopic;
}

const TOPICS: readonly string[] = ['disk', 'preferences'] satisfies readonly SyncTopic[];

/** 通道里来的数据是不可信输入，结构和主题都对才算一条消息。 */
function isSyncMessage(value: unknown): value is SyncMessage {
  if (typeof value !== 'object' || value === null) return false;
  const { from, topic } = value as Record<string, unknown>;
  return typeof from === 'string' && typeof topic === 'string' && TOPICS.includes(topic);
}

/** Web Locks 里用到的最小面：`navigator.locks` 满足它；单测里换成内存里的实现。 */
export interface LocksLike {
  request<T>(name: string, task: () => Promise<T>): Promise<T>;
}

/** 广播通道的最小面，`BroadcastChannel` 满足它；单测里换成内存里的实现。 */
export interface ChannelLike {
  postMessage(message: unknown): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  close(): void;
}

/** 页面生命周期监听器收到的事件：`pageshow` 带 `persisted`，其余事件不看内容。 */
export type LifecycleListener = (event: { readonly persisted?: boolean }) => void;

/**
 * 页面生命周期事件的来源：可见性、解冻与往返缓存恢复。浏览器里由 {@link browserLifecycle} 把 `document`
 * 与 `window` 合成一个来源；Node 里没有文档，就不发恢复事件。
 */
export interface LifecycleSource {
  /** 当前的可见性（`visible` / `hidden`）。 */
  readonly visibilityState?: string;
  addEventListener(type: string, listener: LifecycleListener): void;
  removeEventListener(type: string, listener: LifecycleListener): void;
}

/** 浏览器里的生命周期来源：`visibilitychange` 与 `resume` 在 `document` 上，`pageshow` 在 `window` 上。 */
export function browserLifecycle(): LifecycleSource | undefined {
  if (typeof document === 'undefined') return undefined;
  const target = (type: string): EventTarget => (type === 'pageshow' ? window : document);
  return {
    get visibilityState() {
      return document.visibilityState;
    },
    addEventListener: (type, listener) => target(type).addEventListener(type, listener as EventListener),
    removeEventListener: (type, listener) => target(type).removeEventListener(type, listener as EventListener)
  };
}

export interface TabSyncOptions {
  /** Web Locks，缺省取 `navigator.locks`。 */
  readonly locks?: LocksLike;
  /** 广播通道，缺省开一个同源的 `BroadcastChannel`。 */
  readonly channel?: ChannelLike;
  /** 页面生命周期的来源，缺省取 {@link browserLifecycle}（没有文档的环境不发恢复事件）。 */
  readonly lifecycle?: LifecycleSource;
  /** 本标签页的标识，缺省随机生成；广播里靠它忽略自己发的消息。 */
  readonly tabId?: string;
}

/**
 * 同一个来源下多个标签页之间的协调（ADESK-US-105）：每个标签页各持一条到同一个库文件的连接，
 * 这里提供两样东西——
 *
 * 1. {@link exclusive}：一把跨标签页的 Web Lock，包住「读了再写」的复合操作（磁盘的读写、偏好的写入、数据域的种子），
 *    保证两个标签页不会交错执行；
 * 2. {@link notify} / {@link changes}：一条 BroadcastChannel，写入方提交之后通知别的标签页「某类数据变了」，
 *    对方据此丢掉内存里的副本、从库里重读。通知只说「变了」不带数据，**数据一律以库为准**：
 *    通知丢了或晚到，只影响多久能看到，不影响最终一致。
 *
 * 另有 {@link resumed$}：后台标签页回到前台（或解冻）时发出，持有内存副本的服务借它再对一次库。
 */
export class TabSync {
  private readonly options: TabSyncOptions;
  private readonly incoming = new Subject<SyncMessage>();
  private channel: ChannelLike | undefined;
  private closed = false;

  /** 本标签页的标识。 */
  readonly tabId: string;
  /** 页面从后台回到前台、从冻结状态解冻或从往返缓存恢复时发出（订阅时才挂监听）。 */
  readonly resumed$: Observable<void>;

  constructor(options: TabSyncOptions = {}) {
    this.options = options;
    this.tabId = options.tabId ?? crypto.randomUUID();
    this.resumed$ = resumedOf(options.lifecycle ?? browserLifecycle());
  }

  /**
   * 在跨标签页的独占锁 `lock` 里执行 `task`，返回它的结果（或错误）。同一把锁上所有标签页（含本标签页内的多次调用）
   * 按请求顺序排队；不同名字的锁互不影响。**不可重入**：`task` 里不能再请求同一把锁，否则会等自己释放而永远挂住。
   * 要嵌套就保持固定的加锁次序（磁盘锁在外，种子锁在内），不要反过来。
   *
   * @param task 临界区
   * @param lock 锁的名字，默认是磁盘的 {@link DISK_LOCK}
   */
  exclusive<T>(task: () => Promise<T>, lock: string = DISK_LOCK): Promise<T> {
    return this.locks().request(lock, task);
  }

  /** 通知别的标签页：`topic` 这类数据被本标签页改过了。自己收不到；关闭之后什么也不发。 */
  notify(topic: SyncTopic): void {
    if (this.closed) return;
    this.open().postMessage({ from: this.tabId, topic } satisfies SyncMessage);
  }

  /** 别的标签页发来的 `topic` 变更通知。订阅时才打开广播通道。 */
  changes(topic: SyncTopic): Observable<void> {
    return new Observable<void>(subscriber => {
      this.open();
      return this.incoming
        .pipe(
          filter(message => message.topic === topic),
          map(() => undefined)
        )
        .subscribe(subscriber);
    });
  }

  /** 关闭广播通道（测试与销毁用）。之后 {@link notify} 是空操作。 */
  close(): void {
    this.closed = true;
    this.channel?.close();
    this.incoming.complete();
  }

  /** Web Locks：缺省取 `navigator.locks`，每次用时才取（所以单测里随时可以换）；环境里没有就直接报错，不悄悄放行。 */
  private locks(): LocksLike {
    const locks = this.options.locks ?? (typeof navigator === 'undefined' ? undefined : navigator.locks);
    if (!locks) throw new Error('跨标签页协调需要 Web Locks（navigator.locks），当前环境没有');
    return locks;
  }

  /** 第一次通知或订阅时才打开通道：只建数据库、不跨标签页通信的场合（单测）不留下打开的通道。 */
  private open(): ChannelLike {
    if (!this.channel) {
      this.channel = this.options.channel ?? new BroadcastChannel(CHANNEL_NAME);
      this.channel.addEventListener('message', event => {
        if (isSyncMessage(event.data) && event.data.from !== this.tabId) this.incoming.next(event.data);
      });
    }
    return this.channel;
  }
}

/** 页面回到前台：可见性变为 visible、从冻结解冻（`resume`）、从往返缓存恢复（`pageshow` 且 `persisted`）。 */
function resumedOf(source: LifecycleSource | undefined): Observable<void> {
  return new Observable<void>(subscriber => {
    if (!source) return undefined;
    const emit = (): void => subscriber.next();
    const onVisibility = (): void => {
      if (source.visibilityState === 'visible') emit();
    };
    const onPageShow: LifecycleListener = event => {
      if (event.persisted) emit();
    };
    source.addEventListener('visibilitychange', onVisibility);
    source.addEventListener('resume', emit);
    source.addEventListener('pageshow', onPageShow);
    return () => {
      source.removeEventListener('visibilitychange', onVisibility);
      source.removeEventListener('resume', emit);
      source.removeEventListener('pageshow', onPageShow);
    };
  });
}

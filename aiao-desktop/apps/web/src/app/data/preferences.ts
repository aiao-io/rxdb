import { ErrorHandler, Service, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, Subject, merge } from 'rxjs';

import { DesktopData, keyIs } from './desktop-data';
import { SystemPreference } from './system-preference.entity';
import { PREFERENCES_LOCK } from './tab-sync';

const ALL = { combinator: 'and' as const, rules: [] };

/** 值的比较口径：JSON 文本。库里的值本来就是 JSON，键顺序不同只会多判一次「变了」，不会漏判。 */
const fingerprint = (value: unknown): string => JSON.stringify(value) ?? 'undefined';

/**
 * 系统级键值（`SystemPreference` 表）：启动时整表读进来，读是同步的 signal，写串行落库。
 *
 * 同一个来源的多个标签页共用这张表（ADESK-US-105），所以：
 *
 * - 写入在跨标签页的偏好锁里，先读这一行的现状再更新或新建——别的标签页可能刚建了这个键（键有唯一索引）；
 * - 写入之后广播通知；收到别的标签页的通知（或页面回到前台）就整表重读，值变了的键从 {@link external$} 发出，
 *   外观、Dock 布局、桌面图标位置这些把偏好缓存成自己状态的服务据此更新。
 *
 * 重读与本标签页的写入走同一条队列，所以不会拿写入之前的库内容盖掉刚写的值。
 */
@Service({ autoProvided: false })
export class Preferences {
  private readonly data = inject(DesktopData);
  private readonly errors = inject(ErrorHandler);
  private readonly rows = signal<ReadonlyMap<string, SystemPreference>>(new Map());
  private readonly external = new Subject<readonly string[]>();
  /** 每个键最近一次与库对过的值（JSON 文本）。不能拿 `rows` 里的实体比：RxDB 会按别的标签页的事件就地改它们。 */
  private known = new Map<string, string>();
  private queue: Promise<unknown> = Promise.resolve();

  /** 读完整表时完成；库不可用时拒绝。 */
  readonly ready: Promise<void>;
  /** 别的标签页改了偏好：发出值变了的键（新建、更新、删除都算）。本标签页自己的写入不发。 */
  readonly external$: Observable<readonly string[]> = this.external.asObservable();

  constructor() {
    this.ready = this.load();
    this.ready.catch(() => undefined);
    const tabs = this.data.tabs;
    merge(tabs.changes('preferences'), tabs.resumed$)
      .pipe(takeUntilDestroyed())
      .subscribe(() => void this.refresh());
  }

  /** 取值并用 `guard` 收窄类型；没有这个键或类型不符时为 `undefined`。 */
  get<T>(key: string, guard: (value: unknown) => value is T): T | undefined {
    const value = this.rows().get(key)?.value;
    return guard(value) ? value : undefined;
  }

  /** 新建或覆盖一个键；本标签页里的写入（与重读）按调用顺序串行执行。 */
  set(key: string, value: unknown): Promise<void> {
    return this.enqueue(() => this.write(key, value));
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<void> {
    const repository = await this.data.repository(SystemPreference);
    const rows = await repository.find({ where: ALL });
    this.adopt(rows);
  }

  /** 把库里读到的整张表作为现状；返回值变了的键（新建、更新、删除），有变化才换掉 `rows`，免得依赖它的界面白白重算。 */
  private adopt(rows: readonly SystemPreference[]): string[] {
    const next = new Map(rows.map(row => [row.key, fingerprint(row.value)]));
    const changed = [...new Set([...this.known.keys(), ...next.keys()])].filter(
      key => this.known.get(key) !== next.get(key)
    );
    this.known = next;
    if (changed.length) this.rows.set(new Map(rows.map(row => [row.key, row])));
    return changed;
  }

  /** 别的标签页改过库（或页面回到前台）：重读整表，值变了的键对外发出。库不可用时什么也不做。 */
  private refresh(): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.ready;
      } catch {
        return;
      }
      const rows = await (await this.data.repository(SystemPreference)).find({ where: ALL });
      const changed = this.adopt(rows);
      if (changed.length) this.external.next(changed);
    }).catch((error: unknown) => this.errors.handleError(error));
  }

  private async write(key: string, value: unknown): Promise<void> {
    await this.ready;
    const saved = await this.data.tabs.exclusive(async () => {
      const repository = await this.data.repository(SystemPreference);
      const [existing] = await repository.find({ where: keyIs(key), limit: 1 });
      return existing ?
          repository.update(existing, { value })
        : repository.create(this.data.instantiate(SystemPreference, { key, value }));
    }, PREFERENCES_LOCK);
    this.known.set(key, fingerprint(value));
    this.rows.update(rows => new Map(rows).set(key, saved));
    this.data.tabs.notify('preferences');
  }
}

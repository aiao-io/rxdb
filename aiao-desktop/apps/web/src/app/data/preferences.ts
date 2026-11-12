import { Service, inject, signal } from '@angular/core';

import { DesktopData } from './desktop-data';
import { SystemPreference } from './system-preference.entity';

const ALL = { combinator: 'and' as const, rules: [] };

/**
 * 系统级键值（`SystemPreference` 表）：启动时整表读进来，读是同步的 signal，写串行落库。
 * 只有本服务写这张表的非种子键，所以内存里的副本就是库里的现状。
 */
@Service({ autoProvided: false })
export class Preferences {
  private readonly data = inject(DesktopData);
  private readonly rows = signal<ReadonlyMap<string, SystemPreference>>(new Map());
  private queue: Promise<unknown> = Promise.resolve();

  /** 读完整表时完成；库不可用时拒绝。 */
  readonly ready: Promise<void>;

  constructor() {
    this.ready = this.load();
    this.ready.catch(() => undefined);
  }

  /** 取值并用 `guard` 收窄类型；没有这个键或类型不符时为 `undefined`。 */
  get<T>(key: string, guard: (value: unknown) => value is T): T | undefined {
    const value = this.rows().get(key)?.value;
    return guard(value) ? value : undefined;
  }

  /** 新建或覆盖一个键；同一个服务里的写入按调用顺序串行执行。 */
  set(key: string, value: unknown): Promise<void> {
    const run = this.queue.then(() => this.write(key, value));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async load(): Promise<void> {
    const repository = await this.data.repository(SystemPreference);
    const rows = await repository.find({ where: ALL });
    this.rows.set(new Map(rows.map(row => [row.key, row])));
  }

  private async write(key: string, value: unknown): Promise<void> {
    await this.ready;
    const repository = await this.data.repository(SystemPreference);
    const existing = this.rows().get(key);
    const saved =
      existing ?
        await repository.update(existing, { value })
      : await repository.create(this.data.instantiate(SystemPreference, { key, value }));
    this.rows.update(rows => new Map(rows).set(key, saved));
  }
}

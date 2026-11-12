import { EntityType, IRepository, RxDB, TransactionExecutor } from '@aiao/rxdb';
import { Service, inject, signal } from '@angular/core';

import { DESKTOP_ADAPTER } from './desktop-database';
import { DATA_SEEDS, DataSeed } from './seeds';
import { SystemPreference } from './system-preference.entity';

export type DataState = 'connecting' | 'ready' | 'failed';

/** 只取某个键的那一行。 */
export const keyIs = (key: string) => ({
  combinator: 'and' as const,
  rules: [{ field: 'key' as const, operator: '=' as const, value: key }]
});

/** 种子标记的键。 */
export const seedMarkerKey = (domain: string): string => `seed:${domain}`;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 桌面的本地数据：连上 SQLite、准备好 storage 插件的文件存储，再把各数据域的初始数据写进去。
 * 其余服务经它拿仓储、开事务与创建实体，统一等到库就绪之后。
 */
@Service({ autoProvided: false })
export class DesktopData {
  private readonly rxdb = inject(RxDB);
  private readonly stateValue = signal<DataState>('connecting');
  private readonly errorValue = signal<string | null>(null);

  readonly state = this.stateValue.asReadonly();
  readonly error = this.errorValue.asReadonly();
  /** 库可用时完成；连不上或初始数据写入失败时拒绝，`state()` 变为 `failed`。 */
  readonly ready: Promise<RxDB>;

  get database(): RxDB {
    return this.rxdb;
  }

  constructor() {
    this.ready = this.start();
    this.ready.then(
      () => this.stateValue.set('ready'),
      (error: unknown) => {
        this.errorValue.set(describe(error));
        this.stateValue.set('failed');
      }
    );
  }

  async repository<T extends EntityType>(type: T): Promise<IRepository<T>> {
    await this.ready;
    return (await this.rxdb.connect(DESKTOP_ADAPTER)).getRepository(type);
  }

  /** 在一个事务里读写；回调里只能用 `executor.getRepository(…)`，不能等 `entity.save()`。 */
  async transaction<R>(task: (executor: TransactionExecutor) => Promise<R>): Promise<R> {
    await this.ready;
    return (await this.rxdb.connect(DESKTOP_ADAPTER)).transaction(task);
  }

  instantiate<T extends EntityType>(type: T, data: Partial<InstanceType<T>>): InstanceType<T> {
    return this.rxdb.entityManager.instantiate(type, data);
  }

  private async start(): Promise<RxDB> {
    await this.rxdb.connect(DESKTOP_ADAPTER);
    await this.rxdb.storage.init();
    for (const seed of DATA_SEEDS) await this.seed(seed);
    return this.rxdb;
  }

  /** 没有种子标记时，在一个事务里写入初始数据和标记。 */
  private async seed(seed: DataSeed): Promise<void> {
    const adapter = await this.rxdb.connect(DESKTOP_ADAPTER);
    const key = seedMarkerKey(seed.domain);
    const markers = await adapter.getRepository(SystemPreference).find({ where: keyIs(key), limit: 1 });
    if (markers.length) return;
    await adapter.transaction(async executor => {
      await seed.run(executor, this.rxdb);
      const marker = { version: seed.version, seededAt: Date.now() };
      await executor
        .getRepository(SystemPreference)
        .create(this.rxdb.entityManager.instantiate(SystemPreference, { key, value: marker }));
    });
  }
}

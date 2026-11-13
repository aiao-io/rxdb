import { BehaviorSubject, Observable } from 'rxjs';
import { vi } from 'vitest';

import { TabSync } from '../data/tab-sync';
import { SilentChannel } from './fake-tab-sync';

interface FakeRule {
  readonly field: string;
  readonly operator: string;
  readonly value: unknown;
}

/** 服务里用到的查询条件子集：全是 `and`，规则只有 `=` 与 `startsWith`。 */
interface FakeWhere {
  readonly combinator: 'and' | 'or';
  readonly rules: readonly FakeRule[];
}

interface FakeFindOptions {
  readonly where?: FakeWhere;
  readonly limit?: number;
  readonly orderBy?: readonly { readonly field: string; readonly sort: 'asc' | 'desc' }[];
}

type Row = Record<string, unknown>;

const matches = (row: Row, where: FakeWhere | undefined): boolean =>
  (where?.rules ?? []).every(rule => {
    if (rule.operator === 'startsWith') return String(row[rule.field]).startsWith(String(rule.value));
    if (rule.operator !== '=') throw new Error(`替身仓储只支持 = 与 startsWith 条件：${rule.operator}`);
    return row[rule.field] === rule.value;
  });

const compare = (a: unknown, b: unknown): number =>
  a === b ? 0
  : (a as number) < (b as number) ? -1
  : 1;

/**
 * 内存里的仓储，形状与 RxDB 仓储里被服务用到的子集一致（`find`、`create`、`update`、`remove`）。
 * `rows$` 在每次写入后推送整张表，供替身的 `Entity.findAll` 当活查询用。
 */
export class FakeRepository<T extends object = Row> {
  private readonly state = new BehaviorSubject<readonly T[]>([]);
  private seq = 0;

  readonly rows$: Observable<readonly T[]> = this.state.asObservable();
  readonly find = vi.fn(async (options: FakeFindOptions = {}): Promise<T[]> => {
    const rows = this.state.value.filter(row => matches(row as Row, options.where));
    const sorted = [...rows];
    for (const order of [...(options.orderBy ?? [])].reverse())
      sorted.sort(
        (a, b) => compare((a as Row)[order.field], (b as Row)[order.field]) * (order.sort === 'desc' ? -1 : 1)
      );
    return sorted.slice(0, options.limit);
  });

  get rows(): readonly T[] {
    return this.state.value;
  }

  /** 直接放入若干行（没有 id 的补上），不经过 `create`。 */
  seed(rows: readonly object[]): void {
    this.state.next([...this.state.value, ...rows.map(row => this.withId(row))]);
  }

  async create(entity: T): Promise<T> {
    const row = this.withId(entity);
    this.state.next([...this.state.value, row]);
    return row;
  }

  /** 与 RxDB 一致：就地改实体并返回同一个实例（调用方拿旧实例读字段会读到新值）。 */
  async update(entity: T, patch: Partial<T>): Promise<T> {
    const id = (entity as Row)['id'];
    Object.assign(entity, patch);
    this.state.next(this.state.value.map(item => ((item as Row)['id'] === id ? entity : item)));
    return entity;
  }

  async remove(entity: T): Promise<void> {
    const id = (entity as Row)['id'];
    this.state.next(this.state.value.filter(item => (item as Row)['id'] !== id));
  }

  /** 推送一次错误，模拟活查询出错。 */
  fail(error: Error): void {
    this.state.error(error);
  }

  private withId(entity: object): T {
    const row = entity as Row;
    return { ...row, id: row['id'] ?? `row-${++this.seq}` } as unknown as T;
  }
}

/** storage 插件的替身：文件体放在内存里，按目录统计便于断言。 */
export class FakeStorage {
  private seq = 0;
  readonly blobs = new Map<string, { readonly file: File; readonly path: string }>();

  readonly init = vi.fn(async () => undefined);
  readonly upload = vi.fn(async (file: File, options: { readonly path: string }) => {
    const id = `blob-${++this.seq}`;
    this.blobs.set(id, { file, path: options.path });
    return { id };
  });
  readonly read = vi.fn(async (id: string) => {
    const blob = this.blobs.get(id);
    if (!blob) throw new Error(`没有文件体 ${id}`);
    return blob.file;
  });
  readonly delete = vi.fn(async (id: string) => {
    this.blobs.delete(id);
  });
  readonly clear = vi.fn(async (path: string) => {
    for (const [id, blob] of this.blobs) if (blob.path === path) this.blobs.delete(id);
  });
}

type EntityKey = abstract new (...args: never[]) => unknown;

/** 替身库：服务只用到其中的 storage 插件。 */
export interface FakeDatabase {
  readonly storage: FakeStorage;
}

/**
 * `DesktopData` 的替身：每个实体类型一张内存表，`database.storage` 是内存的文件存储。
 * 不模拟事务，也不连任何适配器；需要库的服务（FileSystem、Preferences、各数据仓）用它在 Node 里跑。
 */
export class FakeDesktopData {
  private readonly tables = new Map<EntityKey, FakeRepository>();
  readonly storage = new FakeStorage();
  readonly database: FakeDatabase = { storage: this.storage };
  /** 默认立即就绪；用例想模拟连不上库时换成一个会拒绝的 Promise。 */
  ready: Promise<FakeDatabase> = Promise.resolve(this.database);

  /** 后台读数据的服务先问一句库能不能用：就绪为 true，起不来为 false，不抛拒绝。 */
  readonly available = vi.fn(() =>
    this.ready.then(
      () => true,
      () => false
    )
  );
  /**
   * 实体所属数据域的初始数据（首次读取时才种，D-18）。替身里表是空的，不种数据，只记下被问过哪些实体，
   * 需要看「读之前先种」的次序时断言它的调用。
   */
  readonly ensureSeeded = vi.fn<(entity: EntityKey) => Promise<void>>(async () => undefined);
  /** 和真实现一样，取仓储之前先保证该实体所属的数据域已经种过。 */
  readonly repository = vi.fn(async (type: EntityKey) => {
    await this.ensureSeeded(type);
    return this.table(type);
  });
  readonly instantiate = vi.fn((_type: EntityKey, data: object) => ({ ...data }));
  /** 跨标签页协调（ADESK-US-105）：默认一条没人听的通道，锁取 `navigator.locks`（用例里常用 `stubLocks` 换成直接执行）。 */
  tabs = new TabSync({ channel: new SilentChannel() });
  /** 库的 data_version：别的连接提交写入时变化；单标签页的用例里它不动。 */
  version = 1;
  readonly dataVersion = vi.fn(async () => this.version);

  /** 模拟别的标签页提交了一次写入：库的 data_version 变了。 */
  foreignCommit(): void {
    this.version++;
  }

  table<T extends object = Row>(type: EntityKey): FakeRepository<T> {
    let table = this.tables.get(type);
    if (!table) {
      table = new FakeRepository();
      this.tables.set(type, table);
    }
    return table as unknown as FakeRepository<T>;
  }
}

interface InstalledStub {
  readonly entity: object;
  readonly previous: PropertyDescriptor | undefined;
}

const installed: InstalledStub[] = [];

/**
 * 给实体类装上替身的静态 `findAll`，返回传入的活查询源。
 * 真实的静态方法要等库初始化后才注入到实体类上，Node 单测里没有它，所以直接定义在类上；
 * 用例结束后调用 {@link restoreEntityStubs} 还原。
 */
export function stubFindAll<T>(entity: object, rows$: Observable<T>) {
  const previous = Object.getOwnPropertyDescriptor(entity, 'findAll');
  const findAll = vi.fn(() => rows$);
  Object.defineProperty(entity, 'findAll', { value: findAll, configurable: true, writable: true });
  installed.push({ entity, previous });
  return findAll;
}

/** 撤掉 {@link stubFindAll} 装的全部替身。 */
export function restoreEntityStubs(): void {
  for (const { entity, previous } of installed.splice(0).reverse()) {
    if (previous) Object.defineProperty(entity, 'findAll', previous);
    else Reflect.deleteProperty(entity, 'findAll');
  }
}

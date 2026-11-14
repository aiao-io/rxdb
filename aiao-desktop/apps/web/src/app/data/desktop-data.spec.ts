import { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FreeformStroke } from '../apps/freeform/freeform.entities';
import { Note } from '../apps/notes/notes.entities';
import { WeatherCity } from '../apps/weather/weather.entities';
import { DesktopFile } from '../disk/desktop-file.entity';
import { CalendarEventRow, CalendarListRow } from '../services/calendar.entities';
import { configureServices } from '../testing/angular';
import { FakeDesktopData, FakeRepository } from '../testing/fake-desktop-data';
import { DesktopData, DesktopDataProblemError, seedMarkerKey } from './desktop-data';
import { createDesktopDatabase, schemaGuardOf, tabSyncOf } from './desktop-database';
import { DesktopSchemaStaleError } from './schema-guard';
import { adapterInspector, probeSchema } from './schema-probe';
import { DESKTOP_SCHEMA_VERSION, SCHEMA_RECORD_KEY, SchemaProbe, runUpgrade } from './schema-version';
import { DATA_DOMAINS, domainOf } from './seeds';
import { SystemPreference } from './system-preference.entity';
import { TabSync } from './tab-sync';

vi.mock('./schema-probe', () => ({ adapterInspector: vi.fn(), probeSchema: vi.fn() }));
/** 升级默认走真实现；个别用例换成带迁移 SQL 的假升级，验证迁移经事务的 executor 执行。 */
vi.mock('./schema-version', async importOriginal => {
  const actual = await importOriginal<typeof import('./schema-version')>();
  return { ...actual, runUpgrade: vi.fn(actual.runUpgrade) };
});

const NEWER = DESKTOP_SCHEMA_VERSION + 1;
const record = (version: number) => ({ version, build: 'test', upgradedAt: 1 });

/** 探测结果：全新的库、没有版本记录的旧库、已是当前、更新的库、损坏、没有迁移路径。 */
const PROBES = {
  fresh: { hasPreferenceTable: false, recordValue: undefined, missing: [] },
  legacy: { hasPreferenceTable: true, recordValue: undefined, missing: [] },
  current: { hasPreferenceTable: true, recordValue: record(DESKTOP_SCHEMA_VERSION), missing: [] },
  tooNew: { hasPreferenceTable: true, recordValue: record(NEWER), missing: [] },
  garbled: { hasPreferenceTable: true, recordValue: 'garbage', missing: [] },
  missingColumn: { hasPreferenceTable: true, recordValue: record(DESKTOP_SCHEMA_VERSION), missing: ['note.title'] },
  incompatible: { hasPreferenceTable: true, recordValue: record(5), missing: [] }
} as const satisfies Record<string, SchemaProbe>;

interface Scenario {
  readonly probe?: SchemaProbe;
  /** 探测时抛错。 */
  readonly probeError?: unknown;
  /** `adapter.connect()` 失败。 */
  readonly connectError?: unknown;
  /** 库里已有的偏好行。 */
  readonly existing?: readonly { readonly key: string; readonly value: unknown }[];
  /** `getAdapter` 返回的不是 sqlite-wasm 适配器。 */
  readonly notSqlite?: boolean;
  /** 在它落定之前 `adapter.connect()` 一直挂着，模拟库还没就绪。 */
  readonly gate?: Promise<void>;
}

interface WriteLog {
  /** 写的是哪种实体（类名）。 */
  readonly type: string;
  readonly key: unknown;
  readonly inTransaction: boolean;
}

function setup({
  probe = PROBES.fresh,
  probeError,
  connectError,
  existing = [],
  notSqlite = false,
  gate
}: Scenario = {}) {
  vi.stubEnv('DEV', false);
  const rxdb = createDesktopDatabase('/');
  const db = new FakeDesktopData();
  db.table(SystemPreference).seed(existing);

  const order: string[] = [];
  const writes: WriteLog[] = [];
  let depth = 0;
  const tracked = new Set<FakeRepository>();
  const repository = (type: unknown) => {
    const table = db.table(type as never);
    if (!tracked.has(table)) {
      tracked.add(table);
      const create = table.create.bind(table);
      table.create = async entity => {
        const key = (entity as Record<string, unknown>)['key'];
        writes.push({ type: (type as { name: string }).name, key, inTransaction: depth > 0 });
        return create(entity);
      };
    }
    return table;
  };
  const executor = { getRepository: repository, query: vi.fn(async () => undefined) };
  const adapter = Object.assign(Object.create(RxDBAdapterSqlite.prototype) as RxDBAdapterSqlite, {
    connect: vi.fn(async () => {
      order.push('adapter.connect');
      await gate;
      if (connectError !== undefined) throw connectError;
    }),
    disconnect: vi.fn(async () => {
      order.push('adapter.disconnect');
    }),
    dropStorage: vi.fn(async () => {
      order.push('adapter.dropStorage');
    }),
    getRepository: vi.fn(repository),
    transaction: vi.fn(async (task: (executor: unknown) => Promise<unknown>) => {
      order.push('transaction');
      depth++;
      try {
        return await task(executor);
      } finally {
        depth--;
      }
    })
  });

  const inspector = { readRecord: vi.fn(async (): Promise<unknown> => undefined) };
  vi.mocked(adapterInspector).mockReturnValue(inspector as never);
  vi.mocked(probeSchema).mockImplementation(async () => {
    order.push('probe');
    if (probeError !== undefined) throw probeError;
    return probe;
  });

  vi.spyOn(rxdb, 'getAdapter').mockResolvedValue((notSqlite ? { name: 'other' } : adapter) as never);
  const connect = vi.spyOn(rxdb, 'connect').mockImplementation(async () => {
    order.push('rxdb.connect');
    return adapter as never;
  });
  const storageInit = vi.spyOn(rxdb.storage, 'init').mockImplementation(async () => {
    order.push('storage.init');
  });
  const instantiate = vi.spyOn(rxdb.entityManager, 'instantiate').mockImplementation(((
    _type: unknown,
    data: object
  ) => ({
    ...data
  })) as never);

  configureServices([DesktopData, { provide: RxDB, useValue: rxdb }]);
  const data = TestBed.inject(DesktopData);
  return { data, rxdb, db, adapter, executor, inspector, order, writes, connect, storageInit, instantiate };
}

/** 等 ready 落定（成功或失败），再让它上面登记的状态回调跑完。 */
async function settled(data: DesktopData): Promise<void> {
  await data.ready.catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve));
}

const rowsOf = (db: FakeDesktopData) => db.table<{ key: string; value: unknown }>(SystemPreference).rows;
const valueOf = (db: FakeDesktopData, key: string): unknown => rowsOf(db).find(row => row.key === key)?.value;

beforeEach(() => {
  vi.mocked(adapterInspector).mockReset();
  vi.mocked(probeSchema).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('DesktopData 全新的库', () => {
  it('先只读探测，再连接、准备文件存储，在一个事务里写版本记录；启动时不写任何数据域的种子', async () => {
    const { data, db, order, writes, adapter } = setup({ probe: PROBES.fresh });
    await settled(data);

    expect(order.slice(0, 4)).toEqual(['adapter.connect', 'probe', 'rxdb.connect', 'storage.init']);
    expect(data.state()).toBe('ready');
    expect(data.error()).toBeNull();
    expect(data.problem()).toBeNull();

    expect(valueOf(db, SCHEMA_RECORD_KEY)).toMatchObject({ version: DESKTOP_SCHEMA_VERSION, build: '' });
    expect(writes.find(write => write.key === SCHEMA_RECORD_KEY)?.inTransaction).toBe(true);
    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    expect(rowsOf(db).filter(row => row.key.startsWith('seed:'))).toEqual([]);
    expect(db.table(WeatherCity).rows).toEqual([]);
  });

  it('available() 在库就绪后为 true', async () => {
    const { data } = setup();
    await expect(data.available()).resolves.toBe(true);
  });
});

describe('DesktopData 升级', () => {
  it('此前发布的构建建的库没有版本记录：当作版本 0 升级，补写版本记录，已有的种子标记原样保留，不当作损坏', async () => {
    const { data, db, writes } = setup({
      probe: PROBES.legacy,
      existing: [
        { key: 'accent', value: 'blue' },
        { key: seedMarkerKey('notes'), value: { version: 1, seededAt: 1 } }
      ]
    });
    await settled(data);

    expect(data.state()).toBe('ready');
    expect(valueOf(db, SCHEMA_RECORD_KEY)).toMatchObject({ version: DESKTOP_SCHEMA_VERSION });
    expect(valueOf(db, 'accent')).toBe('blue');
    expect(writes.find(write => write.key === SCHEMA_RECORD_KEY)?.inTransaction).toBe(true);
    expect(
      rowsOf(db)
        .filter(row => row.key.startsWith('seed:'))
        .map(row => row.key)
    ).toEqual([seedMarkerKey('notes')]);
  });

  it('版本记录行已经存在时就地更新，不建第二行', async () => {
    const { data, db } = setup({
      probe: PROBES.legacy,
      existing: [{ key: SCHEMA_RECORD_KEY, value: record(1) }]
    });
    await settled(data);

    expect(rowsOf(db).filter(row => row.key === SCHEMA_RECORD_KEY)).toHaveLength(1);
    expect(valueOf(db, SCHEMA_RECORD_KEY)).toMatchObject({ version: DESKTOP_SCHEMA_VERSION });
  });

  it('迁移步骤经升级事务的 executor 执行 SQL，写版本记录在迁移之后，全在升级的那一个事务里', async () => {
    vi.mocked(runUpgrade).mockImplementationOnce(async (_from, target) => {
      await target.execute('ALTER TABLE note ADD COLUMN pinned INTEGER', [1]);
      await target.writeRecord({ version: DESKTOP_SCHEMA_VERSION, build: '', upgradedAt: 1 });
    });
    const { data, db, executor, adapter } = setup({ probe: PROBES.legacy });
    await settled(data);

    expect(executor.query).toHaveBeenCalledExactlyOnceWith('ALTER TABLE note ADD COLUMN pinned INTEGER', [1]);
    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    expect(valueOf(db, SCHEMA_RECORD_KEY)).toMatchObject({ version: DESKTOP_SCHEMA_VERSION });
    expect(data.state()).toBe('ready');
  });

  it('升级事务里的失败让库保持不可用：版本记录没有推进，也没有任何种子', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.legacy });
    adapter.transaction = vi.fn(async () => {
      throw new Error('upgrade interrupted');
    }) as never;
    await settled(data);

    expect(data.state()).toBe('failed');
    expect(data.problem()).toEqual({ kind: 'unavailable', message: 'upgrade interrupted' });
    expect(valueOf(db, SCHEMA_RECORD_KEY)).toBeUndefined();
    expect(rowsOf(db).filter(row => row.key.startsWith('seed:'))).toEqual([]);
  });
});

describe('DesktopData 已是当前版本', () => {
  it('不再升级，不写版本记录，启动时一个事务也不开', async () => {
    const { data, writes, adapter } = setup({ probe: PROBES.current });
    await settled(data);

    expect(data.state()).toBe('ready');
    expect(writes.some(write => write.key === SCHEMA_RECORD_KEY)).toBe(false);
    expect(adapter.transaction).not.toHaveBeenCalled();
  });
});

describe('DesktopData 数据域的初始数据：首次读取才种（D-18）', () => {
  const markers = (db: FakeDesktopData): string[] =>
    rowsOf(db)
      .filter(row => row.key.startsWith('seed:'))
      .map(row => row.key);

  it('启动完成之后没有任何数据域被种过：没有标记，也没有种子事务', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.current });
    await settled(data);

    expect(markers(db)).toEqual([]);
    expect(adapter.transaction).not.toHaveBeenCalled();
    expect(db.table(Note).rows).toEqual([]);
  });

  it('第一次 ensureSeeded(Note) 才种 notes 域：种子和标记在同一个事务里写，标记最后写，别的数据域不受影响', async () => {
    const { data, db, writes } = setup({ probe: PROBES.current });
    await settled(data);
    await data.ensureSeeded(Note);

    expect(db.table(Note).rows.length).toBeGreaterThan(0);
    expect(valueOf(db, seedMarkerKey('notes'))).toMatchObject({ version: 1 });
    const seeded = writes.filter(write => write.type === 'Note' || write.key === seedMarkerKey('notes'));
    expect(seeded.every(write => write.inTransaction)).toBe(true);
    expect(seeded.at(-1)?.key).toBe(seedMarkerKey('notes'));
    expect(markers(db)).toEqual([seedMarkerKey('notes')]);
    expect(db.table(WeatherCity).rows).toEqual([]);
  });

  it('同一个数据域只种一次：并发和之后的 ensureSeeded 都拿到同一个任务，不重复写', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.current });
    await settled(data);

    const first = data.ensureSeeded(Note);
    const second = data.ensureSeeded(Note);
    expect(second).toBe(first);
    await first;
    expect(data.ensureSeeded(Note)).toBe(first);
    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    expect(markers(db)).toEqual([seedMarkerKey('notes')]);
  });

  it('同一个数据域的不同实体共享这一次种子（日历有两个实体）', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.current });
    await settled(data);
    await Promise.all([data.ensureSeeded(CalendarListRow), data.ensureSeeded(CalendarEventRow)]);

    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    expect(markers(db)).toEqual([seedMarkerKey('calendar')]);
    expect(db.table(CalendarListRow).rows.length).toBeGreaterThan(0);
    expect(db.table(CalendarEventRow).rows.length).toBeGreaterThan(0);
  });

  it('不同的数据域各种各的：每个域一个事务、一个标记', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.current });
    await settled(data);
    await data.ensureSeeded(Note);
    await data.ensureSeeded(WeatherCity);

    expect(adapter.transaction).toHaveBeenCalledTimes(2);
    expect(markers(db)).toEqual([seedMarkerKey('notes'), seedMarkerKey('weather')]);
    expect(db.table(WeatherCity).rows).toHaveLength(1);
  });

  it('已有种子标记（以前种过）就跳过：不重写，不开事务', async () => {
    const { data, db, adapter } = setup({
      probe: PROBES.current,
      existing: [{ key: seedMarkerKey('weather'), value: { version: 1, seededAt: 1 } }]
    });
    await settled(data);
    await data.ensureSeeded(WeatherCity);

    expect(db.table(WeatherCity).rows).toEqual([]);
    expect(adapter.transaction).not.toHaveBeenCalled();
    expect(markers(db)).toEqual([seedMarkerKey('weather')]);
  });

  it('没有数据域的实体（系统偏好、磁盘文件行、Freeform 笔迹）立即完成，什么也不写', async () => {
    const { data, adapter } = setup({ probe: PROBES.current });
    await settled(data);
    for (const entity of [SystemPreference, DesktopFile, FreeformStroke]) {
      expect(domainOf(entity)).toBeUndefined();
      await expect(data.ensureSeeded(entity)).resolves.toBeUndefined();
    }
    expect(adapter.transaction).not.toHaveBeenCalled();
  });

  it('没有数据域的实体连库就绪都不用等', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (open = resolve));
    const { data } = setup({ gate });
    await expect(data.ensureSeeded(SystemPreference)).resolves.toBeUndefined();
    expect(data.state()).toBe('connecting');
    open();
    await settled(data);
  });

  it('库还没就绪时，有数据域的实体先等库，就绪之后才种', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (open = resolve));
    const { data, db, adapter } = setup({ gate, probe: PROBES.current });
    let done = false;
    const pending = data.ensureSeeded(WeatherCity).then(() => {
      done = true;
    });

    await new Promise(resolve => setTimeout(resolve));
    expect(done).toBe(false);
    expect(adapter.transaction).not.toHaveBeenCalled();
    open();
    await pending;
    expect(db.table(WeatherCity).rows).toHaveLength(1);
  });

  it('库起不来时 ensureSeeded 拒绝并带上同一个原因，不装载种子；没有数据域的实体照样立即完成', async () => {
    const weather = DATA_DOMAINS.find(domain => domain.domain === 'weather');
    if (!weather) throw new Error('应该有 weather 数据域');
    const load = vi.spyOn(weather, 'load');
    const { data } = setup({ probe: PROBES.tooNew });

    await expect(data.ensureSeeded(WeatherCity)).rejects.toBeInstanceOf(DesktopDataProblemError);
    await expect(data.ensureSeeded(SystemPreference)).resolves.toBeUndefined();
    expect(load).not.toHaveBeenCalled();
  });

  it('装载种子失败（比如动态导入的分块没拉到）：不留标记，下一次读取重试并种成功', async () => {
    const weather = DATA_DOMAINS.find(domain => domain.domain === 'weather');
    if (!weather) throw new Error('应该有 weather 数据域');
    vi.spyOn(weather, 'load').mockRejectedValueOnce(new Error('chunk failed'));
    const { data, db } = setup({ probe: PROBES.current });
    await settled(data);

    await expect(data.ensureSeeded(WeatherCity)).rejects.toThrow('chunk failed');
    expect(markers(db)).toEqual([]);
    await expect(data.ensureSeeded(WeatherCity)).resolves.toBeUndefined();
    expect(markers(db)).toEqual([seedMarkerKey('weather')]);
    expect(db.table(WeatherCity).rows).toHaveLength(1);
  });

  it('写种子的事务失败：失败不影响别的数据域，下一次读取重试', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.current });
    await settled(data);
    vi.mocked(adapter.transaction as unknown as (task: unknown) => Promise<unknown>).mockRejectedValueOnce(
      new Error('disk full')
    );

    await expect(data.ensureSeeded(WeatherCity)).rejects.toThrow('disk full');
    expect(markers(db)).toEqual([]);
    await data.ensureSeeded(Note);
    await data.ensureSeeded(WeatherCity);
    expect(markers(db)).toEqual([seedMarkerKey('notes'), seedMarkerKey('weather')]);
  });

  it('repository(实体) 先保证它所属的数据域已种过，再返回仓储；没有数据域的实体不触发任何种子', async () => {
    const { data, db } = setup({ probe: PROBES.current });
    await settled(data);

    await data.repository(SystemPreference);
    expect(markers(db)).toEqual([]);
    const repository = await data.repository(WeatherCity);
    expect(repository).toBe(db.table(WeatherCity));
    expect(db.table(WeatherCity).rows).toHaveLength(1);
    expect(markers(db)).toEqual([seedMarkerKey('weather')]);
  });

  it('transaction() 不触发种子：它在事务里自己决定读写什么', async () => {
    const { data, db } = setup({ probe: PROBES.current });
    await settled(data);
    await data.transaction(async () => 'x');
    expect(markers(db)).toEqual([]);
  });
});

describe('DesktopData 不能打开的库', () => {
  it('比本构建更新的库（降级保护）：不连接、不写库，问题是 too-new', async () => {
    const { data, connect, storageInit, adapter } = setup({ probe: PROBES.tooNew });
    await expect(data.ready).rejects.toBeInstanceOf(DesktopDataProblemError);
    await settled(data);

    expect(data.problem()).toEqual({ kind: 'too-new', found: NEWER, current: DESKTOP_SCHEMA_VERSION });
    expect(data.state()).toBe('failed');
    expect(data.error()).toBe('桌面的本地数据不可用：too-new');
    expect(connect).not.toHaveBeenCalled();
    expect(storageInit).not.toHaveBeenCalled();
    expect(adapter.transaction).not.toHaveBeenCalled();
    expect(adapter.connect).toHaveBeenCalledTimes(1);
  });

  it('版本记录无法解析：问题是 corrupt，不连接', async () => {
    const { data, connect } = setup({ probe: PROBES.garbled });
    await settled(data);

    expect(data.problem()).toEqual({ kind: 'corrupt', reason: '库里的版本记录无法解析', missing: [] });
    expect(data.state()).toBe('failed');
    expect(connect).not.toHaveBeenCalled();
  });

  it('版本与本构建一致却缺表缺列：问题是 corrupt，列出缺的东西，不静默修补', async () => {
    const { data, connect } = setup({ probe: PROBES.missingColumn });
    await settled(data);

    expect(data.problem()).toMatchObject({ kind: 'corrupt', missing: ['note.title'] });
    expect(connect).not.toHaveBeenCalled();
  });

  it('没有迁移路径的旧版本：问题是 incompatible', async () => {
    const { data, connect } = setup({ probe: PROBES.incompatible });
    await settled(data);

    expect(data.problem()).toEqual({ kind: 'incompatible', from: 5 });
    expect(connect).not.toHaveBeenCalled();
  });

  it('available() 在库不可用时为 false，并且不抛拒绝', async () => {
    const { data } = setup({ probe: PROBES.tooNew });
    await expect(data.available()).resolves.toBe(false);
  });

  it('repository() 与 transaction() 等库就绪；库起不来时拒绝并带上同一个原因', async () => {
    const { data } = setup({ probe: PROBES.tooNew });
    await expect(data.repository(WeatherCity)).rejects.toBeInstanceOf(DesktopDataProblemError);
    await expect(data.transaction(async () => 1)).rejects.toBeInstanceOf(DesktopDataProblemError);
  });
});

describe('DesktopData 其余打不开的情况', () => {
  it('存储连不上：问题是 unavailable，带原因，不连接', async () => {
    const { data, connect } = setup({ connectError: new Error('OPFS is unavailable') });
    await settled(data);

    expect(data.problem()).toEqual({ kind: 'unavailable', message: 'OPFS is unavailable' });
    expect(data.error()).toBe('OPFS is unavailable');
    expect(data.state()).toBe('failed');
    expect(connect).not.toHaveBeenCalled();
  });

  it('探测本身出错、或抛出的不是 Error 时，同样归为 unavailable', async () => {
    const probing = setup({ probeError: new Error('disk I/O error') });
    await settled(probing.data);
    expect(probing.data.problem()).toEqual({ kind: 'unavailable', message: 'disk I/O error' });

    const plain = setup({ connectError: 'boom' });
    await settled(plain.data);
    expect(plain.data.problem()).toEqual({ kind: 'unavailable', message: 'boom' });
  });

  it('适配器不是 sqlite-wasm：报错，归为 unavailable', async () => {
    const { data } = setup({ notSqlite: true });
    await settled(data);
    expect(data.problem()).toEqual({ kind: 'unavailable', message: '桌面的本地适配器不是 sqlite-wasm' });
  });

  it('启动写库时撞上写前守卫（另一个标签页已升级）：问题是 stale', async () => {
    const { data, adapter } = setup({ probe: PROBES.legacy });
    adapter.transaction = vi.fn(async () => {
      throw new DesktopSchemaStaleError(NEWER, DESKTOP_SCHEMA_VERSION);
    }) as never;
    await settled(data);

    expect(data.problem()).toEqual({ kind: 'stale', found: NEWER, current: DESKTOP_SCHEMA_VERSION });
  });
});

describe('DesktopData 写前守卫', () => {
  it('启动成功后启用守卫：之后每次写库前读版本记录', async () => {
    const { data, rxdb, inspector } = setup();
    await settled(data);

    expect(inspector.readRecord).not.toHaveBeenCalled();
    await schemaGuardOf(rxdb).assertWritable();
    expect(inspector.readRecord).toHaveBeenCalledTimes(1);
  });

  it('启动失败时守卫保持未启用', async () => {
    const { data, rxdb, inspector } = setup({ probe: PROBES.tooNew });
    await settled(data);

    await schemaGuardOf(rxdb).assertWritable();
    expect(inspector.readRecord).not.toHaveBeenCalled();
  });

  it('运行期间另一个标签页把库升级了：守卫拒绝写入，问题变成 stale', async () => {
    const { data, rxdb, inspector } = setup();
    await settled(data);
    expect(data.problem()).toBeNull();

    inspector.readRecord.mockResolvedValue(record(NEWER));
    await expect(schemaGuardOf(rxdb).assertWritable()).rejects.toBeInstanceOf(DesktopSchemaStaleError);
    expect(data.problem()).toEqual({ kind: 'stale', found: NEWER, current: DESKTOP_SCHEMA_VERSION });
    expect(data.state()).toBe('ready');
  });
});

describe('DesktopData 读写入口', () => {
  it('repository() 等库就绪后，经连上的适配器取仓储', async () => {
    const { data, db, connect } = setup();
    const repository = await data.repository(WeatherCity);
    expect(repository).toBe(db.table(WeatherCity));
    expect(connect).toHaveBeenLastCalledWith('sqlite-wasm');
  });

  it('库还没就绪时 repository() 先等着，就绪后再取仓储', async () => {
    let open: () => void = () => undefined;
    const gate = new Promise<void>(resolve => (open = resolve));
    const { data, db } = setup({ gate });
    let arrived = false;
    const pending = data.repository(WeatherCity).then(repository => {
      arrived = true;
      return repository;
    });

    await new Promise(resolve => setTimeout(resolve));
    expect(data.state()).toBe('connecting');
    expect(arrived).toBe(false);
    open();
    expect(await pending).toBe(db.table(WeatherCity));
  });

  it('transaction() 在适配器的事务里执行回调并返回结果', async () => {
    const { data, order } = setup({ probe: PROBES.current });
    await settled(data);
    const result = await data.transaction(async executor => {
      expect(executor).toBeDefined();
      return 'done';
    });
    expect(result).toBe('done');
    expect(order.at(-1)).toBe('transaction');
  });

  it('instantiate 交给 RxDB 的实体管理器，database 暴露底层 RxDB', async () => {
    const { data, rxdb, instantiate } = setup();
    expect(data.database).toBe(rxdb);
    expect(data.instantiate(WeatherCity, { name: 'Oslo' })).toEqual({ name: 'Oslo' });
    expect(instantiate).toHaveBeenLastCalledWith(WeatherCity, { name: 'Oslo' });
  });
});

describe('DesktopData.eraseLocalData', () => {
  function stubStorage(removeEntry: (name: string, options: object) => Promise<void>) {
    const remove = vi.fn(removeEntry);
    vi.stubGlobal('navigator', { storage: { getDirectory: async () => ({ removeEntry: remove }) } });
    return remove;
  }

  it('按顺序断开库、删掉库文件、再删掉 OPFS 里的文件体目录', async () => {
    const { data, order } = setup();
    await settled(data);
    const remove = stubStorage(async () => {
      order.push('removeEntry');
    });
    order.length = 0;

    await data.eraseLocalData();
    expect(order).toEqual(['adapter.disconnect', 'adapter.dropStorage', 'removeEntry']);
    expect(remove).toHaveBeenCalledExactlyOnceWith('aiao-desktop-files', { recursive: true });
  });

  it('文件体目录本来就不存在不算错', async () => {
    const { data } = setup();
    stubStorage(async () => {
      throw new DOMException('gone', 'NotFoundError');
    });
    await expect(data.eraseLocalData()).resolves.toBeUndefined();
  });

  it('删目录时的其他错误照常抛出', async () => {
    const { data } = setup();
    stubStorage(async () => {
      throw new DOMException('denied', 'NoModificationAllowedError');
    });
    await expect(data.eraseLocalData()).rejects.toThrow('denied');

    stubStorage(async () => {
      throw new Error('storage broke');
    });
    await expect(data.eraseLocalData()).rejects.toThrow('storage broke');
  });

  it('断开失败也继续清掉库文件和文件体，最后把断开的错误抛出去', async () => {
    const { data, adapter } = setup();
    const remove = stubStorage(async () => undefined);
    adapter.disconnect = vi.fn(async () => {
      throw new Error('still busy');
    }) as never;

    await expect(data.eraseLocalData()).rejects.toThrow('still busy');
    expect(adapter.dropStorage).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('适配器不是 sqlite-wasm 时什么也不删', async () => {
    const { data, adapter } = setup({ notSqlite: true });
    const remove = stubStorage(async () => undefined);
    await expect(data.eraseLocalData()).rejects.toThrow('桌面的本地适配器不是 sqlite-wasm');
    expect(adapter.dropStorage).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });
});

describe('DesktopData 多标签页（ADESK-US-105）', () => {
  /**
   * 记录进出锁的 Web Locks 替身：只数桌面自己的锁（`aiao-desktop-` 开头），任务一进锁加一，出锁减一。
   * RxDB 的主标签页选举也用 Web Locks 且整个页面生命周期都占着，不在统计里。
   */
  function trackLocks() {
    const state = { held: 0, requests: [] as string[] };
    vi.stubGlobal('navigator', {
      locks: {
        request: async (name: string, task: () => Promise<unknown>) => {
          if (!name.startsWith('aiao-desktop-')) return task();
          state.requests.push(name);
          state.held++;
          try {
            return await task();
          } finally {
            state.held--;
          }
        }
      }
    });
    return state;
  }

  it('tabs 是 createDesktopDatabase 给这个库配的跨标签页协调，每个库一份', async () => {
    const { data, rxdb } = setup({ probe: PROBES.current });
    await settled(data);
    expect(data.tabs).toBe(tabSyncOf(rxdb));
    expect(data.tabs).toBeInstanceOf(TabSync);
  });

  it('整个启动（连接、探测、建表、升级）在启动锁里：两个标签页同时打开桌面只有一个在建表与升级', async () => {
    const lock = trackLocks();
    const { data, order, adapter } = setup({ probe: PROBES.fresh });
    const held: Record<string, number> = {};
    const connect = adapter.connect;
    adapter.connect = vi.fn(async () => {
      held['connect'] = lock.held;
      await connect();
    }) as never;
    const transaction = adapter.transaction;
    adapter.transaction = vi.fn(async (...args: Parameters<typeof transaction>) => {
      held['upgrade'] = lock.held;
      return transaction(...args);
    }) as never;
    await settled(data);

    expect(lock.requests[0]).toBe('aiao-desktop-start');
    expect(held).toEqual({ connect: 1, upgrade: 1 });
    expect(order.slice(0, 4)).toEqual(['adapter.connect', 'probe', 'rxdb.connect', 'storage.init']);
    expect(lock.held).toBe(0);
  });

  it('启动失败时照样放锁，原因原样交给 ready', async () => {
    const lock = trackLocks();
    const { data } = setup({ connectError: new Error('OPFS busy') });
    await expect(data.ready).rejects.toThrow('OPFS busy');
    await settled(data);
    expect(lock.held).toBe(0);
    expect(data.problem()).toEqual({ kind: 'unavailable', message: 'OPFS busy' });
  });

  it('种子在这个数据域自己的锁里「查标记再写」：两个标签页同时第一次读同一个域，后到的看到标记就跳过', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.current });
    await settled(data);
    const lock = trackLocks();
    const transaction = adapter.transaction;
    const held: number[] = [];
    adapter.transaction = vi.fn(async (...args: Parameters<typeof transaction>) => {
      held.push(lock.held);
      return transaction(...args);
    }) as never;

    await data.ensureSeeded(Note);
    expect(lock.requests).toEqual(['aiao-desktop-seed:notes']);
    expect(held).toEqual([1]);
    expect(valueOf(db, seedMarkerKey('notes'))).toMatchObject({ version: 1 });

    /* 另一个标签页（同一个库）随后也第一次读 notes：标记已在，不再开事务。 */
    const second = setup({
      probe: PROBES.current,
      existing: [{ key: seedMarkerKey('notes'), value: { version: 1, seededAt: 1 } }]
    });
    await settled(second.data);
    await second.data.ensureSeeded(Note);
    expect(second.adapter.transaction).not.toHaveBeenCalled();
  });

  it('不同数据域的种子用不同的锁，互不排队', async () => {
    const lock = trackLocks();
    const { data } = setup({ probe: PROBES.current });
    await settled(data);
    lock.requests.length = 0;
    await Promise.all([data.ensureSeeded(Note), data.ensureSeeded(WeatherCity)]);
    expect(lock.requests.sort()).toEqual(['aiao-desktop-seed:notes', 'aiao-desktop-seed:weather']);
  });

  it('dataVersion 读适配器连接的 PRAGMA data_version：别的标签页提交写入时它才变', async () => {
    const { data, adapter } = setup({ probe: PROBES.current });
    await settled(data);
    adapter.internalQuery = vi.fn(async () => ({ results: [{ rows: [[7]] }] })) as never;
    await expect(data.dataVersion()).resolves.toBe(7);
    expect(adapter.internalQuery).toHaveBeenCalledExactlyOnceWith('PRAGMA data_version');

    adapter.internalQuery = vi.fn(async () => ({ results: [{ rows: [] }] })) as never;
    await expect(data.dataVersion()).rejects.toThrow('PRAGMA data_version 应该返回数字');
  });
});

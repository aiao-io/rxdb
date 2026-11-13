import { RxDB } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WeatherCity } from '../apps/weather/weather.entities';
import { configureServices } from '../testing/angular';
import { FakeDesktopData, FakeRepository } from '../testing/fake-desktop-data';
import { DesktopData, DesktopDataProblemError, seedMarkerKey } from './desktop-data';
import { createDesktopDatabase, schemaGuardOf } from './desktop-database';
import { DesktopSchemaStaleError } from './schema-guard';
import { adapterInspector, probeSchema } from './schema-probe';
import { DESKTOP_SCHEMA_VERSION, SCHEMA_RECORD_KEY, SchemaProbe } from './schema-version';
import { DATA_SEEDS } from './seeds';
import { SystemPreference } from './system-preference.entity';

vi.mock('./schema-probe', () => ({ adapterInspector: vi.fn(), probeSchema: vi.fn() }));

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
        writes.push({ key: (entity as Record<string, unknown>)['key'], inTransaction: depth > 0 });
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
  return { data, rxdb, db, adapter, inspector, order, writes, connect, storageInit, instantiate };
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
  it('先只读探测，再连接、准备文件存储，在一个事务里写版本记录，最后按数据域写种子', async () => {
    const { data, db, order, writes } = setup({ probe: PROBES.fresh });
    await settled(data);

    expect(order.slice(0, 4)).toEqual(['adapter.connect', 'probe', 'rxdb.connect', 'storage.init']);
    expect(data.state()).toBe('ready');
    expect(data.error()).toBeNull();
    expect(data.problem()).toBeNull();

    expect(valueOf(db, SCHEMA_RECORD_KEY)).toMatchObject({ version: DESKTOP_SCHEMA_VERSION, build: '' });
    expect(writes.find(write => write.key === SCHEMA_RECORD_KEY)?.inTransaction).toBe(true);
  });

  it('每个数据域的种子和它的标记在同一个事务里写入，标记记下种子版本', async () => {
    const { data, db, writes } = setup();
    await settled(data);

    const markers = rowsOf(db).filter(row => row.key.startsWith('seed:'));
    expect(markers.map(row => row.key)).toEqual(DATA_SEEDS.map(seed => seedMarkerKey(seed.domain)));
    for (const seed of DATA_SEEDS)
      expect(valueOf(db, seedMarkerKey(seed.domain))).toMatchObject({ version: seed.version });
    expect(writes.filter(write => String(write.key).startsWith('seed:')).every(write => write.inTransaction)).toBe(
      true
    );
    expect(db.table(WeatherCity).rows).toHaveLength(1);
  });

  it('available() 在库就绪后为 true', async () => {
    const { data } = setup();
    await expect(data.available()).resolves.toBe(true);
  });
});

describe('DesktopData 升级', () => {
  it('此前发布的构建建的库没有版本记录：当作版本 0 升级，补写版本记录和缺的种子，不当作损坏', async () => {
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
    expect(rowsOf(db).filter(row => row.key === seedMarkerKey('notes'))).toHaveLength(1);
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

  it('升级事务里的失败让库保持不可用：版本记录没有推进，不再写种子', async () => {
    const { data, db, adapter } = setup({ probe: PROBES.legacy });
    adapter.transaction = vi.fn(async () => {
      throw new Error('upgrade interrupted');
    }) as never;
    await settled(data);

    expect(data.state()).toBe('failed');
    expect(data.problem()).toEqual({ kind: 'unavailable', message: 'upgrade interrupted' });
    expect(valueOf(db, SCHEMA_RECORD_KEY)).toBeUndefined();
  });
});

describe('DesktopData 已是当前版本', () => {
  it('不再升级，不写版本记录', async () => {
    const { data, writes } = setup({ probe: PROBES.current });
    await settled(data);

    expect(data.state()).toBe('ready');
    expect(writes.some(write => write.key === SCHEMA_RECORD_KEY)).toBe(false);
  });

  it('已有种子标记的数据域不重写，只补缺的', async () => {
    const { data, db } = setup({
      probe: PROBES.current,
      existing: [{ key: seedMarkerKey('weather'), value: { version: 1, seededAt: 1 } }]
    });
    await settled(data);

    expect(db.table(WeatherCity).rows).toEqual([]);
    expect(valueOf(db, seedMarkerKey('contacts'))).toMatchObject({ version: 1 });
  });

  it('全部种子都有标记时，不开任何事务', async () => {
    const { data, adapter } = setup({
      probe: PROBES.current,
      existing: DATA_SEEDS.map(seed => ({
        key: seedMarkerKey(seed.domain),
        value: { version: seed.version, seededAt: 1 }
      }))
    });
    await settled(data);

    expect(data.state()).toBe('ready');
    expect(adapter.transaction).not.toHaveBeenCalled();
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
    const { data, order } = setup({
      probe: PROBES.current,
      existing: DATA_SEEDS.map(seed => ({ key: seedMarkerKey(seed.domain), value: {} }))
    });
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

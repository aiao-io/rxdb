import {
  RxDBLocalBackendTableError,
  RxDBLocalBackendUnavailableError,
  selectLocalBackend,
  type LocalBackendCandidate
} from './local-backend';

/** 造一个候选：默认可用、`create` 回自己的适配器名，个别字段按需覆盖。 */
const candidate = (
  adapter: string,
  dbName: string,
  overrides: Partial<LocalBackendCandidate<string>> = {}
): LocalBackendCandidate<string> => ({
  adapter,
  dbName,
  isAvailable: () => true,
  create: () => adapter,
  ...overrides
});

describe('selectLocalBackend', () => {
  it('顺序即优先级：多个候选同时可用时取第一个', () => {
    const selected = selectLocalBackend([
      candidate('sqlite-electron', 'demo_desktop'),
      candidate('wa-sqlite', 'demo_web')
    ]);

    expect(selected.adapter).toBe('sqlite-electron');
    expect(selected.dbName).toBe('demo_desktop');
  });

  it('跳过探针为 false 的候选', () => {
    const selected = selectLocalBackend([
      candidate('sqlite-electron', 'demo_desktop', { isAvailable: () => false }),
      candidate('wa-sqlite', 'demo_web')
    ]);

    expect(selected.adapter).toBe('wa-sqlite');
  });

  it('返回的是成对的名字 + 工厂，选择器自己不调用 create', () => {
    const create = vi.fn(() => 'built');
    const selected = selectLocalBackend([candidate('wa-sqlite', 'demo_web', { create })]);

    expect(create).not.toHaveBeenCalled();
    expect(selected.create()).toBe('built');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('选中之后不再问后面的探针', () => {
    const later = vi.fn(() => true);
    selectLocalBackend([
      candidate('sqlite-electron', 'demo_desktop'),
      candidate('wa-sqlite', 'demo_web', { isAvailable: later })
    ]);

    expect(later).not.toHaveBeenCalled();
  });

  it('全部不可用时抛错，不回落到任何候选', () => {
    const create = vi.fn(() => 'built');
    const call = () =>
      selectLocalBackend([
        candidate('sqlite-electron', 'demo_desktop', { isAvailable: () => false }),
        candidate('wa-sqlite', 'demo_web', { isAvailable: () => false, create })
      ]);

    expect(call).toThrow(RxDBLocalBackendUnavailableError);
    expect(call).toThrow(/sqlite-electron, wa-sqlite/);
    expect(create).not.toHaveBeenCalled();
  });

  it('空候选表抛表错误', () => {
    expect(() => selectLocalBackend([])).toThrow(RxDBLocalBackendTableError);
  });

  it('dbName 重复时拒绝整张表', () => {
    const call = () => selectLocalBackend([candidate('sqlite-electron', 'test_6'), candidate('wa-sqlite', 'test_6')]);

    expect(call).toThrow(RxDBLocalBackendTableError);
    expect(call).toThrow(/test_6/);
  });

  it('adapter 重复时拒绝整张表', () => {
    const call = () => selectLocalBackend([candidate('wa-sqlite', 'demo_a'), candidate('wa-sqlite', 'demo_b')]);

    expect(call).toThrow(RxDBLocalBackendTableError);
    expect(call).toThrow(/wa-sqlite/);
  });

  it('表校验先于探针：重复的表连一次探针都不问', () => {
    const isAvailable = vi.fn(() => true);

    expect(() =>
      selectLocalBackend([
        candidate('sqlite-electron', 'test_6', { isAvailable }),
        candidate('wa-sqlite', 'test_6', { isAvailable })
      ])
    ).toThrow(RxDBLocalBackendTableError);
    expect(isAvailable).not.toHaveBeenCalled();
  });

  it('两个错误都可判别，且都是 RxDBError 的子类', () => {
    const unavailable = new RxDBLocalBackendUnavailableError(['a', 'b']);
    const table = new RxDBLocalBackendTableError('boom');

    expect(unavailable.name).toBe('RxDBLocalBackendUnavailableError');
    expect(unavailable.adapters).toEqual(['a', 'b']);
    expect(table.name).toBe('RxDBLocalBackendTableError');
    expect(unavailable).toBeInstanceOf(Error);
    expect(table).toBeInstanceOf(Error);
  });
});

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BomViewPage from './bom-view';
interface DatabaseProbe {
  config: { dbName: string; entities: readonly unknown[] };
  destroy(): Promise<void>;
}
const probes = vi.hoisted(() => ({
  databases: [] as DatabaseProbe[],
  connect: vi.fn<() => Promise<void>>(),
  loadFixture: vi.fn()
}));
vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  RxDB: class {
    use = vi.fn(() => this);
    adapter = vi.fn(() => this);
    connect = vi.fn(() => probes.connect());
    destroy = vi.fn(async () => undefined);
    constructor(readonly config: DatabaseProbe['config']) {
      probes.databases.push(this);
    }
  }
}));
vi.mock('@aiao/rxdb-adapter-wa-sqlite', () => ({ RxDBAdapterWaSqlite: vi.fn(), SqliteRepository: class {} }));
vi.mock('@aiao/rxdb-plugin-bom/testing', () => ({
  BOM_VIEW_FIXTURE_DATES: { evaluation: '2099-01-01T00:00:00.000Z' },
  loadBomViewFixture: probes.loadFixture
}));
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
};
const fixture = { ids: {}, inputFor: vi.fn(() => ({})) };
beforeEach(() => {
  probes.databases.length = 0;
  probes.connect.mockReset().mockResolvedValue(undefined);
  probes.loadFixture.mockReset().mockResolvedValue(fixture);
});

const flush = async (): Promise<void> => {
  for (let index = 0; index < 8; index++) await Promise.resolve();
};
afterEach(async () => {
  TestBed.resetTestingModule();
  await flush();
});
const createPage = () => TestBed.runInInjectionContext(() => new BomViewPage());
describe('Angular BOM 页面资源边界', () => {
  it('数据库路径符合49字节限制，成功装载后销毁释放一次并清理只读桥', async () => {
    const page = createPage();
    await flush();
    expect(page.session()?.fixture).toBe(fixture);
    expect(new TextEncoder().encode(`${probes.databases[0].config.dbName}@0_1`).length).toBeLessThanOrEqual(49);
    expect((window as Window & { __bomViewDemo?: unknown }).__bomViewDemo).toBeDefined();
    TestBed.resetTestingModule();
    await flush();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
    expect((window as Window & { __bomViewDemo?: unknown }).__bomViewDemo).toBeUndefined();
  });
  it('连接完成前销毁禁止继续装种子，迟到完成后释放数据库', async () => {
    const connection = deferred();
    probes.connect.mockReturnValue(connection.promise);
    const page = createPage();
    TestBed.resetTestingModule();
    connection.resolve();
    await flush();
    expect(probes.loadFixture).not.toHaveBeenCalled();
    expect(page.session()).toBeNull();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
  });
  it('种子失败立即释放并保留原错误，随后销毁不重复释放', async () => {
    const failure = new Error('BOM种子失败');
    probes.loadFixture.mockRejectedValueOnce(failure);
    const page = createPage();
    await flush();
    expect(page.error()).toBe(failure);
    expect(page.enabled()).toBe(false);
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
    TestBed.resetTestingModule();
    await flush();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
  });
});

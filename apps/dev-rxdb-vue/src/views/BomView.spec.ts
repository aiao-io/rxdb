import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BomView from './BomView.vue';
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

vi.mock('@aiao/rxdb-plugin-bom-vue', async () => {
  const { h, shallowRef } = await import('vue');
  return {
    useBomView: vi.fn(() => ({ state: shallowRef({}), commands: { setInput: vi.fn() } })),
    BomTree: () => h('div', { 'data-testid': 'page-tree' }),
    BomLineEditor: () => h('div', { 'data-testid': 'page-editor' })
  };
});
let mounted: VueWrapper | undefined;
afterEach(async () => {
  mounted?.unmount();
  mounted = undefined;
  await flushPromises();
});
const createPage = () => {
  mounted = mount(BomView);
  return mounted;
};
describe('Vue BOM 页面资源边界', () => {
  it('数据库路径符合49字节限制，成功装载后卸载释放一次并清理只读桥', async () => {
    const page = createPage();
    await flushPromises();
    expect(page.find('[data-testid="page-tree"]').exists()).toBe(true);
    expect(new TextEncoder().encode(`${probes.databases[0].config.dbName}@0_1`).length).toBeLessThanOrEqual(49);
    page.unmount();
    mounted = undefined;
    await flushPromises();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
    expect((window as Window & { __bomViewDemo?: unknown }).__bomViewDemo).toBeUndefined();
  });
  it('连接完成前卸载禁止继续装种子，迟到完成后释放数据库', async () => {
    const connection = deferred();
    probes.connect.mockReturnValue(connection.promise);
    const page = createPage();
    page.unmount();
    mounted = undefined;
    connection.resolve();
    await flushPromises();
    expect(probes.loadFixture).not.toHaveBeenCalled();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
  });
  it('种子失败立即释放并呈现原错误，随后卸载不重复释放', async () => {
    probes.loadFixture.mockRejectedValueOnce(new Error('BOM种子失败'));
    const page = createPage();
    await flushPromises();
    expect(page.get('[role="alert"]').text()).toContain('BOM种子失败');
    expect(page.get('button').attributes('disabled')).toBeDefined();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
    page.unmount();
    mounted = undefined;
    await flushPromises();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
  });
});

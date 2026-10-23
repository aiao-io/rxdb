import type { BomViewInput, BomViewState } from '@aiao/rxdb-plugin-bom';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import BomViewPage from './bom-view';

interface DatabaseProbe {
  config: { dbName: string; entities: readonly unknown[] };
  destroy(): Promise<void>;
}

const probes = vi.hoisted(() => ({
  databases: [] as DatabaseProbe[],
  connect: vi.fn<() => Promise<void>>(),
  loadFixture: vi.fn(),
  useView: vi.fn()
}));

vi.mock('@aiao/rxdb', async importOriginal => ({
  ...(await importOriginal<typeof import('@aiao/rxdb')>()),
  RxDB: class {
    use = vi.fn(() => this);
    adapter = vi.fn(() => this);
    connect = vi.fn(() => probes.connect());
    destroy = vi.fn(async () => undefined);
    bom = { rollupCost: vi.fn(async () => ({})), exportBom: vi.fn(async () => ({})) };
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
vi.mock('@aiao/rxdb-plugin-bom-react', async () => {
  const { createElement } = await import('react');
  return {
    useBomView: probes.useView,
    BomTree: () => createElement('div', { 'data-testid': 'page-tree' }),
    BomLineEditor: () => createElement('div', { 'data-testid': 'page-editor' })
  };
});

const createFixture = () => ({
  ids: { occurrences: { draft: 'draft-row', pending: 'pending-row', repeat1: 'released-row' } },
  inputFor: (root: string, overrides: Partial<BomViewInput>): BomViewInput => ({
    context: { bomType: 'ebom', orgId: 'bom-view-org', asOfDate: new Date('2099-01-01T00:00:00Z') },
    target: { parentItemId: root },
    plannedQty: { value: '1', uom: 'pcs' },
    ...overrides
  }),
  actions: {
    publishPendingEcn: vi.fn(async () => undefined),
    publishQuantityEcn: vi.fn(async () => undefined),
    publishAssemblyRevision: vi.fn(async () => 'next-revision'),
    setConversion: vi.fn(async () => undefined),
    createCycleOccurrence: vi.fn(async () => 'cycle-row')
  }
});

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>(complete => {
    resolve = complete;
  });
  return { promise, resolve };
};

let fixture: ReturnType<typeof createFixture>;
let commands: {
  calculate: ReturnType<typeof vi.fn>;
  loadOccurrence: ReturnType<typeof vi.fn>;
  refresh: ReturnType<typeof vi.fn>;
};
const state: BomViewState = {
  phase: 'success',
  nodes: [],
  unresolved: [],
  truncated: null,
  quantityError: null,
  error: null,
  refreshing: false,
  editor: { phase: 'idle', value: null, saving: false, error: null }
};

beforeEach(() => {
  probes.databases.length = 0;
  probes.connect.mockReset().mockResolvedValue(undefined);
  fixture = createFixture();
  probes.loadFixture.mockReset().mockResolvedValue(fixture);
  commands = { calculate: vi.fn(async () => ({})), loadOccurrence: vi.fn(async () => undefined), refresh: vi.fn() };
  probes.useView.mockReset().mockReturnValue({ state, commands });
});

afterEach(async () => {
  await act(async () => cleanup());
});

describe('React BOM 页面装配边界', () => {
  it('独立数据库名连同版本后缀符合 wa-sqlite 的 49 字节路径上限', async () => {
    render(<BomViewPage />);
    await screen.findByText('BOM 数据已就绪');
    expect(new TextEncoder().encode(`${probes.databases[0].config.dbName}@0_1`).length).toBeLessThanOrEqual(49);
  });

  it('显式独立数据库与 UTC 输入接入绑定，卸载清除只读桥并释放自己的数据库', async () => {
    const mounted = render(<BomViewPage />);
    await screen.findByTestId('page-tree');
    expect(probes.databases).toHaveLength(1);
    expect(probes.databases[0].config.dbName).toMatch(/^bom-r-/);
    expect(probes.loadFixture).toHaveBeenCalledWith(probes.databases[0]);
    fireEvent.change(screen.getByLabelText('目标'), { target: { value: 'manual' } });
    fireEvent.change(screen.getByLabelText('评估日'), { target: { value: '2099-01-02T12:30' } });
    fireEvent.change(screen.getByLabelText('计划量'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('深度预算'), { target: { value: '2' } });
    expect(probes.useView).toHaveBeenLastCalledWith(
      probes.databases[0],
      expect.objectContaining({
        target: { parentItemId: 'manual' },
        plannedQty: { value: '7', uom: 'pcs' },
        budgets: { depth: 2 },
        context: { asOfDate: new Date('2099-01-02T12:30Z') }
      })
    );
    const bridge = window as Window & { __bomViewDemo?: { ids: unknown; state: BomViewState } };
    expect(bridge.__bomViewDemo?.ids).toBe(fixture.ids);
    expect(bridge.__bomViewDemo?.state).toBe(state);
    await act(async () => mounted.unmount());
    expect(bridge.__bomViewDemo).toBeUndefined();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
  });

  it('页内卸载与重新挂载保留数据库、输入与确定性种子', async () => {
    render(<BomViewPage />);
    await screen.findByTestId('page-tree');
    fireEvent.change(screen.getByLabelText('计划量'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: '卸载视图' }));
    expect(screen.queryByTestId('page-tree')).toBeNull();
    expect(probes.databases[0].destroy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: '重新挂载' }));
    expect(screen.getByTestId('page-tree')).toBeDefined();
    expect((screen.getByLabelText('计划量') as HTMLInputElement).value).toBe('5');
    expect(probes.databases).toHaveLength(1);
    expect(probes.loadFixture).toHaveBeenCalledOnce();
  });

  it('连接尚未完成就卸载，不再装种子或挂视图，迟到连接完成后仍释放数据库', async () => {
    const connection = deferred();
    probes.connect.mockReturnValue(connection.promise);
    const mounted = render(<BomViewPage />);
    expect(probes.loadFixture).not.toHaveBeenCalled();
    mounted.unmount();
    await act(async () => {
      connection.resolve();
      await connection.promise;
    });
    expect(probes.loadFixture).not.toHaveBeenCalled();
    expect(probes.useView).not.toHaveBeenCalled();
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
  });

  it('StrictMode 取消首次初始化，只为仍挂载的数据库装种子并清理两次实例', async () => {
    const mounted = render(
      <StrictMode>
        <BomViewPage />
      </StrictMode>
    );
    await screen.findByTestId('page-tree');
    expect(probes.databases).toHaveLength(2);
    expect(probes.databases[0].config.dbName).not.toBe(probes.databases[1].config.dbName);
    expect(probes.loadFixture).toHaveBeenCalledOnce();
    expect(probes.loadFixture).toHaveBeenCalledWith(probes.databases[1]);
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
    await act(async () => mounted.unmount());
    expect(probes.databases[1].destroy).toHaveBeenCalledOnce();
  });

  it('种子装载失败立即释放数据库，页面展示原始错误并保持动作禁用', async () => {
    probes.loadFixture.mockRejectedValueOnce(new Error('BOM 种子失败'));
    render(<BomViewPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('BOM 种子失败');
    expect(probes.databases[0].destroy).toHaveBeenCalledOnce();
    expect((screen.getByRole('button', { name: '发布新增ECN' }) as HTMLButtonElement).disabled).toBe(true);
    expect(probes.useView).not.toHaveBeenCalled();
  });

  it('编辑与发布动作原样派发，失败保留领域错误三字段', async () => {
    render(<BomViewPage />);
    await screen.findByTestId('page-tree');
    for (const [label, id] of [
      ['草稿编辑', 'draft-row'],
      ['ECN新行编辑', 'pending-row'],
      ['已发布行编辑', 'released-row']
    ]) {
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: label }));
      });
      expect(commands.loadOccurrence).toHaveBeenLastCalledWith(id);
    }
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '发布新增ECN' }));
    });
    expect(fixture.actions.publishPendingEcn).toHaveBeenCalledOnce();
    expect(screen.getByTestId('bom-demo-status').textContent).toBe('新增 ECN 已发布');
    expect((screen.getByRole('button', { name: '发布新增ECN' }) as HTMLButtonElement).disabled).toBe(true);
    const failure = Object.assign(new Error('检测到环'), { code: 'BOM_CYCLE', payload: { path: ['A', 'A'] } });
    fixture.actions.createCycleOccurrence.mockRejectedValueOnce(failure);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '尝试成环' }));
    });
    const text = screen.getByTestId('bom-demo-error').textContent;
    expect(text).toContain('检测到环');
    expect(text).toContain('BOM_CYCLE');
    expect(text).toContain('"path"');
  });
});

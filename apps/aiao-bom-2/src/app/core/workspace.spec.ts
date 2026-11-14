import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDraft } from './draft';
import { DraftVersionStore } from './draft-version-store';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';
import { BomWorkspace } from './workspace';

beforeEach(() => {
  vi.spyOn(DraftVersionStore.prototype, 'save').mockResolvedValue();
  vi.spyOn(DraftVersionStore.prototype, 'history').mockResolvedValue({ headCommitId: null, dirty: true, commits: [] });
  vi.spyOn(DraftVersionStore.prototype, 'read').mockImplementation(async (_branch, draft) => draft);
  vi.spyOn(DraftVersionStore.prototype, 'commit').mockImplementation(async (branch, _message, id) => ({
    id,
    parentId: branch.headCommitId,
    createdAt: new Date().toISOString()
  }));

  window.history.replaceState({}, '', '/');
  vi.spyOn(WorkspaceRepository.prototype, 'read').mockResolvedValue(undefined);
  vi.spyOn(WorkspaceRepository.prototype, 'write').mockResolvedValue();
  vi.spyOn(WorkspaceRepository.prototype, 'readAll').mockResolvedValue([]);
  vi.spyOn(WorkspaceRepository.prototype, 'writeMany').mockResolvedValue();
});
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  vi.restoreAllMocks();
});
function respond(count = 20): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response(JSON.stringify(makeStressDataset(count)), { status: 200 }))
  );
}
describe('工作区状态一致性', () => {
  it('过期加载不能覆盖后来选择的数据集', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(done => {
            resolve = done;
          })
      )
    );
    const ws = new BomWorkspace();
    const old = ws.loadWindrose();
    await ws.loadStress(50);
    resolve(new Response(JSON.stringify(makeStressDataset(20))));
    await old;
    expect(ws.dataset()?.parts).toHaveLength(50);
  });
  it('空结构深链接不能让合成数据进入不存在的 CAD 树', async () => {
    window.history.replaceState({}, '', '/?structure=cad');
    const ws = new BomWorkspace();
    await ws.loadStress(50);
    expect(ws.query().structure).toBe('catalog');
    expect(ws.result().total).toBe(50);
  });
  it('pn 深链接选中行并展开祖先，草稿持久化与撤销有效', async () => {
    const data = makeStressDataset(20);
    window.history.replaceState({}, '', `/?pn=${data.structures.catalog[19].compId}`);
    respond();
    const ws = new BomWorkspace();
    await ws.initialize();
    expect(ws.selected()?.partId).toBe(data.structures.catalog[19].partId);
    expect(ws.expanded().length).toBeGreaterThan(0);
    ws.fork();
    const key = ws.draft()!.nodes[1].key;
    ws.edit([key], '2.5', '件', '0.1');
    expect(ws.canUndo()).toBe(true);
    ws.undo();
    expect(ws.draft()!.nodes[1].quantity).toBe('1');
    ws.redo();
    expect(ws.draft()!.nodes[1].quantity).toBe('2.5');
    await vi.waitFor(() => expect(ws.saveStatus()).toBe('已保存到本机'));
    expect(DraftVersionStore.prototype.save).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: ws.activeBranchId() }),
      ws.draft()
    );
  });
  it('同物料多个位置由模型选择时切换具体 CAD 身份', async () => {
    respond();
    const ws = new BomWorkspace();
    await ws.initialize();
    ws.fork();
    const draft = ws.draft()!;
    ws.saveBaseline();
    expect(ws.baseline()).toEqual(draft);
    ws.add(null, 'CUSTOM-1', '2', '件');
    expect(ws.draft()!.nodes.at(-1)!.partId).toBe('CUSTOM-1');
    ws.remove([ws.draft()!.nodes.at(-1)!.key]);
    expect(ws.draft()!.nodes).toHaveLength(20);
  });
  it('损坏的持久视图不污染查询状态，换数据集重置历史', async () => {
    vi.spyOn(WorkspaceRepository.prototype, 'read').mockImplementation(async key =>
      key.startsWith('view:') ? { structure: 'unknown', mode: 'nonsense', scope: 'bad' } : undefined
    );
    respond();
    const ws = new BomWorkspace();
    await ws.initialize();
    expect(ws.query().structure).toBe('catalog');
    ws.fork();
    ws.edit([ws.draft()!.nodes[0].key], '2', '件', null);
    await ws.loadStress(10);
    expect(ws.canUndo()).toBe(false);
    expect(ws.canRedo()).toBe(false);
  });
});

describe('工作树分支隔离与保存顺序', () => {
  it('同一修订号的两个分支切换后，表格和工作树都读取目标分支', async () => {
    const documents = new Map<string, unknown>();
    vi.mocked(WorkspaceRepository.prototype.writeMany).mockImplementation(async entries => {
      for (const [key, value] of entries) documents.set(key, value);
    });
    vi.mocked(WorkspaceRepository.prototype.read).mockImplementation(async key => documents.get(key));
    respond(4);
    const ws = new BomWorkspace();
    await ws.initialize();
    ws.fork('底盘');
    const first = ws.activeBranchId()!;
    ws.edit(['stress:1'], '2.5', '件', null);
    await vi.waitFor(() => expect(ws.saveStatus()).toBe('已保存到本机'));
    ws.changeStructure('catalog');
    ws.fork('电池');
    ws.edit(['stress:1'], '7', '件', null);
    expect(ws.index()?.nodes.get('stress:1')?.quantity).toBe('7');
    await ws.switchDraftBranch(first);
    expect(ws.draft()?.revision).toBe(1);
    expect(ws.index()?.nodes.get('stress:1')?.quantity).toBe('2.5');
    const active = [...documents.values()].filter(
      value => typeof value === 'object' && value !== null && 'active' in value && value.active
    );
    expect(active).toHaveLength(1);
  });

  it('延迟保存期间新建分支，保存队列仍使用各自的草稿内容', async () => {
    let finish!: () => void;
    const saving = vi.mocked(DraftVersionStore.prototype.save);
    saving.mockImplementationOnce(
      () =>
        new Promise<void>(resolve => {
          finish = resolve;
        })
    );
    respond(4);
    const ws = new BomWorkspace();
    await ws.initialize();
    ws.fork('底盘');
    const first = ws.activeBranchId();
    await vi.waitFor(() => expect(saving).toHaveBeenCalled());
    ws.edit(['stress:1'], '2.5', '件', null);
    ws.changeStructure('catalog');
    ws.fork('电池');
    const second = ws.activeBranchId();
    finish();
    await vi.waitFor(() => expect(ws.saveStatus()).toBe('已保存到本机'));
    const calls = saving.mock.calls;
    expect(calls[1][0].id).toBe(first);
    expect(calls[1][1].nodes.find(node => node.key === 'stress:1')?.quantity).toBe('2.5');
    expect(calls[2][0].id).toBe(second);
    expect(calls[2][1].nodes.find(node => node.key === 'stress:1')?.quantity).toBe('1');
  });
});

describe('选择、持久化失败与恢复边界', () => {
  it('多位置物料转 CAD 后定位具体节点，单一位置与精确节点沿用当前结构', async () => {
    const data = makeStressDataset(4);
    data.structures.catalog[2].partId = data.structures.catalog[1].partId;
    data.structures.cad = data.structures.catalog.map((node, i) => ({
      ...node,
      key: `cad:${i + 10}`,
      parentKey: i ? 'cad:10' : null,
      nodeIndex: i + 10,
      source: 'cad'
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    const ws = new BomWorkspace();
    await ws.initialize();
    ws.fromModel(12, data.parts[1].id);
    expect(ws.query().structure).toBe('cad');
    expect(ws.selection()).toBe('cad:12');
    expect(ws.notice()).toContain('2 个使用位置');
    ws.fromModel(11, data.parts[1].id);
    expect(ws.selection()).toBe('cad:11');
    ws.changeStructure('catalog');
    ws.fromModel(13, data.parts[3].id);
    expect(ws.query().structure).toBe('catalog');
    expect(ws.selection()).toBe('stress:3');
    ws.enter('stress:0');
    expect(ws.breadcrumbs()).toHaveLength(1);
    ws.setExpanded(['stress:0']);
    expect(ws.expanded()).toEqual(['stress:0']);
    ws.choose(ws.index()!.rows.get('stress:1')!, true);
    expect(ws.selectedKeys().size).toBe(2);
    ws.locate('does-not-exist');
    expect(ws.selection()).toBe('stress:1');
  });
  it('无法写入时显示失败，后续保存能恢复且旧失败不能覆盖新状态', async () => {
    respond();
    const ws = new BomWorkspace();
    await ws.initialize();
    vi.mocked(WorkspaceRepository.prototype.writeMany).mockRejectedValue(new Error('quota'));
    vi.mocked(WorkspaceRepository.prototype.write).mockRejectedValue(new Error('quota'));
    ws.fork();
    await vi.waitFor(() => expect(ws.saveStatus()).toBe('保存失败'));
    expect(ws.notice()).toContain('quota');
    ws.saveBaseline();
    await vi.waitFor(() => expect(ws.notice()).toContain('基线保存失败'));
    ws.updateQuery({ market: 'EU' });
    await vi.waitFor(() => expect(ws.notice()).toContain('视图保存失败'));
    vi.mocked(WorkspaceRepository.prototype.write).mockResolvedValue();
    vi.mocked(WorkspaceRepository.prototype.writeMany).mockResolvedValue();
    ws.edit(['stress:1'], '3', '件', null);
    await vi.waitFor(() => expect(ws.saveStatus()).toBe('已保存到本机'));
  });
  it('来源 HTTP / 版本错误及本地读取失败不伪装成空清单', async () => {
    const ws = new BomWorkspace();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await ws.initialize();
    expect(ws.error()).toContain('503');
    expect(ws.loading()).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"schema":"old"}')));
    await ws.loadWindrose();
    expect(ws.error()).toContain('版本不受支持');
    respond();
    vi.mocked(WorkspaceRepository.prototype.read).mockRejectedValue(new Error('broken db'));
    await ws.loadWindrose();
    expect(ws.notice()).toContain('读取失败');
    expect(ws.result().rows).toHaveLength(20);
    const empty = new BomWorkspace();
    expect(() => empty.edit([], '1', '件', null)).toThrow('草稿');
    expect(() => empty.add(null, 'X', '1', '件')).toThrow('草稿');
  });
  it('保存的草稿、基线和合法视图重开时恢复，发生位置深链接优先于件号', async () => {
    const data = makeStressDataset(20);
    const draft = createDraft(data, data.structures.catalog);
    const view = {
      structure: 'draft',
      mode: 'summary',
      issue: 'conflict',
      sort: 'name',
      market: 'US',
      expanded: ['stress:0', 'deleted'],
      only3d: false,
      includeCatalog: true,
      descending: true
    };
    vi.mocked(WorkspaceRepository.prototype.read).mockImplementation(async key =>
      key.startsWith('view:') ? view : draft
    );
    window.history.replaceState(
      {},
      '',
      '/?structure=draft&view=flat&market=EU&scope=stress%3A0&occurrence=stress%3A19&pn=ST-000001'
    );
    respond();
    const ws = new BomWorkspace();
    await ws.initialize();
    expect(ws.draft()?.nodes).toHaveLength(20);
    expect(ws.baseline()?.nodes).toHaveLength(20);
    expect(ws.selection()).toBe('stress:19');
    expect(ws.query()).toMatchObject({
      mode: 'flat',
      structure: 'draft',
      market: 'EU',
      scope: 'stress:0',
      descending: true
    });
    expect(ws.expanded()).not.toContain('deleted');
  });
});

describe('取消数据装载', () => {
  it('取消慢来源后保留原数据与选择，迟到结果不能覆盖', async () => {
    respond(20);
    const ws = new BomWorkspace();
    await ws.initialize();
    ws.locate('stress:19');
    let finish!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>(resolve => {
            finish = resolve;
          })
      )
    );
    const loading = ws.loadWindrose();
    ws.cancelLoad();
    expect(ws.loading()).toBe(false);
    expect(ws.selection()).toBe('stress:19');
    finish(new Response(JSON.stringify(makeStressDataset(50))));
    await loading;
    expect(ws.dataset()?.parts).toHaveLength(20);
    expect(ws.notice()).toContain('取消');
  });
  it('取消本地视图读取中的新装载时不提前替换当前数据', async () => {
    respond(20);
    const ws = new BomWorkspace();
    await ws.initialize();
    ws.locate('stress:19');
    const originalUrl = location.href;
    let finish!: (value: undefined) => void;
    const pending = new Promise<undefined>(resolve => {
      finish = resolve;
    });
    const read = vi.mocked(WorkspaceRepository.prototype.read).mockReturnValue(pending);
    read.mockClear();
    const loading = ws.loadStress(50);
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    expect(ws.dataset()?.parts).toHaveLength(20);
    ws.cancelLoad();
    finish(undefined);
    await loading;
    expect(ws.dataset()?.parts).toHaveLength(20);
    expect(ws.selection()).toBe('stress:19');
    expect(location.href).toBe(originalUrl);
  });
});

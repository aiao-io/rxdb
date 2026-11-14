import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomWorkspace } from './workspace';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';
import { createDraft } from './draft';

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.spyOn(WorkspaceRepository.prototype, 'read').mockResolvedValue(undefined);
  vi.spyOn(WorkspaceRepository.prototype, 'write').mockResolvedValue();
  vi.spyOn(WorkspaceRepository.prototype, 'readAll').mockResolvedValue([]);
  vi.spyOn(WorkspaceRepository.prototype, 'writeMany').mockResolvedValue();
});
afterEach(() => vi.restoreAllMocks());
function respond(count = 20): void {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(makeStressDataset(count)), { status: 200 })));
}
describe('工作区状态一致性', () => {
  it('过期加载不能覆盖后来选择的数据集', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>(done => { resolve = done; })));
    const ws = new BomWorkspace();
    const old = ws.loadWindrose();
    await ws.loadStress(50);
    resolve(new Response(JSON.stringify(makeStressDataset(20))));
    await old;
    expect(ws.dataset()?.parts).toHaveLength(50);
  });
  it('空结构深链接不能让合成数据进入不存在的 CAD 树', async () => {
    window.history.replaceState({}, '', '/?structure=cad');
    const ws = new BomWorkspace(); await ws.loadStress(50);
    expect(ws.query().structure).toBe('catalog');
    expect(ws.result().total).toBe(50);
  });
  it('pn 深链接选中行并展开祖先，草稿持久化与撤销有效', async () => {
    const data = makeStressDataset(20);
    window.history.replaceState({}, '', `/?pn=${data.structures.catalog[19].compId}`);
    respond(); const ws = new BomWorkspace(); await ws.initialize();
    expect(ws.selected()?.partId).toBe(data.structures.catalog[19].partId);
    expect(ws.expanded().length).toBeGreaterThan(0);
    ws.fork(); const key = ws.draft()!.nodes[1].key;
    ws.edit([key], '2.5', '件', '0.1');
    expect(ws.canUndo()).toBe(true);
    ws.undo(); expect(ws.draft()!.nodes[1].quantity).toBe('1');
    ws.redo(); expect(ws.draft()!.nodes[1].quantity).toBe('2.5');
    expect(WorkspaceRepository.prototype.write).toHaveBeenCalledWith(expect.stringContaining('draft:'), expect.objectContaining({ schema: 'aiao-bom-2-draft/1' }));
  });
  it('同物料多个位置由模型选择时切换具体 CAD 身份', async () => {
    respond(); const ws = new BomWorkspace(); await ws.initialize();
    const draft = createDraft(ws.dataset()!, ws.dataset()!.structures.catalog);
    ws.acceptImport(draft); ws.saveBaseline();
    expect(ws.baseline()).toEqual(draft);
    ws.add(null, 'CUSTOM-1', '2', '件');
    expect(ws.draft()!.nodes.at(-1)!.partId).toBe('CUSTOM-1');
    ws.remove([ws.draft()!.nodes.at(-1)!.key]);
    expect(ws.draft()!.nodes).toHaveLength(20);
  });
  it('损坏的持久视图不污染查询状态，换数据集重置历史', async () => {
    vi.spyOn(WorkspaceRepository.prototype, 'read').mockImplementation(async key => key.startsWith('view:') ? { structure: 'unknown', mode: 'nonsense', scope: 'bad' } : undefined);
    respond(); const ws = new BomWorkspace(); await ws.initialize();
    expect(ws.query().structure).toBe('catalog');
    ws.fork(); ws.edit([ws.draft()!.nodes[0].key], '2', '件', null);
    await ws.loadStress(10);
    expect(ws.canUndo()).toBe(false); expect(ws.canRedo()).toBe(false);
  });
});

describe('选择、持久化失败与恢复边界', () => {
  it('多位置物料转 CAD 后定位具体节点，单一位置与精确节点沿用当前结构', async () => {
    const data = makeStressDataset(4);
    data.structures.catalog[2].partId = data.structures.catalog[1].partId;
    data.structures.cad = data.structures.catalog.map((node, i) => ({ ...node, key: `cad:${i + 10}`, parentKey: i ? 'cad:10' : null, nodeIndex: i + 10, source: 'cad' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    const ws = new BomWorkspace(); await ws.initialize();
    ws.fromModel(12, data.parts[1].id); expect(ws.query().structure).toBe('cad'); expect(ws.selection()).toBe('cad:12'); expect(ws.notice()).toContain('2 个使用位置');
    ws.fromModel(11, data.parts[1].id); expect(ws.selection()).toBe('cad:11');
    ws.changeStructure('catalog'); ws.fromModel(13, data.parts[3].id); expect(ws.query().structure).toBe('catalog'); expect(ws.selection()).toBe('stress:3');
    ws.enter('stress:0'); expect(ws.breadcrumbs()).toHaveLength(1); ws.setExpanded(['stress:0']); expect(ws.expanded()).toEqual(['stress:0']);
    ws.choose(ws.index()!.rows.get('stress:1')!, true); expect(ws.selectedKeys().size).toBe(2);
    ws.locate('does-not-exist'); expect(ws.selection()).toBe('stress:1');
  });
  it('无法写入时显示失败，后续保存能恢复且旧失败不能覆盖新状态', async () => {
    respond(); const ws = new BomWorkspace(); await ws.initialize();
    vi.mocked(WorkspaceRepository.prototype.write).mockRejectedValue(new Error('quota'));
    ws.fork(); await vi.waitFor(() => expect(ws.saveStatus()).toBe('保存失败')); expect(ws.notice()).toContain('quota');
    ws.saveBaseline(); await vi.waitFor(() => expect(ws.notice()).toContain('基线保存失败'));
    ws.updateQuery({ market: 'EU' }); await vi.waitFor(() => expect(ws.notice()).toContain('视图保存失败'));
    vi.mocked(WorkspaceRepository.prototype.write).mockResolvedValue(); ws.edit(['stress:1'], '3', '件', null);
    await vi.waitFor(() => expect(ws.saveStatus()).toBe('已保存到本机'));
  });
  it('来源 HTTP / 版本错误及本地读取失败不伪装成空清单', async () => {
    const ws = new BomWorkspace(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 503 })));
    await ws.initialize(); expect(ws.error()).toContain('503'); expect(ws.loading()).toBe(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"schema":"old"}')));
    await ws.loadWindrose(); expect(ws.error()).toContain('版本不受支持');
    respond(); vi.mocked(WorkspaceRepository.prototype.read).mockRejectedValue(new Error('broken db'));
    await ws.loadWindrose(); expect(ws.notice()).toContain('读取失败'); expect(ws.result().rows).toHaveLength(20);
    const empty = new BomWorkspace(); expect(() => empty.edit([], '1', '件', null)).toThrow('草稿'); expect(() => empty.add(null, 'X', '1', '件')).toThrow('草稿');
  });
  it('保存的草稿、基线和合法视图重开时恢复，发生位置深链接优先于件号', async () => {
    const data = makeStressDataset(20); const draft = createDraft(data, data.structures.catalog);
    const view = { structure: 'draft', mode: 'summary', issue: 'conflict', sort: 'name', market: 'US', expanded: ['stress:0', 'deleted'], only3d: false, includeCatalog: true, descending: true };
    vi.mocked(WorkspaceRepository.prototype.read).mockImplementation(async key => key.startsWith('view:') ? view : draft);
    window.history.replaceState({}, '', '/?structure=draft&view=flat&market=EU&scope=stress%3A0&occurrence=stress%3A19&pn=ST-000001');
    respond(); const ws = new BomWorkspace(); await ws.initialize();
    expect(ws.draft()?.nodes).toHaveLength(20); expect(ws.baseline()?.nodes).toHaveLength(20);
    expect(ws.selection()).toBe('stress:19'); expect(ws.query()).toMatchObject({ mode: 'flat', structure: 'draft', market: 'EU', scope: 'stress:0', descending: true });
    expect(ws.expanded()).not.toContain('deleted');
  });
});

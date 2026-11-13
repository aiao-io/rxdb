import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomWorkspace } from './workspace';
import { WorkspaceRepository } from './storage';
import { makeStressDataset } from './stress-data';
import { createDraft } from './draft';

beforeEach(() => {
  window.history.replaceState({}, '', '/');
  vi.spyOn(WorkspaceRepository.prototype, 'read').mockResolvedValue(undefined);
  vi.spyOn(WorkspaceRepository.prototype, 'write').mockResolvedValue();
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

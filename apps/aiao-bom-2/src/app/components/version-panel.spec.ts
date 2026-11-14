import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftVersionStore } from '../core/draft-version-store';
import { compareSnapshots, createSnapshot } from '../core/snapshot';
import { WorkspaceRepository } from '../core/storage';
import { makeStressDataset } from '../core/stress-data';
import { BomWorkspace } from '../core/workspace';
import { VersionPanel } from './version-panel';

let fixture: ComponentFixture<VersionPanel>;
let panel: VersionPanel;
let ws: BomWorkspace;
const documents = new Map<string, unknown>();
beforeEach(async () => {
  vi.spyOn(DraftVersionStore.prototype, 'save').mockResolvedValue();
  vi.spyOn(DraftVersionStore.prototype, 'history').mockResolvedValue({ headCommitId: null, dirty: true, commits: [] });
  vi.spyOn(DraftVersionStore.prototype, 'read').mockImplementation(async (_branch, draft) => draft);
  vi.spyOn(DraftVersionStore.prototype, 'commit').mockImplementation(async (branch, _message, id) => ({
    id,
    parentId: branch.headCommitId,
    createdAt: new Date().toISOString()
  }));

  documents.clear();
  vi.spyOn(WorkspaceRepository.prototype, 'read').mockImplementation(async key => documents.get(key));
  vi.spyOn(WorkspaceRepository.prototype, 'readAll').mockResolvedValue([]);
  vi.spyOn(WorkspaceRepository.prototype, 'write').mockResolvedValue();
  vi.spyOn(WorkspaceRepository.prototype, 'writeMany').mockImplementation(async entries => {
    for (const [key, value] of entries) documents.set(key, value);
  });
  ws = new BomWorkspace();
  ws.dataset.set(makeStressDataset(4));
  await ws.versions.openDataset(ws.dataset()!.id);
  TestBed.configureTestingModule({ imports: [VersionPanel], providers: [{ provide: BomWorkspace, useValue: ws }] });
  fixture = TestBed.createComponent(VersionPanel);
  panel = fixture.componentInstance;
  fixture.detectChanges();
});
afterEach(async () => {
  await new Promise(resolve => setTimeout(resolve, 0));
  fixture.destroy();
  TestBed.resetTestingModule();
  vi.restoreAllMocks();
});
const root = () => fixture.nativeElement as HTMLElement;
const save = async (name: string) => {
  panel.form.setValue({ name, evaluationDate: '2026-11-14' });
  await panel.save();
  fixture.detectChanges();
};
describe('版本快照操作面板', () => {
  it('保存完整结构忽略视图筛选，草稿修改通过两版本呈现并保留来源日期', async () => {
    expect(panel.form.controls.evaluationDate.value).toBe('2026-11-13');
    ws.fork();
    await save('基准');
    ws.updateQuery({ search: 'ST-000001' });
    ws.edit(['stress:1'], '2.5', '件', '0.2');
    await save('目标');
    expect(ws.versions.entries().map(entry => entry.nodeCount)).toEqual([4, 4]);
    expect(ws.versions.result()?.summary.quantityChanges).toBe(1);
    expect(root().querySelector<HTMLSelectElement>('[aria-label="目标版本"]')?.value).toBe(ws.versions.afterId());
    expect(root().querySelector<HTMLSelectElement>('[aria-label="基准版本"]')?.value).toBe(ws.versions.beforeId());
    expect(root().querySelector('table')?.textContent).toContain('2.5');
    expect(root().textContent).toContain('单位成本');
    expect(root().textContent).toContain('1.5');
    expect(ws.versions.result()?.after.observedOn).toBe('2026-11-13');
    expect(ws.notice()).toContain('目标');
  });

  it('版本历史展示当前分支、HEAD 和提交链', async () => {
    ws.fork('底盘校核');
    await ws.commitDraft('建立底盘基线');
    ws.edit(['stress:1'], '2.5', '件', null);
    await ws.commitDraft('确认第一项用量');
    fixture.detectChanges();
    expect(root().textContent).toContain('底盘校核');
    expect(root().textContent).toContain('确认第一项用量');
    expect(root().textContent).toContain('建立底盘基线');
    expect(root().textContent).toContain('HEAD');
    expect(root().querySelectorAll('.commit-list li')).toHaveLength(2);
  });

  it('名称或日期无效、保存失败都保留输入并显示原因', async () => {
    await panel.save();
    expect(panel.error()).toContain('名称');
    panel.form.setValue({ name: ' ', evaluationDate: '2026-11-14' });
    await panel.save();
    expect(panel.error()).toContain('name');
    panel.form.setValue({ name: 'A', evaluationDate: '2026-02-30' });
    await panel.save();
    expect(panel.error()).toContain('日期');
    vi.mocked(WorkspaceRepository.prototype.writeMany).mockRejectedValueOnce(new Error('quota'));
    await save('A');
    expect(panel.error()).toBe('quota');
    expect(ws.versions.entries()).toHaveLength(0);
    await save('A');
    expect(panel.error()).toBe('');
    expect(ws.versions.entries()).toHaveLength(1);
    const key = vi.spyOn(new Event('keydown'), 'preventDefault');
    await panel.save({ preventDefault: key } as unknown as Event);
    expect(key).toHaveBeenCalled();
  });

  it('数百项差异只渲染一页，分页、类型筛选和搜索可组合', async () => {
    const data = makeStressDataset(250);
    const base = createSnapshot({
      id: 'a',
      datasetId: data.id,
      name: 'a',
      source: 'dataset',
      structure: 'catalog',
      version: 'A',
      evaluationDate: '2026-01-01',
      observedOn: data.observedOn,
      savedAt: '2026-11-14T00:00:00.000Z',
      nodes: data.structures.catalog
    });
    const next = createSnapshot({ ...base, id: 'b', nodes: base.nodes.map(node => ({ ...node, quantity: '2' })) });
    ws.versions.result.set(compareSnapshots(base, next));
    fixture.detectChanges();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(100);
    panel.offset.set(2);
    fixture.detectChanges();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(50);
    panel.setSearch('ST-000249');
    fixture.detectChanges();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(1);
    expect(panel.page()).toBe(0);
    panel.setFilter('removed');
    fixture.detectChanges();
    expect(root().textContent).toContain('当前条件没有匹配差异');
    panel.setFilter('quantity');
    expect(panel.changes()).toHaveLength(1);
    panel.setSearch('');
    expect(panel.changes()).toHaveLength(250);
    await panel.choose('before', '');
    expect(ws.versions.result()).toBeNull();
    expect(panel.offset()).toBe(0);
  });

  it('字段细节包含数量状态、单位和市场，不把不可计算值显示为默认量', () => {
    const node = makeStressDataset(1).structures.catalog[0];
    expect(panel.fieldValue(null, 'quantity')).toBe('∅');
    expect(panel.fieldValue({ ...node, quantity: null }, 'quantity')).toBe('未填写');
    expect(panel.fieldValue(node, 'parent')).toBe('根位置');
    expect(panel.fieldValue(node, 'identity')).toContain('synthetic');
    expect(panel.fieldValue({ ...node, markets: [] }, 'markets')).toBe('未声明');
    expect(panel.fieldValue({ ...node, compId: 'variant' }, 'replacement')).toContain('variant');
    expect(panel.fieldValue({ ...node, quantityState: 'ambiguous' }, 'quantityState')).toBe('歧义');
    expect(panel.value({ target: { value: 'x' } } as unknown as Event)).toBe('x');
    expect(panel.name('purchase')).toBe('采购层级');
  });
});

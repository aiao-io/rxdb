import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomWorkspace } from '../core/workspace';
import { WorkspaceRepository } from '../core/storage';
import { makeStressDataset } from '../core/stress-data';
import { compareSnapshots, createSnapshot } from '../core/snapshot';
import { VersionPanel } from './version-panel';

let fixture: ComponentFixture<VersionPanel>;
let panel: VersionPanel;
let ws: BomWorkspace;
const documents = new Map<string, unknown>();
beforeEach(async () => {
  documents.clear();
  vi.spyOn(WorkspaceRepository.prototype, 'read').mockImplementation(async key => documents.get(key));
  vi.spyOn(WorkspaceRepository.prototype, 'readAll').mockResolvedValue([]);
  vi.spyOn(WorkspaceRepository.prototype, 'write').mockResolvedValue();
  vi.spyOn(WorkspaceRepository.prototype, 'writeMany').mockImplementation(async entries => { for (const [key, value] of entries) documents.set(key, value); });
  ws = new BomWorkspace(); ws.dataset.set(makeStressDataset(4));
  await ws.versions.openDataset(ws.dataset()!.id);
  TestBed.configureTestingModule({ imports: [VersionPanel], providers: [{ provide: BomWorkspace, useValue: ws }] });
  fixture = TestBed.createComponent(VersionPanel); panel = fixture.componentInstance; fixture.detectChanges();
});
afterEach(() => { fixture.destroy(); TestBed.resetTestingModule(); vi.restoreAllMocks(); });
const root = () => fixture.nativeElement as HTMLElement;
const save = async (name: string) => { panel.form.setValue({ name, evaluationDate: '2026-11-14' }); await panel.save(); fixture.detectChanges(); };
const fileEvent = (file?: File): Event => {
  const input = document.createElement('input'); Object.defineProperty(input, 'files', { value: file ? [file] : [] });
  const event = new Event('change'); Object.defineProperty(event, 'target', { value: input }); return event;
};

describe('版本快照操作面板', () => {
  it('保存完整结构忽略视图筛选，草稿修改通过两版本呈现并保留来源日期', async () => {
    expect(panel.form.controls.evaluationDate.value).toBe('2026-11-13');
    ws.fork(); await save('基准');
    ws.updateQuery({ search: 'ST-000001' }); ws.edit(['stress:1'], '2.5', '件', '0.2');
    await save('目标');
    expect(ws.versions.entries().map(entry => entry.nodeCount)).toEqual([4, 4]);
    expect(ws.versions.result()?.summary.quantityChanges).toBe(1);
    expect(root().querySelector('table')?.textContent).toContain('2.5');
    expect(root().textContent).toContain('单位成本'); expect(root().textContent).toContain('1.5');
    expect(ws.versions.result()?.after.observedOn).toBe('2026-11-13');
    expect(ws.notice()).toContain('目标');
  });

  it('名称或日期无效、保存失败都保留输入并显示原因', async () => {
    await panel.save(); expect(panel.error()).toContain('名称');
    panel.form.setValue({ name: ' ', evaluationDate: '2026-11-14' }); await panel.save(); expect(panel.error()).toContain('name');
    panel.form.setValue({ name: 'A', evaluationDate: '2026-02-30' }); await panel.save(); expect(panel.error()).toContain('日期');
    vi.mocked(WorkspaceRepository.prototype.writeMany).mockRejectedValueOnce(new Error('quota'));
    await save('A'); expect(panel.error()).toBe('quota'); expect(ws.versions.entries()).toHaveLength(0);
    await save('A'); expect(panel.error()).toBe(''); expect(ws.versions.entries()).toHaveLength(1);
    const key = vi.spyOn(new Event('keydown'), 'preventDefault'); await panel.save({ preventDefault: key } as unknown as Event); expect(key).toHaveBeenCalled();
  });

  it('数百项差异只渲染一页，分页、类型筛选和搜索可组合', async () => {
    const data = makeStressDataset(250);
    const base = createSnapshot({ id: 'a', datasetId: data.id, name: 'a', source: 'dataset', structure: 'catalog', version: 'A', evaluationDate: '2026-01-01', observedOn: data.observedOn, savedAt: '2026-11-14T00:00:00.000Z', nodes: data.structures.catalog });
    const next = createSnapshot({ ...base, id: 'b', nodes: base.nodes.map(node => ({ ...node, quantity: '2' })) });
    ws.versions.result.set(compareSnapshots(base, next)); fixture.detectChanges();
    expect(root().querySelectorAll('tbody tr')).toHaveLength(100);
    panel.offset.set(2); fixture.detectChanges(); expect(root().querySelectorAll('tbody tr')).toHaveLength(50);
    panel.setSearch('ST-000249'); fixture.detectChanges(); expect(root().querySelectorAll('tbody tr')).toHaveLength(1); expect(panel.page()).toBe(0);
    panel.setFilter('removed'); fixture.detectChanges(); expect(root().textContent).toContain('当前条件没有匹配差异');
    panel.setFilter('quantity'); expect(panel.changes()).toHaveLength(1);
    panel.setSearch(''); expect(panel.changes()).toHaveLength(250);
    await panel.choose('before', ''); expect(ws.versions.result()).toBeNull(); expect(panel.offset()).toBe(0);
  });

  it('快照导入先预览，重复身份拒绝覆盖，跨产品及损坏文件不能写入', async () => {
    await save('A');
    const snapshot = await ws.versions.exportSelected();
    const raw = JSON.stringify({ ...snapshot, id: 'imported' });
    await panel.file(fileEvent(new File([raw], 'snapshot.json')));
    expect(panel.incoming()?.name).toBe('A'); expect(ws.versions.entries()).toHaveLength(1);
    await panel.acceptImport(); expect(ws.versions.entries()).toHaveLength(2); expect(panel.incoming()).toBeNull();
    await panel.file(fileEvent(new File([raw], 'snapshot.json'))); await panel.acceptImport(); expect(panel.error()).toContain('存在');
    await panel.file(fileEvent(new File([JSON.stringify({ ...snapshot, datasetId: 'other' })], 'other.json'))); expect(panel.error()).toContain('其他产品'); expect(panel.incoming()).toBeNull();
    await panel.file(fileEvent(new File(['{}'], 'bad.json'))); expect(panel.error()).toContain('格式');
    const big = new File([''], 'big.json'); Object.defineProperty(big, 'size', { value: 51 * 1024 * 1024 });
    await panel.file(fileEvent(big)); expect(panel.error()).toContain('50 MB');
    await panel.file(fileEvent()); await panel.acceptImport(); expect(ws.versions.entries()).toHaveLength(2);
  });

  it('晚到文件不覆盖后来选择的文件，并可导出快照与完整差异', async () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    await panel.downloadSnapshot(); expect(panel.error()).toContain('目标版本');
    panel.downloadDiff(); expect(click).not.toHaveBeenCalled();
    await save('A'); await save('B'); await panel.downloadSnapshot(); panel.downloadDiff();
    expect(click).toHaveBeenCalledTimes(2);
    const snapshot = await ws.versions.exportSelected();
    let finish!: (text: string) => void;
    const delayed = new File([''], 'old.json'); vi.spyOn(delayed, 'text').mockImplementation(() => new Promise(done => { finish = done; }));
    const reading = panel.file(fileEvent(delayed));
    await panel.file(fileEvent(new File([JSON.stringify({ ...snapshot, id: 'new', name: 'new' })], 'new.json')));
    finish(JSON.stringify(snapshot)); await reading; expect(panel.incoming()?.name).toBe('new');
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

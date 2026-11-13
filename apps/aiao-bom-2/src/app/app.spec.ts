import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { BomWorkspace } from './core/workspace';
import { WorkspaceRepository } from './core/storage';
import { makeStressDataset } from './core/stress-data';
import { BomGrid } from './components/bom-grid';
import { ModelPanel } from './components/model-panel';
import type { DialogKind } from './components/workspace-dialogs';

let fixture: ComponentFixture<App>;
let ws: BomWorkspace;
const root = () => fixture.nativeElement as HTMLElement;
function form(values: Record<string, string>): void {
  const dialog = root().querySelector('dialog')!;
  for (const [name, value] of Object.entries(values)) (dialog.querySelector(`[name=${name}]`) as HTMLInputElement).value = value;
  dialog.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); fixture.detectChanges();
}
function open(kind: DialogKind): void { fixture.componentInstance.dialogs().open(kind); fixture.detectChanges(); }
beforeEach(async () => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), clear: () => values.clear() });
  window.history.replaceState({}, '', '/');
  vi.spyOn(WorkspaceRepository.prototype, 'read').mockResolvedValue(undefined);
  vi.spyOn(WorkspaceRepository.prototype, 'write').mockResolvedValue();
  vi.spyOn(BomGrid.prototype, 'ngAfterViewInit').mockResolvedValue();
  vi.spyOn(ModelPanel.prototype, 'ngAfterViewInit').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(JSON.stringify(makeStressDataset(12)))));
  fixture = TestBed.createComponent(App); fixture.detectChanges(); ws = TestBed.inject(BomWorkspace);
  await vi.waitFor(() => expect(ws.loading()).toBe(false)); fixture.detectChanges();
});
afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('工作台操作与可读状态', () => {
  it('导航、展示模式、过滤、列配置、选择和使用处共享同一工作区', async () => {
    expect(root().querySelector('h1')?.textContent).toContain('BOM 工作台');
    const app = fixture.componentInstance;
    app.mode('flat'); app.market('EU'); app.issue('all'); app.sort('partId'); app.structure('catalog');
    expect(ws.query()).toMatchObject({ mode: 'flat', market: 'EU', sort: 'partId' });
    const row = ws.result().rows[2]; ws.choose(row); fixture.detectChanges();
    expect(app.usages()).toHaveLength(1); expect(root().querySelector('.selected-summary')?.textContent).toContain(row.partId);
    app.checked({ key: row.key, checked: false }); expect(ws.selectedKeys().has(row.key)).toBe(false);
    app.checked({ key: row.key, checked: true }); expect(ws.selectedKeys().has(row.key)).toBe(true);
    app.toggleColumn('english'); expect(localStorage.getItem('bom2:columns')).toContain('english');
    app.widths([{ field: 'name', width: 400 }]); expect(JSON.parse(localStorage.getItem('bom2:columns')!)[0].width).toBe(400);
    app.search('ST-000011'); await vi.waitFor(() => expect(ws.query().search).toBe('ST-000011'));
    app.detailTab.set('usage'); fixture.detectChanges(); expect(root().querySelector('.usage-item')).not.toBeNull();
    app.detailTab.set('source'); fixture.detectChanges(); expect(root().querySelector('.property-list')?.textContent).toContain('synthetic');
    app.columnsOpen.set(true); root().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); expect(app.columnsOpen()).toBe(false);
    const search = root().querySelector('#bom-search') as HTMLInputElement; const focus = vi.spyOn(search, 'focus'); root().dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true })); expect(focus).toHaveBeenCalled();
  });
  it('草稿表单完成确认、编辑、撤销、移动、增删与诊断', () => {
    open('fork'); form({}); expect(ws.query().structure).toBe('draft');
    ws.choose(ws.result().rows[1]); fixture.detectChanges();
    open('edit'); form({ quantity: '2.5', uom: '件', cost: '0.2' }); expect(ws.selected()?.quantity).toBe('2.5');
    root().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, bubbles: true, cancelable: true })); expect(ws.selected()?.quantity).toBe('1');
    root().dispatchEvent(new KeyboardEvent('keydown', { key: 'z', metaKey: true, shiftKey: true, bubbles: true, cancelable: true })); expect(ws.selected()?.quantity).toBe('2.5');
    open('move'); form({ parent: '' }); expect(ws.selected()?.parentKey).toBeNull();
    open('add'); form({ partId: 'NEW-001', quantity: '3', uom: '件', parent: '' }); expect(ws.draft()?.nodes.at(-1)?.partId).toBe('NEW-001');
    ws.choose(ws.index()!.rows.get(ws.draft()!.nodes.at(-1)!.key)!); fixture.detectChanges(); open('remove'); form({}); expect(ws.draft()?.nodes).toHaveLength(12);
    open('validate'); expect(root().querySelector('dialog')?.textContent).toContain('全部校验通过');
    fixture.componentInstance.dialogs().close(); open('analysis'); form({ planned: '10' }); expect(fixture.componentInstance.dialogs().analysis()?.complete).toBe(true);
    fixture.componentInstance.dialogs().close(); open('compare'); ws.saveBaseline(); const key = ws.draft()!.nodes[1].key; ws.edit([key], '9', '件', null); fixture.detectChanges(); expect(fixture.componentInstance.dialogs().differences().length).toBeGreaterThan(0);
  });
  it('非法输入保持对话框可读，导入先预览再写入，导出生成文件', async () => {
    const dialogs = fixture.componentInstance.dialogs();
    open('import'); form({ json: '{"rows":[]}' }); expect(dialogs.error()).toContain('草稿格式');
    dialogs.close(); ws.fork(); open('import'); form({ json: JSON.stringify(ws.draft()) }); expect(dialogs.preview()?.nodes).toHaveLength(12);
    form({}); expect(ws.query().structure).toBe('draft');
    open('edit'); form({ quantity: '01', uom: '件', cost: '' }); expect(dialogs.error()).toContain('规范'); dialogs.close();
    const blob = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test'); vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined); const download = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    open('export'); dialogs.download('csv'); dialogs.download('json'); expect(blob).toHaveBeenCalledTimes(2); expect(download).toHaveBeenCalledTimes(2);
    dialogs.close(); open('import');
    const input = document.createElement('input'); Object.defineProperty(input, 'files', { value: [new File([JSON.stringify(ws.draft())], 'draft.json')] });
    const event = new Event('change'); Object.defineProperty(event, 'target', { value: input }); await dialogs.file(event); expect(dialogs.preview()?.nodes).toHaveLength(12);
    dialogs.close(); open('sources'); expect(root().querySelectorAll('.source-links a')).toHaveLength(4); dialogs.close(); open('help'); expect(root().querySelector('dialog ol')?.textContent).toContain('工作草稿');
    dialogs.locate(ws.draft()!.nodes[1].key); expect(ws.selection()).toBe(ws.draft()!.nodes[1].key);
  });
});

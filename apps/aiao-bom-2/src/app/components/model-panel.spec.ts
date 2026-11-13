import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelPanel } from './model-panel';
import { makeStressDataset } from '../core/stress-data';
import { BomIndex } from '../core/query';
import type { BomDataset, BomRow } from '../core/types';
import type { ViewportEvents } from '../core/model-viewport';

const viewport = vi.hoisted(() => ({
  events: null as ViewportEvents | null,
  load: vi.fn<(...args: unknown[]) => Promise<void>>(), cancel: vi.fn(), dispose: vi.fn(),
  select: vi.fn(() => ({ level: 'occurrence', count: 1 })), focus: vi.fn(), fit: vi.fn(),
  view: vi.fn(), isolate: vi.fn(), ghost: vi.fn(), reset: vi.fn()
}));
vi.mock('../core/model-viewport', () => ({ ModelViewport: class {
  constructor(_host: HTMLElement, events: ViewportEvents) { viewport.events = events; return viewport; }
} }));
let fixture: ComponentFixture<ModelPanel>;
let data: BomDataset;
let rows: BomRow[];
async function mount(): Promise<ModelPanel> {
  fixture = TestBed.createComponent(ModelPanel);
  fixture.componentRef.setInput('dataset', data); fixture.componentRef.setInput('selected', rows[1]); fixture.componentRef.setInput('part', data.parts[1]);
  fixture.detectChanges(); await vi.waitFor(() => expect(fixture.componentInstance.loading()).toBe(false)); fixture.detectChanges();
  return fixture.componentInstance;
}
beforeEach(() => {
  vi.clearAllMocks(); viewport.load.mockResolvedValue();
  data = makeStressDataset(4); data.vehicle.url = '/vehicle.glb'; rows = [...new BomIndex(data, 'catalog').rows.values()];
  data.parts[1].assets = [{ id: 'part-a', url: '/a.glb', variants: [rows[1].compId], kind: 'part' }, { id: 'part-b', url: '/b.glb', variants: ['variant-b'], kind: 'part' }];
});
afterEach(() => { fixture?.destroy(); TestBed.resetTestingModule(); });
describe('模型面板加载与选择契约', () => {
  it('选中另一行只更新映射，视角与显隐操作作用于同一模型实例', async () => {
    const panel = await mount(); expect(viewport.load).toHaveBeenCalledWith('/vehicle.glb', false);
    fixture.componentRef.setInput('selected', rows[2]); fixture.componentRef.setInput('part', data.parts[2]); fixture.detectChanges();
    expect(viewport.load).toHaveBeenCalledTimes(1); expect(viewport.select).toHaveBeenLastCalledWith(rows[2]);
    panel.focus(); panel.fit(); panel.view('front'); panel.toggleGhost(); panel.toggleIsolate(); panel.reset();
    expect(viewport.focus).toHaveBeenCalled(); expect(viewport.view).toHaveBeenCalledWith('front'); expect(viewport.fit).toHaveBeenCalled();
    expect(viewport.ghost).toHaveBeenCalledWith(true); expect(viewport.isolate).toHaveBeenCalledWith(true); expect(viewport.reset).toHaveBeenCalled();
    expect(panel.ghosted()).toBe(false); expect(panel.isolated()).toBe(false);
    const picked = vi.fn(); panel.picked.subscribe(picked); viewport.events!.selected({ index: 17, partId: 'ST-000001', compId: 'ST-000001', systemId: 'TEST' });
    expect(picked).toHaveBeenCalledWith({ nodeIndex: 17, partId: 'ST-000001' });
    viewport.events!.ready(22); viewport.events!.progress(1048576, 2097152); expect(panel.nodes()).toBe(22); expect(panel.progress()).toContain('50%');
    viewport.events!.progress(1048576, 0); expect(panel.progress()).toContain('已下载');
  });
  it('独立模型按完整变体及资产选择加载，无资产时明确提示', async () => {
    const panel = await mount(); panel.mode.set('part'); fixture.detectChanges(); await vi.waitFor(() => expect(viewport.load).toHaveBeenLastCalledWith('/a.glb', true));
    await vi.waitFor(() => expect(panel.mapping()).toContain('独立零件视图'));
    fixture.componentRef.setInput('selected', { ...rows[1], compId: 'variant-b' }); fixture.detectChanges();
    await vi.waitFor(() => expect(viewport.load).toHaveBeenLastCalledWith('/b.glb', true));
    expect((fixture.nativeElement as HTMLElement).querySelector('select')?.value).toBe('part-b');
    panel.chooseAsset({ target: { value: 'part-b' } } as unknown as Event); fixture.detectChanges();
    await vi.waitFor(() => expect(viewport.load).toHaveBeenLastCalledWith('/b.glb', true));
    fixture.componentRef.setInput('part', data.parts[2]); fixture.detectChanges(); await vi.waitFor(() => expect(panel.error()).toContain('没有独立模型'));
    fixture.componentRef.setInput('part', null); fixture.componentRef.setInput('selected', null); fixture.detectChanges();
    expect(panel.loading()).toBe(false);
  });
  it('加载失败可重试，取消和卸载后迟到结果不能改写界面', async () => {
    viewport.load.mockRejectedValueOnce(new Error('HTTP 503')); const panel = await mount(); expect(panel.error()).toContain('503');
    await panel.load(); expect(panel.error()).toBe('');
    let resolve!: () => void; viewport.load.mockImplementationOnce(() => new Promise<void>(done => resolve = done));
    const task = panel.load(); panel.cancel(); resolve(); await task;
    expect(viewport.cancel).toHaveBeenCalled(); expect(panel.error()).toContain('已取消');
    const selectedBefore = viewport.select.mock.calls.length;
    viewport.load.mockImplementationOnce(() => new Promise<void>(done => resolve = done));
    const late = panel.load(); fixture.destroy(); resolve(); await late;
    expect(viewport.dispose).toHaveBeenCalled(); expect(viewport.select.mock.calls).toHaveLength(selectedBefore);
  });
  it('数据集无整车时不创建无效加载，市场参考提示保留', async () => {
    data.vehicle.url = ''; const panel = await mount(); fixture.componentRef.setInput('market', 'US'); fixture.detectChanges();
    expect(panel.error()).toContain('未关联整车模型'); expect(viewport.load).not.toHaveBeenCalled();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('EU');
  });
});

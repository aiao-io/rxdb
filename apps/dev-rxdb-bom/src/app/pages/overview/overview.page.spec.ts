import { computed, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { OverviewPage } from './overview.page';

const makeService = (names = ['SC-100', 'B-01', 'R10K'], ready = true) => {
  const itemNos = signal(new Map(names.map((name, index) => [`item-${index}`, name])));
  return {
    ready: signal(ready),
    dataEpoch: signal(0),
    resetting: signal(false),
    extRead: vi.fn().mockResolvedValue('{"rohs":"yes"}'),
    extPatch: vi.fn().mockResolvedValue({ ok: true }),
    itemNos,
    itemUoms: signal(new Map(names.map(name => [name, 'pcs']))),
    itemCount: computed(() => itemNos().size),
    ecns: signal(new Map<string, { ecnNo: string; state: string; effectiveDate: string }>()),
    instanceRoots: signal<{ id: string; itemNo: string; serialNumber: string | null }[]>([]),
    seedBatchNo: 'scooter-seed-a',
    seedTimestamp: '2026-01-01T00:00:00.000Z',
    resetAndSeed: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dumpRowCounts: vi.fn<() => Promise<string>>().mockResolvedValue(`item=${names.length}\nbom_history_batch=4`)
  };
};

const mount = async (service: ReturnType<typeof makeService>) => {
  TestBed.configureTestingModule({
    providers: [{ provide: BomDemoService, useValue: service }, provideRouter([])]
  });
  const fixture = TestBed.createComponent(OverviewPage);
  await fixture.whenStable();
  return fixture;
};

const element = (fixture: ComponentFixture<OverviewPage>): HTMLElement => fixture.nativeElement as HTMLElement;

describe('物料概览的真实状态与操作', () => {
  const confirm = vi.fn<(message?: string) => boolean>();
  let originalConfirm: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalConfirm = Object.getOwnPropertyDescriptor(window, 'confirm');
    confirm.mockReset().mockReturnValue(true);
    Object.defineProperty(window, 'confirm', { configurable: true, writable: true, value: confirm });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    if (originalConfirm) Object.defineProperty(window, 'confirm', originalConfirm);
    else Reflect.deleteProperty(window, 'confirm');
  });

  it.each([41, 46])('已有%d个物料时重开直接显示可用数据并回读统计，不触发重置', async count => {
    const names = ['SC-100', ...Array.from({ length: count - 1 }, (_, index) => `PART-${index}`)];
    const service = makeService(names);
    const fixture = await mount(service);
    const root = element(fixture);

    expect(root.querySelectorAll('h1')).toHaveLength(1);
    expect(root.querySelector('h1')?.textContent).toBe('物料概览');
    expect(root.querySelector('[data-testid=overview-item-count]')?.textContent).toContain(String(count));
    expect(root.textContent).not.toContain('尚未装载');
    expect(service.dumpRowCounts).toHaveBeenCalledOnce();
    expect(service.resetAndSeed).not.toHaveBeenCalled();
    expect(root.querySelector('[data-testid=row-counts]')?.closest('details')).not.toBeNull();
    expect(root.querySelector('[data-testid=row-counts]')?.textContent).toContain(`item=${count}`);
  });

  it('空库给出准备数据入口，不查询不存在的业务统计', async () => {
    const service = makeService([], false);
    const fixture = await mount(service);
    const root = element(fixture);

    expect(root.querySelector('[data-testid=prepare-data]')?.textContent).toContain('准备演示数据');
    expect(root.querySelector('[data-testid=overview-data-status]')?.textContent).toMatch(/准备|等待/);
    expect(service.dumpRowCounts).not.toHaveBeenCalled();
    expect(service.resetAndSeed).not.toHaveBeenCalled();
  });

  it('取消清空确认后不调用重置服务', async () => {
    const service = makeService();
    const fixture = await mount(service);
    confirm.mockReturnValue(false);

    await fixture.componentInstance.resetAndSeed();

    expect(confirm).toHaveBeenCalledOnce();
    expect(confirm.mock.calls[0][0]).toMatch(/清空|删除/);
    expect(service.resetAndSeed).not.toHaveBeenCalled();
    expect(service.itemCount()).toBe(3);
  });

  it('确认后的连续点击只重置一次，完成后恢复可操作状态', async () => {
    const service = makeService();
    let finish: () => void = () => undefined;
    const pending = new Promise<void>(resolve => {
      finish = resolve;
    });
    service.resetAndSeed.mockReturnValue(pending);
    const fixture = await mount(service);

    const first = fixture.componentInstance.resetAndSeed();
    const repeated = fixture.componentInstance.resetAndSeed();
    const callsDuringSave = service.resetAndSeed.mock.calls.length;
    const confirmations = confirm.mock.calls.length;
    finish();
    await Promise.all([first, repeated]);
    await fixture.whenStable();

    expect(callsDuringSave).toBe(1);
    expect(confirmations).toBe(1);
    expect(fixture.componentInstance.busy()).toBe(false);
  });

  it('已有数据的统计读取失败显示可恢复错误，不误报数据未装载', async () => {
    const service = makeService();
    service.dumpRowCounts.mockRejectedValue(new Error('读取概览失败'));
    const fixture = await mount(service);
    const root = element(fixture);

    expect(root.querySelector('[role=alert]')).not.toBeNull();
    expect(root.textContent).toContain('读取概览失败');
    expect(root.textContent).not.toContain('尚未装载');
    expect(service.resetAndSeed).not.toHaveBeenCalled();
  });

  it('物料编码筛选忽略大小写和首尾空格，无匹配时保留真实总数', async () => {
    const service = makeService();
    const fixture = await mount(service);
    const root = element(fixture);
    const filter = root.querySelector<HTMLInputElement>('[data-testid=item-filter]');
    expect(filter).not.toBeNull();

    filter!.value = ' sc ';
    filter!.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-testid=item-inventory-row]')).toHaveLength(1);
    expect(root.querySelector('[data-testid=item-inventory-row]')?.textContent).toContain('SC-100');

    filter!.value = 'missing';
    filter!.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(root.querySelectorAll('[data-testid=item-inventory-row]')).toHaveLength(0);
    expect(root.querySelector('[data-testid=item-inventory]')?.textContent).toContain('没有匹配');
    expect(root.querySelector('[data-testid=overview-item-count]')?.textContent).toContain('3');
  });

  it('六个场景直接导航到现有业务页面', async () => {
    const fixture = await mount(makeService());
    const links = Array.from(element(fixture).querySelectorAll<HTMLAnchorElement>('a[data-testid=workflow-card]'));

    expect(links.map(link => link.getAttribute('href'))).toEqual([
      '/explosion',
      '/timeline',
      '/mapping',
      '/cost',
      '/where-used',
      '/instances'
    ]);
    expect(links.every(link => link.textContent?.trim())).toBe(true);
  });

  it('物料清单先显示中文名称，可按中文搜索并保留原编码', async () => {
    const fixture = await mount(makeService(['SC-100', 'PCBA', 'BATT', 'R10K']));
    const root = element(fixture);
    expect(root.querySelector('thead')?.textContent).toContain('物料名称');
    expect(root.querySelector('thead')?.textContent).toContain('物料编码');
    const filter = root.querySelector<HTMLInputElement>('[data-testid=item-filter]')!;
    filter.value = ' 控制板 ';
    filter.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    const rows = root.querySelectorAll('[data-testid=item-inventory-row]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('控制板');
    expect(rows[0].textContent).toContain('PCBA');
    expect(root.querySelector('[data-testid=overview-item-count]')?.textContent).toContain('4');
  });

  it('物料搜索结果提供直接展开与反查，路径携带目标物料', async () => {
    const fixture = await mount(makeService(['BATT']));
    const row = element(fixture).querySelector('[data-testid=item-inventory-row]')!;
    const links = Array.from(row.querySelectorAll('a'));
    expect(links.map(link => link.textContent?.trim())).toEqual(['展开', '反查']);
    expect(links[0].getAttribute('href')).toContain('root=BATT');
    expect(links[1].getAttribute('href')).toContain('item=BATT');
  });
});

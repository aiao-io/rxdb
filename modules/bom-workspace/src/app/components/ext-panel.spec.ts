import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { ExtPanel } from './ext-panel';

describe('物料扩展属性的物料名称', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('属性说明和筛选结果使用中文名，属性写入继续使用原编码', async () => {
    const service = {
      ready: signal(true),
      resetting: signal(false),
      dataEpoch: signal(0),
      extRead: vi.fn().mockResolvedValue('{"rohs":"yes"}'),
      extPatch: vi.fn().mockResolvedValue({ ok: true }),
      extWrite: vi.fn().mockResolvedValue({ ok: true }),
      filterExt: vi.fn().mockResolvedValue([{ itemNo: 'B-01', ext: '{"rohs":"yes"}' }])
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(ExtPanel);
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;

    expect(root.querySelector('.panel-desc')?.textContent).toContain('合规演示件（B-01）');

    await fixture.componentInstance.write(false);
    await fixture.componentInstance.filter();
    await fixture.whenStable();

    expect(service.extPatch).toHaveBeenCalledExactlyOnceWith('B-01', { rohs: 'yes' });
    expect(root.querySelector('[data-testid=ext-filter-row] strong')?.textContent).toBe('合规演示件（B-01）');
  });

  it('重开时回读已保存状态，局部保存后再次回读确认', async () => {
    const service = {
      ready: signal(true),
      resetting: signal(false),
      dataEpoch: signal(0),
      extRead: vi
        .fn()
        .mockResolvedValueOnce('{"rohs":"no","custom":"保留"}')
        .mockResolvedValue('{"rohs":"yes","custom":"保留"}'),
      extPatch: vi.fn().mockResolvedValue({ ok: true }),
      extWrite: vi.fn().mockResolvedValue({ ok: true }),
      filterExt: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(ExtPanel);
    await fixture.whenStable();

    expect(fixture.componentInstance.value()).toBe('no');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('已保存');
    fixture.componentInstance.value.set('yes');
    await fixture.componentInstance.write(false);

    expect(service.extPatch).toHaveBeenCalledExactlyOnceWith('B-01', { rohs: 'yes' });
    expect(service.extRead).toHaveBeenCalledTimes(2);
  });

  it('故意缺必填属性的演示仍调用完整替换写入，拒绝后保留当前表单', async () => {
    const service = {
      ready: signal(true),
      resetting: signal(false),
      dataEpoch: signal(0),
      extRead: vi.fn().mockResolvedValue('{"rohs":"no"}'),
      extPatch: vi.fn(),
      extWrite: vi.fn().mockResolvedValue({ ok: false, error: new Error('rohs 是必填属性') }),
      filterExt: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(ExtPanel);
    await fixture.whenStable();
    await fixture.componentInstance.write(true);
    await fixture.whenStable();

    expect(service.extWrite).toHaveBeenCalledExactlyOnceWith('B-01', {});
    expect(service.extPatch).not.toHaveBeenCalled();
    expect(fixture.componentInstance.value()).toBe('no');
    expect(fixture.componentInstance.failure()).toBe('rejected');
    const result = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=ext-result]');
    expect(result?.textContent).toContain('请检查输入内容');
    expect(result?.querySelector('pre')?.textContent).toContain('rohs 是必填属性');
  });

  it('意外错误不再冒充输入校验结论', async () => {
    const service = {
      ready: signal(true),
      resetting: signal(false),
      dataEpoch: signal(0),
      extRead: vi.fn().mockResolvedValue('{"rohs":"no"}'),
      extPatch: vi.fn().mockRejectedValue(new Error('database is locked')),
      extWrite: vi.fn(),
      filterExt: vi.fn()
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(ExtPanel);
    await fixture.whenStable();
    await fixture.componentInstance.write(false);
    await fixture.whenStable();

    expect(fixture.componentInstance.failure()).toBe('error');
    const result = (fixture.nativeElement as HTMLElement).querySelector('[data-testid=ext-result]');
    expect(result?.textContent).not.toContain('请检查输入内容');
    expect(result?.querySelector('pre')?.textContent).toContain('database is locked');
  });
});

import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { ConfigPanel } from './config-panel';

describe('配置演示的物料名称', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('颜色说明使用中文名称，展开请求保留原物料编码', async () => {
    const service = {
      ready: signal(true),
      itemNos: signal(new Map<string, string>()),
      designators: signal(new Map<string, string[]>()),
      explode: vi.fn().mockRejectedValue(new Error('配置测试'))
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(ConfigPanel);
    fixture.componentRef.setInput('asOfDate', '2026-09-22');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('.panel-desc')?.textContent).toMatch(/[\u4e00-\u9fff]+（CONFIG-DEMO）/);
    expect(host.querySelector('.panel-desc')?.textContent).toMatch(/[\u4e00-\u9fff]+（CONFIG-PART）/);
    await fixture.componentInstance.run();

    expect(service.explode).toHaveBeenCalledExactlyOnceWith('2026-09-22', '1', 'CONFIG-DEMO', {
      configSelection: { 颜色: ['红'] }
    });
  });
});

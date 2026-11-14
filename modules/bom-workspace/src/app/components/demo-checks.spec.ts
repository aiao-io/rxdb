import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../bom-demo.service';
import { DemoChecks } from './demo-checks';

describe('异常校验示例的结果呈现', () => {
  afterEach(() => TestBed.resetTestingModule());

  const setup = (overrides: Record<string, unknown>) => {
    const service = {
      ready: signal(true),
      publishDemoHeader: vi.fn(),
      rawCycleInsert: vi.fn(),
      formCycleInsert: vi.fn(),
      demoSubstitutePublishRejection: vi.fn(),
      ...overrides
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(DemoChecks);
    return { fixture, root: fixture.nativeElement as HTMLElement };
  };

  it('存储层拒绝时在对应结果里展示原始错误，不进入整体故障提示', async () => {
    const { fixture, root } = setup({
      rawCycleInsert: vi.fn().mockResolvedValue({ ok: false, error: new Error('rxdb:bom_cycle:a>b>a') })
    });
    await fixture.whenStable();

    await fixture.componentInstance.runRawCycle();
    await fixture.whenStable();

    expect(root.querySelector('[data-testid=raw-cycle-result] pre')?.textContent).toContain('rxdb:bom_cycle:a>b>a');
    expect(root.querySelector('[role=alert]')).toBeNull();
  });

  it('写入未被拒绝时明确标出保护未生效，不当作校验通过', async () => {
    const { fixture, root } = setup({ publishDemoHeader: vi.fn().mockResolvedValue({ ok: true }) });
    await fixture.whenStable();

    await fixture.componentInstance.publishDemoHeader();
    await fixture.whenStable();

    expect(root.querySelector('[data-testid=publish-result] pre')?.textContent).toContain('保护未生效');
  });

  it('意外错误进入整体故障提示，各项结果保持空白', async () => {
    const { fixture, root } = setup({
      demoSubstitutePublishRejection: vi.fn().mockRejectedValue(new Error('database is locked'))
    });
    await fixture.whenStable();

    await fixture.componentInstance.runSubstituteDemo();
    await fixture.whenStable();

    expect(root.querySelector('[role=alert] pre')?.textContent).toContain('database is locked');
    expect(root.querySelector('[data-testid=substitute-result]')).toBeNull();
  });
});

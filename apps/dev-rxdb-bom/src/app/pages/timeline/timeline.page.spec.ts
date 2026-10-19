import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BomDemoService } from '../../bom-demo.service';
import { EcnPanel } from '../../components/ecn-panel';
import { TimelinePage } from './timeline.page';

describe('变更时间轴选择', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('点击日程即选中同一变更单并读取影响和差异', async () => {
    const service = {
      ready: signal(true),
      dataEpoch: signal(0),
      resetting: signal(false),
      liveEcnId: signal<string | null>(null),
      ecns: signal(new Map([['ecn-a', { ecnNo: 'ECN-A', state: 'released', effectiveDate: '2099-01-01' }]])),
      itemNos: signal(new Map<string, string>()),
      ecnImpact: vi.fn().mockResolvedValue({ affectedItemIds: [], topItems: [] }),
      ecnDiff: vi.fn().mockResolvedValue({ headers: [] })
    };
    TestBed.configureTestingModule({ providers: [{ provide: BomDemoService, useValue: service }] });
    const fixture = TestBed.createComponent(TimelinePage);
    await fixture.whenStable();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
      '[data-testid=timeline-select]'
    );
    expect(button).not.toBeNull();
    button?.click();
    await fixture.whenStable();
    const panel = fixture.debugElement.query(By.directive(EcnPanel)).componentInstance as EcnPanel;

    expect(panel.selectedEcnId()).toBe('ecn-a');
    expect(service.ecnImpact).toHaveBeenCalledExactlyOnceWith('ecn-a');
    expect(service.ecnDiff).toHaveBeenCalledExactlyOnceWith('ecn-a');
  });
});

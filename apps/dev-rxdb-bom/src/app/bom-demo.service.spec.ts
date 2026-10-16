import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { BomDemoService } from './bom-demo.service';

describe('BomDemoService', () => {
  it('构造后可读种子常量与空状态（冒烟）', () => {
    const service = TestBed.inject(BomDemoService);
    expect(service.ready()).toBe(false);
    expect(service.seedBatchNo).toBe('scooter-seed-a');
    expect(service.seedTimestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(service.itemCount()).toBe(0);
  });
});

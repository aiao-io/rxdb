import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BomDemoService } from './app/bom-demo.service';
import { BOM_WORKSPACE_CONFIG } from './config';

afterEach(() => {
  window.localStorage.clear();
  TestBed.resetTestingModule();
});
describe('领域工作区配置隔离', () => {
  it('要求显式提供领域工作区配置', () => {
    TestBed.resetTestingModule();
    expect(() => TestBed.inject(BomDemoService)).toThrow(/BOM_WORKSPACE_CONFIG/);
  });
  it('只恢复属于当前配置的活动库指针', () => {
    window.localStorage.setItem('bom:active-database:unrelated-workspace', 'old-restored');
    window.localStorage.setItem('bom:active-database:aiao-bom-2-domain-v1', 'new-restored');
    TestBed.configureTestingModule({
      providers: [{ provide: BOM_WORKSPACE_CONFIG, useValue: { databaseName: 'aiao-bom-2-domain-v1' } }]
    });
    expect(TestBed.inject(BomDemoService).databaseName()).toBe('new-restored');
  });
});

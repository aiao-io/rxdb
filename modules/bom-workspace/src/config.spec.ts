import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { BomDemoService } from './app/bom-demo.service';
import { BOM_WORKSPACE_CONFIG } from './config';

afterEach(() => {
  window.localStorage.clear();
  TestBed.resetTestingModule();
});
describe('新旧领域工作区隔离', () => {
  it('旧入口默认连接原库', () => {
    expect(TestBed.inject(BomDemoService).databaseName()).toBe('dev-rxdb-bom');
  });
  it('新入口使用独立库，只恢复属于自身的迁移指针', () => {
    window.localStorage.setItem('bom:active-database:dev-rxdb-bom', 'old-restored');
    window.localStorage.setItem('bom:active-database:aiao-bom-2-domain-v1', 'new-restored');
    TestBed.configureTestingModule({
      providers: [{ provide: BOM_WORKSPACE_CONFIG, useValue: { databaseName: 'aiao-bom-2-domain-v1' } }]
    });
    expect(TestBed.inject(BomDemoService).databaseName()).toBe('new-restored');
  });
});

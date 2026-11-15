import { TestBed } from '@angular/core/testing';
import { RxDB } from '@aiao/rxdb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminConfigModelComponent, createAdminConfigWorkspaceQuery } from './admin-config-model';
import { ProductClient } from './product-client';

function clientThatCannotHydrate(): ProductClient {
  return new ProductClient(async () => {
    throw new Error('测试不访问远端配置。');
  });
}

async function createComponent(): Promise<InstanceType<typeof AdminConfigModelComponent>> {
  const fixture = TestBed.createComponent(AdminConfigModelComponent);
  fixture.componentRef.setInput('client', clientThatCannotHydrate());
  fixture.componentRef.setInput('identity', '10000000-0000-4000-8000-000000000001');
  fixture.componentRef.setInput('name', 'MediaPromptTemplate');
  fixture.componentRef.setInput('title', '提示词模板');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture.componentInstance;
}

describe('AdminConfigModelComponent', () => {
  it('为配置列表固定工作区查询，未准备工作区时不返回跨工作区条件', () => {
    expect(createAdminConfigWorkspaceQuery(null)).toBeUndefined();
    expect(createAdminConfigWorkspaceQuery('workspace-1')).toEqual({
      combinator: 'and',
      rules: [{ field: 'workspaceId', operator: '=', value: 'workspace-1' }]
    });
  });

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminConfigModelComponent],
      providers: [{ provide: RxDB, useValue: {} }]
    });
    TestBed.overrideComponent(AdminConfigModelComponent, { set: { template: '', imports: [] } });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('在浏览器断网时切换离线状态，恢复网络后继续同步状态', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const component = await createComponent();

    window.dispatchEvent(new Event('offline'));
    expect(component.offline()).toBe(true);
    expect(component.syncState()).toBe('offline');

    window.dispatchEvent(new Event('online'));
    expect(component.offline()).toBe(false);
    expect(component.syncState()).toBe('idle');
  });

  it('初始化时已经断网会显示离线保存状态', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const component = await createComponent();

    expect(component.offline()).toBe(true);
    expect(component.syncState()).toBe('offline');
  });

  it('只允许已同步或已校验提交进入应用，已应用或已发布提交进入安全回滚', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const component = await createComponent();

    expect(component.canApply('prepared')).toBe(false);
    expect(component.canApply('synced')).toBe(true);
    expect(component.canApply('validated')).toBe(true);
    expect(component.canRollback('synced')).toBe(false);
    expect(component.canRollback('applied')).toBe(true);
    expect(component.canRollback('released')).toBe(true);
  });
});

import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AdminConfigModelComponent,
  createAdminConfigFixedFormData,
  createAdminConfigWorkspaceQuery,
  parseAppliedRevisions,
  toAdminConfigCommitView
} from './admin-config-model';
import { ProductClient, ProductRequestError, type ProductAuthorization } from './product-client';

const identity = '10000000-0000-4000-8000-000000000001';

function clientThatCannotHydrate(): ProductClient {
  return new ProductClient(async () => {
    throw new Error('测试不访问远端配置。');
  });
}

/** 已登录但管理员权限被撤销：会话读取返回 403。 */
function revokedClient(): ProductClient {
  const client = new ProductClient(async () => ({ userId: identity }) as ProductAuthorization);
  vi.spyOn(client, 'admin').mockRejectedValue(new ProductRequestError(403, '账号或权限已失效，远程操作已暂停。'));
  return client;
}

async function createComponent(client: ProductClient = clientThatCannotHydrate()) {
  const fixture = TestBed.createComponent(AdminConfigModelComponent);
  fixture.componentRef.setInput('client', client);
  fixture.componentRef.setInput('identity', identity);
  fixture.componentRef.setInput('name', 'MediaPromptTemplate');
  fixture.componentRef.setInput('title', '提示词模板');
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return fixture;
}

describe('AdminConfigModelComponent 纯函数', () => {
  it('为配置列表固定工作区查询，未准备工作区时不返回跨工作区条件', () => {
    expect(createAdminConfigWorkspaceQuery(null)).toBeUndefined();
    expect(createAdminConfigWorkspaceQuery('workspace-1')).toEqual({
      combinator: 'and',
      rules: [{ field: 'workspaceId', operator: '=', value: 'workspace-1' }]
    });
  });

  it('新建配置时由系统带入工作区、分支、修订号与删除时间', () => {
    expect(createAdminConfigFixedFormData(null)).toBeUndefined();
    expect(createAdminConfigFixedFormData('workspace-1')).toEqual({
      workspaceId: 'workspace-1',
      branchId: 'main',
      revision: 1,
      deletedAt: null
    });
  });

  it('只接受逐实体带整数 revision 的应用回执', () => {
    expect(
      parseAppliedRevisions({ revisions: [{ entity: 'MediaPromptTemplate', entityId: 'a', revision: 2 }] })
    ).toEqual([{ entity: 'MediaPromptTemplate', entityId: 'a', revision: 2 }]);
    for (const receipt of [
      null,
      {},
      { revisions: [{ entity: 'x', entityId: 'a', revision: '2' }] },
      { revisions: [{ entity: 1 }] }
    ])
      expect(() => parseAppliedRevisions(receipt)).toThrow('回执无效');
  });

  it('服务端提交状态映射为提交详情的视图模型，冲突信息随行', () => {
    expect(
      toAdminConfigCommitView(
        {
          id: 'c1',
          workspaceId: 'w1',
          branchId: 'main',
          parentIds: ['p1', 'p2'],
          authorId: identity,
          message: '更新模板',
          operationId: 'o1',
          status: 'released',
          createdAt: '2026-11-16T01:00:00Z',
          appliedAt: '2026-11-16T01:01:00Z',
          releasedAt: '2026-11-16T01:02:00Z',
          rejectionCode: null
        },
        '版本冲突'
      )
    ).toEqual({
      id: 'c1',
      message: '更新模板',
      branchId: 'main',
      authorId: identity,
      authorLabel: null,
      parentIds: ['p1', 'p2'],
      status: 'released',
      createdAt: '2026-11-16T01:00:00Z',
      appliedAt: '2026-11-16T01:01:00Z',
      releasedAt: '2026-11-16T01:02:00Z',
      rejectionCode: null,
      conflictMessage: '版本冲突'
    });
  });
});

describe('AdminConfigModelComponent 状态', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [AdminConfigModelComponent] });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('在浏览器断网时切换离线状态，恢复网络后回到待同步而不是继续显示离线', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(true);
    const component = (await createComponent()).componentInstance;

    window.dispatchEvent(new Event('offline'));
    expect(component.offline()).toBe(true);
    expect(component.syncState()).toBe('offline');

    window.dispatchEvent(new Event('online'));
    expect(component.offline()).toBe(false);
    expect(component.syncState()).toBe('idle');
  });

  it('初始化时已经断网会显示离线保存状态', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false);
    const component = (await createComponent()).componentInstance;

    expect(component.offline()).toBe(true);
    expect(component.syncState()).toBe('offline');
  });

  it('只允许已同步或已校验提交进入应用，已应用或已发布提交进入安全回滚', async () => {
    const component = (await createComponent()).componentInstance;

    expect(component.canApply('prepared')).toBe(false);
    expect(component.canApply('synced')).toBe(true);
    expect(component.canApply('validated')).toBe(true);
    expect(component.canRollback('synced')).toBe(false);
    expect(component.canRollback('applied')).toBe(true);
    expect(component.canRollback('released')).toBe(true);
  });

  it('权限未能确认时保持 unknown，只显示错误与重新读取，不渲染任何特权控件', async () => {
    const fixture = await createComponent();
    await vi.waitFor(() => expect(fixture.componentInstance.message()).toBe('测试不访问远端配置。'));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.permission()).toBe('unknown');
    expect(root.querySelector('app-admin-config-commit')).toBeNull();
    expect(root.querySelector('form.commit-form')).toBeNull();
    expect(root.querySelector('rxdb-entity-list')).toBeNull();
    expect(root.textContent).toContain('重新读取');
  });

  it('撤权管理员打开配置页：明确提示无权限，不打开本地配置库也不渲染列表与提交入口', async () => {
    const fixture = await createComponent(revokedClient());
    await vi.waitFor(() => expect(fixture.componentInstance.permission()).toBe('denied'));
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    expect(fixture.componentInstance.databaseReady()).toBe(false);
    expect(root.querySelector('[role="alert"]')?.textContent).toContain('没有');
    expect(root.querySelector('rxdb-entity-list')).toBeNull();
    expect(root.querySelector('button')).toBeNull();
  });
});

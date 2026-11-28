import { RxDB, type RxDBGrant } from '@aiao/rxdb';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { CdkPortal } from '@angular/cdk/portal';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LucideDynamicIcon } from '@lucide/angular';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { PageWorkbench } from '../page-workbench';
import { RemoteSyncState } from '../remote-sync-state';
import { RightPanel } from '../side-panel';
import { CatalogLocalWrites } from './catalog-local-writes';
import { CatalogRemoteState } from './catalog-remote-state';
import CatalogPage from './catalog.page';

// 三个面板各自要连 RxDB 与远端，这里只验页面怎么摆它们
@Component({ selector: 'app-catalog-synced-panel', template: '' })
class SyncedPanelStub {}

@Component({ selector: 'app-catalog-browse-panel', template: '' })
class BrowsePanelStub {}

@Component({ selector: 'app-catalog-server-panel', template: '' })
class ServerPanelStub {}

const TENANTS = [
  { id: 'jiguang', name: '极光百货' },
  { id: 'xinghe', name: '星河零售' }
];

function renderCatalog(options: { blockedReason?: string | null; signedIn?: boolean; grants?: RxDBGrant[] } = {}) {
  const history = {
    type: 'repository',
    histories$: of([]),
    undoCount$: of(0),
    redoCount$: of(0),
    undoBarrier$: of(null),
    redoBarrier$: of(null),
    undo: vi.fn(() => Promise.resolve()),
    redo: vi.fn(() => Promise.resolve())
  };
  const rxdb = {
    versionManager: { history: vi.fn(() => history), pushableCount$: of(0), pullableCount$: of(0) },
    syncManager: {}
  };
  TestBed.configureTestingModule({
    imports: [CatalogPage],
    providers: [
      { provide: RxDB, useValue: rxdb },
      {
        provide: DemoSession,
        useValue: {
          prepared: { databaseName: 'dev-rxdb-supabase-visitor', identity: { subject: 'user-alice' } },
          description: { title: '访客', detail: '未登录' },
          signedIn: options.signedIn ?? false
        }
      }
    ]
  });
  TestBed.overrideComponent(CatalogPage, {
    set: {
      imports: [CdkPortal, LucideDynamicIcon, SyncedPanelStub, BrowsePanelStub, ServerPanelStub],
      providers: [
        {
          provide: CatalogRemoteState,
          useValue: {
            $callerBuckets: signal(['public']),
            $tenants: signal(TENANTS),
            $grants: signal(options.grants ?? []),
            $error: signal(null),
            refresh: vi.fn(),
            tenantName: (tenantId: string) => TENANTS.find(tenant => tenant.id === tenantId)?.name ?? tenantId
          }
        },
        { provide: CatalogLocalWrites, useValue: { $blockedReason: signal(options.blockedReason ?? null) } }
      ]
    }
  });
  TestBed.inject(RemoteSyncState).markConnected(true);
  const fixture = TestBed.createComponent(CatalogPage);
  fixture.detectChanges();
  const page = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    page,
    rxdb,
    history,
    toggle: page.querySelector('[data-testid="catalog-server-toggle"]') as HTMLButtonElement
  };
}

describe('CatalogPage', () => {
  it('单栏：主界面只有身份、本机同步的商品与在线浏览，模拟服务端变更不在主界面（US-232）', () => {
    const { page, toggle } = renderCatalog();
    const display = page.querySelector('[data-testid="catalog-display"]');

    expect(display!.querySelector('[data-testid="catalog-identity"]')).not.toBeNull();
    expect(display!.querySelector('app-catalog-synced-panel')).not.toBeNull();
    expect(display!.querySelector('app-catalog-browse-panel')).not.toBeNull();
    expect(page.querySelector('app-catalog-server-panel')).toBeNull();
    expect(page.querySelector('[data-testid="catalog-operations"]')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  // US-234 AC#11、#12：角色来自 rxdb_caller_grants()，按租户列出
  it('身份与权限：按租户列出当前身份的角色，两个预设以外的组合原样列出权限；登录身份显示用户 id', () => {
    const { page } = renderCatalog({
      signedIn: true,
      grants: [
        { scope: 'tenant:jiguang', permissions: ['read'] },
        { scope: 'tenant:xinghe', permissions: ['read', 'edit', 'manage'] },
        { scope: 'user:user-alice', permissions: ['read', 'edit'] }
      ]
    });
    const roles = [...page.querySelectorAll('[data-testid="catalog-role"]')].map(role => role.textContent?.trim());

    expect(roles).toEqual(['极光百货 · 员工', '星河零售 · 管理员']);
    expect(page.querySelector('[data-testid="catalog-user-id"]')?.textContent).toBe('user-alice');
    TestBed.resetTestingModule();

    const custom = renderCatalog({
      signedIn: true,
      grants: [{ scope: 'tenant:xinghe', permissions: ['read', 'edit'] }]
    });
    expect(custom.page.querySelector('[data-testid="catalog-role"]')?.textContent?.trim()).toBe(
      '星河零售 · read、edit'
    );
  });

  it('访客没有成员权限，也没有用户 id', () => {
    const { page } = renderCatalog();

    expect(page.querySelectorAll('[data-testid="catalog-role"]')).toHaveLength(0);
    expect(page.querySelector('[data-testid="catalog-roles"]')?.textContent).toContain('访客没有成员权限');
    expect(page.querySelector('[data-testid="catalog-user-id"]')).toBeNull();
  });

  it('页头的开关在右侧面板打开模拟服务端变更；再点一下收起', () => {
    const { fixture, toggle } = renderCatalog();
    const panel = TestBed.inject(RightPanel);

    expect(panel.headingOf('server')).toBe('模拟服务端变更');
    toggle.click();
    fixture.detectChanges();
    expect(panel.active()).toBe('server');
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    toggle.click();
    expect(panel.active()).toBeNull();
  });

  it('登记到顶栏：撤销、重做只作用于商品，访客等写入口关着的原因交给顶栏（epic-016）', () => {
    const { rxdb } = renderCatalog({ blockedReason: '访客只读：登录成员才能在本机改商品' });
    const page = TestBed.inject(PageWorkbench).current();

    expect(page).toMatchObject({ title: '商品目录', scopeLabel: '本页：商品' });
    expect(rxdb.versionManager.history).toHaveBeenCalledWith(CatalogItem);
    expect(page?.undo?.disabledReason()).toBe('访客只读：登录成员才能在本机改商品');
    expect(page?.redo?.disabledReason()).toBe('访客只读：登录成员才能在本机改商品');
  });

  it('离开页面：注销登记，撤回模拟服务端变更的面板，开着就一并关上', () => {
    const { fixture, toggle } = renderCatalog();
    const panel = TestBed.inject(RightPanel);
    toggle.click();

    fixture.destroy();

    expect(TestBed.inject(PageWorkbench).current()).toBeNull();
    expect(panel.pagePanel('server')).toBeUndefined();
    expect(panel.active()).toBeNull();
  });
});

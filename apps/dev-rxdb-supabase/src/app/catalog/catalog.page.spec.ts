import { RxDB } from '@aiao/rxdb';
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

function renderCatalog(options: { blockedReason?: string | null } = {}) {
  const history = {
    type: 'repository',
    histories$: of([]),
    undoCount$: of(0),
    redoCount$: of(0),
    undoBarrier$: of(null),
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
          prepared: { databaseName: 'dev-rxdb-supabase-visitor' },
          description: { title: '访客', detail: '未登录' }
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
          useValue: { $callerBuckets: signal(['public']), $tenants: signal([]), $error: signal(null), refresh: vi.fn() }
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

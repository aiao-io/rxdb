import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { RemoteSyncState } from '../remote-sync-state';
import { CatalogRemoteState } from './catalog-remote-state';
import CatalogPage from './catalog.page';

// 三个面板各自要连 RxDB 与远端，这里只验页面怎么摆它们
@Component({ selector: 'app-catalog-synced-panel', template: '' })
class SyncedPanelStub {}

@Component({ selector: 'app-catalog-browse-panel', template: '' })
class BrowsePanelStub {}

@Component({ selector: 'app-catalog-server-panel', template: '' })
class ServerPanelStub {}

function renderCatalog(): HTMLElement {
  TestBed.configureTestingModule({
    imports: [CatalogPage],
    providers: [
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
      imports: [SyncedPanelStub, BrowsePanelStub, ServerPanelStub],
      providers: [
        {
          provide: CatalogRemoteState,
          useValue: { $callerBuckets: signal(['public']), $tenants: signal([]), $error: signal(null), refresh: vi.fn() }
        }
      ]
    }
  });
  TestBed.inject(RemoteSyncState).markConnected(true);
  const fixture = TestBed.createComponent(CatalogPage);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CatalogPage', () => {
  it('商品展示与模拟服务端变更分成两栏：模拟操作单独一栏', () => {
    const page = renderCatalog();
    const display = page.querySelector('[data-testid="catalog-display"]');
    const operations = page.querySelector('aside[data-testid="catalog-operations"]');

    expect(display).not.toBeNull();
    expect(operations).not.toBeNull();
    expect(display!.querySelector('[data-testid="catalog-identity"]')).not.toBeNull();
    expect(display!.querySelector('app-catalog-synced-panel')).not.toBeNull();
    expect(display!.querySelector('app-catalog-browse-panel')).not.toBeNull();
    expect(display!.querySelector('app-catalog-server-panel')).toBeNull();
    expect(operations!.querySelector('app-catalog-server-panel')).not.toBeNull();
  });
});

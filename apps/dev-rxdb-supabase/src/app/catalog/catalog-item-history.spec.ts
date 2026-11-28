import { RxDB } from '@aiao/rxdb';
import type { SupabaseEntityHistoryItem } from '@aiao/rxdb-adapter-supabase';
import { CatalogItem } from '@aiao/rxdb-test/entities';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DemoSession } from '../demo-session';
import { CatalogItemHistory } from './catalog-item-history';

const ME = '00000000-0000-4000-8000-0000000000a1';

const pushed: SupabaseEntityHistoryItem = {
  id: 1,
  changeId: 10,
  namespace: 'public',
  entity: 'CatalogItem',
  entityId: 'item-1',
  bucket: 'tenant:xinghe',
  type: 'UPDATE',
  patch: { price: 199 },
  inversePatch: { price: 299 },
  beforeData: { price: 299 },
  afterData: { price: 199 },
  actor: ME,
  role: 'authenticated',
  source: 'push',
  clientId: 'client-1',
  localId: 3,
  branchId: 'main',
  createdAt: new Date('2026-11-26T09:00:00Z')
};

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round++) {
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise(resolve => setTimeout(resolve));
  }
  fixture.detectChanges();
}

function render(getEntityHistory: () => Promise<SupabaseEntityHistoryItem[]>) {
  const remote = { getEntityHistory: vi.fn(getEntityHistory) };
  TestBed.configureTestingModule({
    imports: [CatalogItemHistory],
    providers: [
      { provide: RxDB, useValue: { getAdapter: vi.fn(() => Promise.resolve(remote)) } },
      { provide: DemoSession, useValue: { prepared: { session: { subject: ME } } } }
    ]
  });
  const fixture = TestBed.createComponent(CatalogItemHistory);
  fixture.detectChanges();
  return { fixture, remote, root: fixture.nativeElement as HTMLElement };
}

describe('CatalogItemHistory（US-229）', () => {
  it('打开时读这件商品的历史，按条列出谁改的与改了什么', async () => {
    const { fixture, remote, root } = render(() => Promise.resolve([pushed]));

    await fixture.componentInstance.open({ id: 'item-1', name: '星河 X1 蓝牙耳机' });
    await settle(fixture);

    expect(remote.getEntityHistory).toHaveBeenCalledWith(CatalogItem, 'item-1');
    expect(root.querySelector('h3')?.textContent).toBe('变更历史 · 星河 X1 蓝牙耳机');
    const entries = root.querySelectorAll('[data-testid="history-entry"]');
    expect(entries).toHaveLength(1);
    expect(entries[0].textContent).toContain('修改 · 本机推送');
    expect(entries[0].textContent).toContain('我');
    expect(entries[0].textContent).toContain('售价：299 → 199');
  });

  it('读取失败时报出原因', async () => {
    const { fixture, root } = render(() => Promise.reject(new Error('permission denied')));

    await fixture.componentInstance.open({ id: 'item-1', name: '耳机' });
    await settle(fixture);

    expect(root.querySelector('[role="alert"]')?.textContent).toContain('permission denied');
  });

  it('还没有远端历史时说明推送之后才会记下', async () => {
    const { fixture, root } = render(() => Promise.resolve([]));

    await fixture.componentInstance.open({ id: 'item-1', name: '耳机' });
    await settle(fixture);

    expect(root.querySelector('[data-testid="history-entries"]')?.textContent).toContain('推送之后才会记下');
  });
});

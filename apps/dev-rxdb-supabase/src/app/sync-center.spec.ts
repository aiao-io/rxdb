import { type HistoryItem, RxDB, type RxDBChange } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DemoSession } from './demo-session';
import { RemoteSyncState } from './remote-sync-state';
import { SyncCenter } from './sync-center';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn(), useSyncState: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll, useSyncState: angularMocks.useSyncState };
});

const change = (id: number, type: RxDBChange['type'], entity: string, patch: Record<string, unknown>) =>
  ({ id, type, entity, namespace: 'public', patch, inversePatch: null }) as unknown as RxDBChange;

const item = (fingerprint: string, ...changes: RxDBChange[]) =>
  ({ fingerprint, changes, createdAt: new Date('2026-11-26T08:00:00Z') }) as HistoryItem;

const status = (namespace: string, entity: string, pushableCount: number, pullableCount: number) => ({
  repository: { namespace, entity },
  pushableCount,
  pullableCount
});

const statuses = [
  status('public', 'DemoCustomer', 1, 0),
  status('public', 'CatalogItem', 0, 2),
  status('rxdb', 'RxDBBranch', 1, 0)
];

function render(
  options: { connected?: boolean; pending?: HistoryItem[]; statuses?: () => Promise<ReturnType<typeof status>[]> } = {}
) {
  angularMocks.useFindAll.mockReturnValue({ value: signal([{ id: 'main', activated: true }]) });
  angularMocks.useSyncState.mockReturnValue({ online: signal(true), lastRejections: signal([]) });
  const pending$ = new BehaviorSubject(options.pending ?? []);
  const getAllRepositorySyncStatus = vi.fn(options.statuses ?? (async () => statuses));
  TestBed.configureTestingModule({
    imports: [SyncCenter],
    providers: [
      {
        provide: RxDB,
        useValue: {
          syncManager: { getAllRepositorySyncStatus },
          versionManager: {
            pushableCount$: new BehaviorSubject((options.pending ?? []).length),
            pullableCount$: new BehaviorSubject(2),
            pushableHistories$: pending$
          }
        }
      },
      {
        provide: DemoSession,
        useValue: {
          description: { title: 'Alice', detail: '星河零售 · alice@example.com' },
          prepared: { databaseName: 'dev-rxdb-supabase-alice' }
        }
      }
    ]
  });
  TestBed.inject(RemoteSyncState).markConnected(options.connected ?? true);
  const fixture = TestBed.createComponent(SyncCenter);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  const allByTestId = (id: string) => [...element.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
  return { fixture, byTestId, allByTestId, getAllRepositorySyncStatus };
}

beforeEach(() => {
  angularMocks.useFindAll.mockReset();
  angularMocks.useSyncState.mockReset();
});

describe('SyncCenter', () => {
  it('写出当前身份、本地库与分支（只读）', () => {
    const { byTestId } = render();

    expect(byTestId('sync-center-identity')?.textContent).toContain('Alice');
    expect(byTestId('sync-center-branch')?.textContent?.trim()).toBe('main');
    expect(byTestId('sync-center-online')?.textContent?.trim()).toBe('在线');
  });

  it('按实体分列待推待拉：用演示里的叫法和页面，不列系统实体', async () => {
    const { fixture, allByTestId } = render();
    await fixture.whenStable();
    fixture.detectChanges();

    const rows = allByTestId('sync-center-repository').map(row => row.textContent?.replace(/\s+/g, '') ?? '');
    expect(rows).toEqual(['客户·订单待推1·待拉0', '商品·商品目录待推0·待拉2']);
  });

  it('待推送清单按页面分组，一个事务一项，项数等于待推数；展开看逐字段的改之后', () => {
    const { byTestId, allByTestId } = render({
      pending: [
        item('a', change(3, 'INSERT', 'Todo', { title: '买牛奶' })),
        item(
          'b',
          change(2, 'INSERT', 'DemoIdCard', { code: 'ID-1' }),
          change(1, 'INSERT', 'DemoCustomer', { name: '张三' })
        )
      ]
    });

    expect(byTestId('sync-center')?.textContent).toContain('推送会带上 2 项');
    expect(allByTestId('pending-history')).toHaveLength(2);
    expect(allByTestId('sync-center-pending-group').map(group => group.getAttribute('data-page'))).toEqual([
      'Todo',
      '订单'
    ]);
    expect(allByTestId('pending-history')[1].textContent).toContain('一次写入：新建证件、新建客户');
    expect(allByTestId('change-diff-line').map(line => line.textContent?.replace(/\s+/g, ''))).toContain(
      'name—→"张三"'
    );
  });

  it('按实体的数字还没查回来时写「正在查」，不先说没有待推待拉', async () => {
    // 查询一直不回来：不能等 whenStable，它要等到这次查询结束
    const { fixture, byTestId } = render({ statuses: () => new Promise(() => undefined) });
    TestBed.tick();
    fixture.detectChanges();

    expect(byTestId('sync-center-loading')).not.toBeNull();
    expect(byTestId('sync-center-clean')).toBeNull();
  });

  it('查回来一个都没有时才说没有待推、待拉的实体', async () => {
    const { fixture, byTestId } = render({ statuses: async () => [] });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId('sync-center-loading')).toBeNull();
    expect(byTestId('sync-center-clean')).not.toBeNull();
  });

  it('查不到时写出原因，不说没有待推待拉', async () => {
    const { fixture, byTestId } = render({ statuses: () => Promise.reject(new Error('网络断了')) });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(byTestId('sync-center-status-error')?.textContent).toContain('网络断了');
    expect(byTestId('sync-center-clean')).toBeNull();
  });

  it('本机没有待推送时说清楚', () => {
    const { byTestId } = render();

    expect(byTestId('sync-center-pending-empty')).not.toBeNull();
  });

  it('本地模式：只写本机信息，没有推拉与清单，也不去问远端', () => {
    const { byTestId, getAllRepositorySyncStatus } = render({ connected: false });

    expect(byTestId('sync-center-online')?.textContent?.trim()).toBe('未连接（纯本地模式）');
    expect(byTestId('sync-center-push')).toBeNull();
    expect(byTestId('sync-center-pending-empty')).toBeNull();
    expect(getAllRepositorySyncStatus).not.toHaveBeenCalled();
  });
});

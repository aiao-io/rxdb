import { type HistoryItem, type HistoryScopeAPI, RxDB, type RxDBChange } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { OperationHistoryPanel } from './operation-history-panel';
import { PageWorkbench, type PageWorkbenchRegistration, type WorkbenchAction } from './page-workbench';
import { RemoteSyncState } from './remote-sync-state';

const change = (id: number, overrides: Partial<RxDBChange> = {}) =>
  ({
    id,
    type: 'UPDATE',
    entity: 'CatalogItem',
    patch: { price: 199 },
    inversePatch: { price: 299 },
    rejectedAt: null,
    ...overrides
  }) as unknown as RxDBChange;

const item = (fingerprint: string, changes: RxDBChange[], overrides: Partial<HistoryItem> = {}) =>
  ({
    fingerprint,
    changes,
    type: 'UPDATE',
    reverted: false,
    redoInvalidated: false,
    createdAt: new Date('2026-11-26T08:00:00Z'),
    ...overrides
  }) as HistoryItem;

const action = (count: number): WorkbenchAction => ({
  run: vi.fn(() => Promise.resolve()),
  count: signal(count),
  pending: signal(false),
  disabledReason: signal(null)
});

function render(
  histories: HistoryItem[],
  options: { pendingIds?: number[]; connected?: boolean; page?: boolean } = {}
) {
  TestBed.configureTestingModule({
    imports: [OperationHistoryPanel],
    providers: [
      {
        provide: RxDB,
        useValue: {
          versionManager: {
            pushableHistories$: new BehaviorSubject((options.pendingIds ?? []).map(id => item(`p${id}`, [change(id)])))
          }
        }
      }
    ]
  });
  TestBed.inject(RemoteSyncState).markConnected(options.connected ?? true);
  if (options.page !== false) {
    const page: PageWorkbenchRegistration = {
      title: '商品目录',
      scopeLabel: '本页：商品',
      undo: action(2),
      redo: action(1),
      history: { histories$: new BehaviorSubject(histories) } as unknown as HistoryScopeAPI,
      push: null,
      pull: null
    };
    TestBed.inject(PageWorkbench).register(page);
  }
  const fixture = TestBed.createComponent(OperationHistoryPanel);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const allByTestId = (id: string) => [...element.querySelectorAll(`[data-testid="${id}"]`)] as HTMLElement[];
  return { element, allByTestId };
}

describe('OperationHistoryPanel', () => {
  it('面板头写作用域与可撤销、可重做次数；按最新在前列出本页的历史', () => {
    const { element, allByTestId } = render([item('b', [change(2)]), item('a', [change(1, { type: 'INSERT' })])]);

    expect(element.querySelector('[data-testid="operation-history-scope"]')?.textContent).toContain(
      '本页：商品 · 可撤销 2 · 可重做 1'
    );
    expect(
      allByTestId('operation-history-item').map(row => row.querySelector('summary span')?.textContent?.trim())
    ).toEqual(['修改商品', '新建商品']);
  });

  it('还在待推送里的标 ↑；已撤销、已失效、被拒各有标记', () => {
    const { allByTestId } = render(
      [
        item('pending', [change(4)]),
        item('reverted', [change(3)], { reverted: true }),
        item('invalidated', [change(2)], { reverted: true, redoInvalidated: true }),
        item('rejected', [change(1, { rejectedAt: new Date() })])
      ],
      { pendingIds: [4] }
    );

    const chips = allByTestId('operation-history-item').map(row =>
      [...row.querySelectorAll('[data-testid="history-chip"]')].map(chip => chip.getAttribute('data-chip'))
    );
    expect(chips).toEqual([['pending'], ['reverted'], ['invalidated'], ['rejected']]);
  });

  it('本地模式不标 ↑：没有推送', () => {
    const { allByTestId } = render([item('pending', [change(4)])], { pendingIds: [4], connected: false });

    expect(allByTestId('history-chip')).toHaveLength(0);
  });

  it('这次打开之后本页还没有修改；当前页面没有登记时说明没有操作历史', () => {
    expect(render([]).allByTestId('operation-history-empty')).toHaveLength(1);
    TestBed.resetTestingModule();
    expect(render([], { page: false }).element.textContent).toContain('当前页面没有操作历史');
  });
});

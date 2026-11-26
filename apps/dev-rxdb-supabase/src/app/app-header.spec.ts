import { RxDB, type SyncRejection } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppHeader } from './app-header';
import { AppService } from './app.service';
import { DemoSession } from './demo-session';
import { PageWorkbench, type PageWorkbenchRegistration, type WorkbenchAction } from './page-workbench';
import { RemoteSyncState } from './remote-sync-state';
import { RightPanel } from './side-panel';

const angularMocks = vi.hoisted(() => ({ useSyncState: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useSyncState: angularMocks.useSyncState };
});

function action(options: { count?: number; disabled?: string | null } = {}): WorkbenchAction {
  return {
    run: vi.fn(() => Promise.resolve()),
    count: signal(options.count ?? 0),
    pending: signal(false),
    disabledReason: signal(options.disabled ?? null)
  };
}

function registration(overrides: Partial<PageWorkbenchRegistration> = {}): PageWorkbenchRegistration {
  return {
    title: '商品目录',
    scopeLabel: '本页：商品',
    undo: action({ count: 2 }),
    redo: action({ disabled: '没有可重做的修改' }),
    history: { type: 'repository' } as PageWorkbenchRegistration['history'],
    push: null,
    pull: null,
    ...overrides
  };
}

function renderHeader(
  session: Partial<DemoSession>,
  options: { page?: PageWorkbenchRegistration; rejections?: readonly SyncRejection[] } = {}
) {
  angularMocks.useSyncState.mockReturnValue({ lastRejections: signal(options.rejections ?? []), online: signal(true) });
  TestBed.configureTestingModule({
    imports: [AppHeader],
    providers: [
      { provide: DemoSession, useValue: { $switching: signal(false), switchTo: vi.fn(), ...session } },
      { provide: RxDB, useValue: { versionManager: { pushableCount$: of(3), pullableCount$: of(1) }, syncManager: {} } }
    ]
  });
  if (options.page) TestBed.inject(PageWorkbench).register(options.page);
  const fixture = TestBed.createComponent(AppHeader);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const select = element.querySelector('select[aria-label="切换身份"]') as HTMLSelectElement | null;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { fixture, select, byTestId };
}

const ALICE = { description: { title: 'Alice', detail: '星河零售' }, currentChoice: 'alice' };

beforeEach(() => angularMocks.useSyncState.mockReset());

describe('AppHeader', () => {
  it('切换菜单选中的是当前身份，不是第一项', () => {
    const { select } = renderHeader(ALICE);

    expect(select?.value).toBe('alice');
  });

  it('选了另一个身份就去切换', () => {
    const switchTo = vi.fn();
    const { select } = renderHeader({
      description: { title: '访客', detail: '未登录' },
      currentChoice: 'visitor',
      switchTo
    });

    select!.value = 'bob';
    select!.dispatchEvent(new Event('change'));

    expect(switchTo).toHaveBeenCalledWith('bob');
  });

  it('本地模式没有身份：不显示切换菜单', () => {
    const { select } = renderHeader({ description: undefined, currentChoice: null });

    expect(select).toBeNull();
  });

  // 安全提示不在每个页面顶部占一整行，收成顶栏上的一个图标
  it('远端同步连上时，顶栏有同步提示图标', () => {
    const { fixture } = renderHeader(ALICE);

    TestBed.inject(RemoteSyncState).markConnected(true);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="remote-security-toggle"]')).not.toBeNull();
  });

  // 窄屏上侧栏默认收起成抽屉，顶栏要有打开它的入口（宽屏由 md:hidden 隐藏）
  it('菜单按钮开合侧栏', () => {
    const { fixture } = renderHeader({ description: undefined, currentChoice: null });
    const app = TestBed.inject(AppService);
    const before = app.$sidebarPinned();

    (fixture.nativeElement.querySelector('button[aria-label="菜单"]') as HTMLButtonElement).click();

    expect(app.$sidebarPinned()).toBe(!before);
  });
});

describe('AppHeader：按页面登记渲染（epic-016）', () => {
  it('没有登记的页面（首页）：没有编辑组，也没有同步组', () => {
    const { byTestId } = renderHeader(ALICE);

    expect(byTestId('workbench-edit-group')).toBeNull();
    expect(byTestId('workbench-sync-group')).toBeNull();
  });

  it('撤销、重做带次数并写明作用域；不能点的用 aria-disabled，原因放进 title', () => {
    const { byTestId } = renderHeader(ALICE, { page: registration() });

    expect(byTestId('workbench-title')?.textContent?.trim()).toBe('商品目录');
    expect(byTestId('workbench-scope')?.textContent?.trim()).toBe('本页：商品');
    expect(byTestId('workbench-undo-count')?.textContent?.trim()).toBe('2');
    expect(byTestId('workbench-undo')?.getAttribute('aria-disabled')).toBe('false');
    expect(byTestId('workbench-redo')?.getAttribute('aria-disabled')).toBe('true');
    expect(byTestId('workbench-redo')?.getAttribute('title')).toBe('没有可重做的修改');
  });

  it('点撤销执行页面登记的命令；点不了的重做不执行', () => {
    const page = registration();
    const { byTestId } = renderHeader(ALICE, { page });

    byTestId('workbench-undo')!.click();
    byTestId('workbench-redo')!.click();

    expect(page.undo?.run).toHaveBeenCalledTimes(1);
    expect(page.redo?.run).not.toHaveBeenCalled();
  });

  it('登记了推拉才有同步组：拉取、推送带待拉待推数，组上带轮次', () => {
    const { byTestId } = renderHeader(ALICE, {
      page: registration({ pull: action({ count: 1 }), push: action({ count: 3 }) })
    });

    expect(byTestId('workbench-sync-group')?.getAttribute('data-sync-round')).toBe('0');
    expect(byTestId('sync-pullable-count')?.textContent?.trim()).toBe('1');
    expect(byTestId('sync-pushable-count')?.textContent?.trim()).toBe('3');
    expect(byTestId('sync-center-toggle')).not.toBeNull();
  });

  it('有被拒的推送时，同步中心开关上标出条数', () => {
    const rejection = { entity: 'Todo' } as SyncRejection;
    const { byTestId } = renderHeader(ALICE, {
      page: registration({ pull: action(), push: action() }),
      rejections: [rejection, rejection]
    });

    expect(byTestId('sync-center-rejections')?.textContent?.trim()).toBe('2');
  });

  it('操作历史开关打开右侧面板，再点一下关上', () => {
    const { fixture, byTestId } = renderHeader(ALICE, { page: registration() });
    const panel = TestBed.inject(RightPanel);

    byTestId('workbench-history-toggle')!.click();
    fixture.detectChanges();
    expect(panel.active()).toBe('history');
    expect(byTestId('workbench-history-toggle')?.getAttribute('aria-pressed')).toBe('true');

    byTestId('workbench-history-toggle')!.click();
    expect(panel.active()).toBeNull();
  });
});

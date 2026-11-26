import { RxDB, type HistoryScopeAPI } from '@aiao/rxdb';
import { TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HistoryColumn, HistoryColumnOutlet } from './history-column';
import { PageWorkbench, type PageWorkbenchRegistration } from './page-workbench';

/** 固定宽窄屏：HistoryColumn 构造时读一次 matchMedia */
function viewport(wide: boolean) {
  vi.spyOn(window, 'matchMedia').mockReturnValue({
    matches: wide,
    addEventListener: () => undefined,
    removeEventListener: () => undefined
  } as unknown as MediaQueryList);
}

const page = (history: HistoryScopeAPI | null): PageWorkbenchRegistration => ({
  title: 'Todo',
  scopeLabel: '本页：Todo',
  undo: null,
  redo: null,
  history,
  push: null,
  pull: null
});

const scope = { histories$: new BehaviorSubject([]) } as unknown as HistoryScopeAPI;

function render(registration: PageWorkbenchRegistration | null) {
  TestBed.configureTestingModule({
    providers: [{ provide: RxDB, useValue: { versionManager: { pushableHistories$: new BehaviorSubject([]) } } }]
  });
  if (registration) TestBed.inject(PageWorkbench).register(registration);
  const fixture = TestBed.createComponent(HistoryColumnOutlet);
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const byTestId = (id: string) => element.querySelector(`[data-testid="${id}"]`) as HTMLElement | null;
  return { fixture, element, byTestId, column: TestBed.inject(HistoryColumn) };
}

afterEach(() => vi.restoreAllMocks());

describe('HistoryColumn', () => {
  it('宽屏默认开着，窄屏默认收起（抽屉会盖住页面）', () => {
    viewport(true);
    expect(TestBed.inject(HistoryColumn).open()).toBe(true);
    TestBed.resetTestingModule();
    viewport(false);
    expect(TestBed.inject(HistoryColumn).open()).toBe(false);
  });
});

describe('HistoryColumnOutlet', () => {
  it('宽屏：本页登记了操作历史就在左侧占一栏，不加遮罩、不抢焦点', () => {
    viewport(true);
    const { byTestId } = render(page(scope));

    const aside = byTestId('history-column');
    expect(aside?.getAttribute('role')).toBe('complementary');
    expect(aside?.id).toBe('history-column');
    expect(aside?.textContent).toContain('操作历史');
    expect(aside?.querySelector('app-operation-history-panel')).not.toBeNull();
    expect(byTestId('history-column-backdrop')).toBeNull();
    expect(aside?.contains(document.activeElement)).toBe(false);
  });

  it('没有登记操作历史的页面（首页）：不显示', () => {
    viewport(true);
    expect(render(page(null)).byTestId('history-column')).toBeNull();
    TestBed.resetTestingModule();
    expect(render(null).byTestId('history-column')).toBeNull();
  });

  it('收起按钮关上它，焦点回到开关；再开从开关进', () => {
    viewport(true);
    const { fixture, byTestId, column } = render(page(scope));
    const opener = document.body.appendChild(document.createElement('button'));

    column.toggle(opener);
    fixture.detectChanges();
    expect(byTestId('history-column')).toBeNull();
    column.toggle(opener);
    fixture.detectChanges();
    (byTestId('history-column-close') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(column.open()).toBe(false);
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it('窄屏：开关打开盖住页面的抽屉，点遮罩或按 Esc 收起', () => {
    viewport(false);
    const { fixture, byTestId, column } = render(page(scope));

    column.toggle(null);
    fixture.detectChanges();
    expect(byTestId('history-column')?.getAttribute('aria-modal')).toBe('true');
    byTestId('history-column-backdrop')!.click();
    fixture.detectChanges();
    expect(column.open()).toBe(false);

    column.toggle(null);
    fixture.detectChanges();
    byTestId('history-column')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(column.open()).toBe(false);
  });
});

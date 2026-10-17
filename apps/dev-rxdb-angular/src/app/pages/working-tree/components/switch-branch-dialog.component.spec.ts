import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkingTreeSwitchBranchDialogComponent } from './switch-branch-dialog.component';

/**
 * @fileoverview 带着未提交改动切分支时的确认对话框（GitHub Desktop 的「Switch branch」，React / Vue 端同名 spec 的移植）。
 */

const find = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

const get = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement => {
  const element = find(fixture, selector);
  if (element === null) throw new Error(`找不到 ${selector}`);
  return element;
};

/** 模板里的换行缩进折成单个空格，与读屏、Playwright 的 toHaveText 同口径。 */
const textOf = (element: Element): string => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** 搭一个开着的对话框；组件交出来的事件记在 `events` 里。 */
const createDialog = async (switching = false) => {
  const fixture = TestBed.createComponent(WorkingTreeSwitchBranchDialogComponent);
  const events = { confirmed: 0, closed: 0 };
  fixture.componentInstance.confirmRequested.subscribe(() => events.confirmed++);
  fixture.componentInstance.closeRequested.subscribe(() => events.closed++);
  fixture.componentRef.setInput('dialog', { targetBranchId: 'main' });
  fixture.componentRef.setInput('activeBranch', 'feature/x');
  fixture.componentRef.setInput('switching', switching);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, events };
};

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [WorkingTreeSwitchBranchDialogComponent] }).compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('WorkingTreeSwitchBranchDialogComponent', () => {
  it('关着时什么都不画', async () => {
    const fixture = TestBed.createComponent(WorkingTreeSwitchBranchDialogComponent);
    fixture.componentRef.setInput('activeBranch', 'feature/x');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(find(fixture, '[data-testid="wt-switch-dialog"]')).toBeNull();
  });

  it('问改动怎么办：只有「留在当前分支」一个选项，已选中；对话框以标题命名', async () => {
    const { fixture } = await createDialog();

    const dialog = get(fixture, '[data-testid="wt-switch-dialog"]');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title === null ? '' : textOf(title)).toBe('Switch branch');
    expect(textOf(get(fixture, 'legend'))).toBe(
      'You have changes on this branch. What would you like to do with them?'
    );
    const leave = get(fixture, '[data-testid="wt-switch-leave"]') as HTMLInputElement;
    expect(leave.checked).toBe(true);
    expect(textOf(get(fixture, '[data-testid="wt-switch-leave-option"]'))).toBe(
      'Leave my changes on feature/x Your in-progress work will stay on this branch for you to return to later'
    );
  });

  it('确认交出请求；Cancel 与 Escape 都请求关闭', async () => {
    const { fixture, events } = await createDialog();

    get(fixture, '[data-testid="wt-switch-confirm"]').click();
    expect(events.confirmed).toBe(1);

    get(fixture, '[data-testid="wt-switch-cancel"]').click();
    get(fixture, '[data-testid="wt-switch-dialog"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(events.closed).toBe(2);
  });

  it('切换进行中：确认按钮置灰，连点不会切两次', async () => {
    const { fixture } = await createDialog(true);

    const confirm = get(fixture, '[data-testid="wt-switch-confirm"]') as HTMLButtonElement;
    expect([confirm.disabled, textOf(confirm)]).toEqual([true, 'Switching…']);
  });
});

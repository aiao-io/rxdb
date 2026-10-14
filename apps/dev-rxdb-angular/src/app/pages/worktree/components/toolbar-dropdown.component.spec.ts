import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { LucideFolderTree } from '@lucide/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  WorktreeDropdownCreateDirective,
  WorktreeDropdownRowActionsDirective,
  WorktreeDropdownRowMetaDirective,
  WorktreeToolbarDropdownComponent,
  type WorktreeToolbarDropdownCopy
} from './toolbar-dropdown.component';

/**
 * @fileoverview 工具栏下拉骨架的组件单测。
 *
 * @remarks
 * 列表读取失败与「worktree 已不存在」在 e2e 里造不出来（核心不给注入点），这几条行为只能在这里锁：
 * 警示条 + Retry、忙态禁用、ARIA 结构、回车与 Escape 的 IME 守卫、打开创建弹层后的焦点。
 * 宿主组件用最小的行形状（id + active），三个插槽各给一个最小模板。
 */

interface Row {
  readonly id: string;
  readonly active: boolean;
}

const COPY: WorktreeToolbarDropdownCopy = {
  caption: 'Current Worktree',
  heading: 'Worktrees',
  createButton: 'New worktree',
  createTitle: 'Create a worktree',
  filterPlaceholder: 'Filter',
  filterLabel: 'Filter worktrees',
  listLabel: 'Worktree list',
  backdropLabel: 'Close worktree menu',
  emptyText: 'No worktrees yet',
  noMatchText: 'No matching worktrees'
};

@Component({
  selector: 'app-dropdown-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    WorktreeDropdownCreateDirective,
    WorktreeDropdownRowActionsDirective,
    WorktreeDropdownRowMetaDirective,
    WorktreeToolbarDropdownComponent
  ],
  template: `
    <app-worktree-toolbar-dropdown
      [(createOpen)]="createOpen"
      [(menuOpen)]="menuOpen"
      [busy]="busy()"
      [copy]="copy"
      [icon]="icon"
      [isActive]="isActive"
      [itemBranchId]="rowId"
      [itemKey]="rowId"
      [itemLabel]="rowId"
      [items]="rows()"
      [listError]="listError()"
      [matches]="matches"
      (confirm)="onConfirm()"
      (createOpening)="recordOpening()"
      (retry)="onRetry()"
      (selectItem)="onSelect($event)"
      testIdPrefix="wt-worktree"
    >
      <ng-template [appWorktreeDropdownRowMeta]="rows()" let-row>
        <span>{{ row.id }}</span>
      </ng-template>
      <ng-template [appWorktreeDropdownRowActions]="rows()" let-busy="busy" let-row>
        <button [attr.data-row]="row.id" [disabled]="busy" data-testid="row-action" type="button">x</button>
      </ng-template>
      <ng-template appWorktreeDropdownCreate>
        <input data-autofocus data-testid="create-input" type="text" />
        <input data-testid="create-radio" name="mode" type="radio" />
      </ng-template>
    </app-worktree-toolbar-dropdown>
  `
})
class DropdownHostComponent {
  readonly rows = signal<readonly Row[]>([
    { id: 'main', active: true },
    { id: 'feature/x', active: false },
    { id: ' spaced ', active: false }
  ]);
  readonly busy = signal(false);
  readonly listError = signal<string | null>(null);
  readonly menuOpen = signal(false);
  readonly createOpen = signal(false);
  readonly copy = COPY;
  readonly icon = LucideFolderTree;
  readonly onSelect = vi.fn<(row: Row) => void>();
  readonly onConfirm = vi.fn<() => void>();
  readonly onRetry = vi.fn<() => void>();
  /** 每次 `createOpening` 发出那一刻的 `createOpen`：应当还是 false（包装先重置表单、弹层后打开）。 */
  readonly createOpenAtOpening: boolean[] = [];

  readonly rowId = (row: Row): string => row.id;
  readonly isActive = (row: Row): boolean => row.active;
  readonly matches = (row: Row, needle: string): boolean => row.id.includes(needle);

  recordOpening(): void {
    this.createOpenAtOpening.push(this.createOpen());
  }
}

type HostFixture = ComponentFixture<DropdownHostComponent>;

const rootOf = (fixture: HostFixture): HTMLElement => fixture.nativeElement as HTMLElement;

const queryTestId = (fixture: HostFixture, testId: string): HTMLElement | null =>
  rootOf(fixture).querySelector<HTMLElement>(`[data-testid="${testId}"]`);

const byTestId = (fixture: HostFixture, testId: string): HTMLElement => {
  const element = queryTestId(fixture, testId);
  if (element === null) throw new Error(`找不到 data-testid="${testId}"`);
  return element;
};

const buttonsByTestId = (fixture: HostFixture, testId: string): HTMLButtonElement[] => [
  ...rootOf(fixture).querySelectorAll<HTMLButtonElement>(`[data-testid="${testId}"]`)
];

const render = async (): Promise<HostFixture> => {
  const fixture = TestBed.createComponent(DropdownHostComponent);
  await fixture.whenStable();
  return fixture;
};

const openMenu = async (fixture: HostFixture): Promise<void> => {
  byTestId(fixture, 'wt-worktree-menu').click();
  await fixture.whenStable();
};

const keydown = (init: KeyboardEventInit): KeyboardEvent => new KeyboardEvent('keydown', { bubbles: true, ...init });

describe('WorktreeToolbarDropdownComponent', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('触发按钮指向非模态 dialog 列表；行是普通按钮，当前行带 aria-current，名字原样渲染', async () => {
    const fixture = await render();
    const trigger = byTestId(fixture, 'wt-worktree-menu');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-controls')).toBe('wt-worktree-menu-popup');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');

    await openMenu(fixture);
    const popup = byTestId(fixture, 'wt-worktree-menu-popup');
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(popup.getAttribute('role')).toBe('dialog');
    expect(popup.id).toBe('wt-worktree-menu-popup');
    expect(popup.getAttribute('aria-label')).toBe('Worktree list');
    expect(popup.hasAttribute('aria-modal')).toBe(false);

    const rows = buttonsByTestId(fixture, 'wt-worktree-item');
    expect(rows.map(row => row.getAttribute('data-branch-id'))).toEqual(['main', 'feature/x', ' spaced ']);
    expect(rows.every(row => !row.hasAttribute('role') && !row.disabled)).toBe(true);
    expect(rows.every(row => row.closest('li')?.parentElement?.tagName === 'UL')).toBe(true);
    expect(rows[0].getAttribute('aria-current')).toBe('true');
    expect(rows.slice(1).some(row => row.hasAttribute('aria-current'))).toBe(false);
    // 名字紧贴标签渲染：label 的前后空格是它的一部分，不能被模板空白冲掉或多垫一层
    const labels = rootOf(fixture).querySelectorAll('[data-testid="wt-worktree-label-text"]');
    expect([...labels].map(label => label.textContent)).toEqual(['main', 'feature/x', ' spaced ']);
  });

  it('列表读取失败：role=alert 的警示条顶替列表，Retry 发 retry，新建按钮禁用', async () => {
    const fixture = await render();
    fixture.componentInstance.listError.set("Couldn't load worktrees. boom");
    await openMenu(fixture);

    const block = byTestId(fixture, 'wt-worktree-list-error');
    expect(block.getAttribute('role')).toBe('alert');
    expect(block.textContent).toContain("Couldn't load worktrees. boom");
    expect(byTestId(fixture, 'wt-worktree-menu-popup').querySelector('ul')).toBeNull();
    expect(buttonsByTestId(fixture, 'wt-worktree-create')[0].disabled).toBe(true);

    byTestId(fixture, 'wt-worktree-list-retry').click();
    expect(fixture.componentInstance.onRetry).toHaveBeenCalledTimes(1);
  });

  it('忙时新建、每个行按钮、行操作与 Create 都禁用，回车也不发 confirm', async () => {
    const fixture = await render();
    fixture.componentInstance.busy.set(true);
    await openMenu(fixture);

    expect(buttonsByTestId(fixture, 'wt-worktree-create')[0].disabled).toBe(true);
    expect(buttonsByTestId(fixture, 'wt-worktree-item').every(row => row.disabled)).toBe(true);
    expect(buttonsByTestId(fixture, 'row-action').every(button => button.disabled)).toBe(true);

    fixture.componentInstance.createOpen.set(true);
    await fixture.whenStable();
    expect(buttonsByTestId(fixture, 'wt-worktree-create-confirm')[0].disabled).toBe(true);
    byTestId(fixture, 'create-input').dispatchEvent(keydown({ key: 'Enter' }));
    expect(fixture.componentInstance.onConfirm).not.toHaveBeenCalled();
  });

  it('回车只在文本框里、且不在组字时提交', async () => {
    const fixture = await render();
    fixture.componentInstance.createOpen.set(true);
    await fixture.whenStable();
    const input = byTestId(fixture, 'create-input');

    input.dispatchEvent(keydown({ key: 'Enter', isComposing: true }));
    // Safari：提交组字的那一下回车报 isComposing=false、keyCode 229
    input.dispatchEvent(keydown({ key: 'Enter', keyCode: 229 }));
    // 按钮上的回车自带一次原生 click，这里再提交就是两次；单选框上的回车不该提交
    byTestId(fixture, 'wt-worktree-create-confirm').dispatchEvent(keydown({ key: 'Enter' }));
    byTestId(fixture, 'create-radio').dispatchEvent(keydown({ key: 'Enter' }));
    expect(fixture.componentInstance.onConfirm).not.toHaveBeenCalled();

    input.dispatchEvent(keydown({ key: 'Enter' }));
    expect(fixture.componentInstance.onConfirm).toHaveBeenCalledTimes(1);
  });

  it('document 级 Escape：组字中不关，否则一次收起所有层', async () => {
    const fixture = await render();
    await openMenu(fixture);

    document.dispatchEvent(keydown({ key: 'Escape', isComposing: true }));
    await fixture.whenStable();
    expect(queryTestId(fixture, 'wt-worktree-menu-popup')).not.toBeNull();

    document.dispatchEvent(keydown({ key: 'Escape' }));
    await fixture.whenStable();
    expect(queryTestId(fixture, 'wt-worktree-menu-popup')).toBeNull();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
  });

  it('筛选在打开列表时清空；筛空时显示 no-match 行', async () => {
    const fixture = await render();
    await openMenu(fixture);
    const filter = rootOf(fixture).querySelector<HTMLInputElement>('input[aria-label="Filter worktrees"]');
    if (filter === null) throw new Error('找不到筛选框');
    filter.value = 'zzz';
    filter.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(buttonsByTestId(fixture, 'wt-worktree-item')).toHaveLength(0);
    expect(byTestId(fixture, 'wt-worktree-menu-popup').textContent).toContain('No matching worktrees');

    document.dispatchEvent(keydown({ key: 'Escape' }));
    await fixture.whenStable();
    await openMenu(fixture);
    expect(buttonsByTestId(fixture, 'wt-worktree-item')).toHaveLength(3);
  });

  it('点非当前行发 selectItem；点当前行只收起菜单', async () => {
    const fixture = await render();
    await openMenu(fixture);
    const [active, other] = buttonsByTestId(fixture, 'wt-worktree-item');

    other.click();
    expect(fixture.componentInstance.onSelect).toHaveBeenCalledWith({ id: 'feature/x', active: false });

    active.click();
    await fixture.whenStable();
    expect(queryTestId(fixture, 'wt-worktree-menu-popup')).toBeNull();
    expect(fixture.componentInstance.onSelect).toHaveBeenCalledTimes(1);
  });

  it('进创建弹层：先发 createOpening（此刻弹层还没开），渲染后焦点落在 [data-autofocus] 上', async () => {
    const fixture = await render();
    await openMenu(fixture);
    byTestId(fixture, 'wt-worktree-create').click();
    await fixture.whenStable();

    expect(fixture.componentInstance.createOpenAtOpening).toEqual([false]);
    expect(queryTestId(fixture, 'wt-worktree-menu-popup')).toBeNull();
    const popover = byTestId(fixture, 'wt-worktree-create-popover');
    expect(popover.getAttribute('role')).toBe('dialog');
    expect(popover.hasAttribute('aria-modal')).toBe(false);
    expect(document.activeElement).toBe(byTestId(fixture, 'create-input'));
  });
});

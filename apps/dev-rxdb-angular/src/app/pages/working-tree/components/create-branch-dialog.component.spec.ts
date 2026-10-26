import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkingTreeCreateBranchDialogComponent, type CreateBranchDialogState } from './create-branch-dialog.component';

/**
 * @fileoverview 「Create a branch」对话框（GitHub Desktop 的 `create-branch-dialog.tsx`）：History 右键从提交建，
 * 分支下拉的 New branch 从当前分支 HEAD 建，两处共用。React / Vue 端有同名 spec。
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

const FROM_COMMIT: CreateBranchDialogState = {
  base: { commitId: '0123456789abcdef', summary: 'Add todos' },
  from: 'commit',
  availability: 'ok'
};

interface DialogInputs {
  readonly dialog?: CreateBranchDialogState;
  readonly activeBranch?: string;
  readonly name?: string;
  readonly error?: string | null;
  readonly creating?: boolean;
}

/** 搭一个开着的对话框；组件交出来的事件记在 `events` 里。 */
const createDialog = async (inputs: DialogInputs = {}) => {
  const fixture = TestBed.createComponent(WorkingTreeCreateBranchDialogComponent);
  const events = { confirmed: [] as string[], closed: 0 };
  fixture.componentInstance.confirmRequested.subscribe(name => events.confirmed.push(name));
  fixture.componentInstance.closeRequested.subscribe(() => events.closed++);
  fixture.componentRef.setInput('dialog', inputs.dialog ?? FROM_COMMIT);
  fixture.componentRef.setInput('activeBranch', inputs.activeBranch ?? 'main');
  fixture.componentRef.setInput('name', inputs.name ?? '');
  fixture.componentRef.setInput('error', inputs.error ?? null);
  fixture.componentRef.setInput('creating', inputs.creating ?? false);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, events };
};

const confirmButton = (fixture: ComponentFixture<unknown>): HTMLButtonElement =>
  get(fixture, '[data-testid="wt-create-branch-confirm"]') as HTMLButtonElement;

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [WorkingTreeCreateBranchDialogComponent] }).compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('WorkingTreeCreateBranchDialogComponent', () => {
  it('关着时什么都不画', async () => {
    const fixture = TestBed.createComponent(WorkingTreeCreateBranchDialogComponent);
    fixture.componentRef.setInput('activeBranch', 'main');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(find(fixture, '[data-testid="wt-create-branch-dialog"]')).toBeNull();
  });

  it('基于提交：以标题命名，名字框有可读名，写明基于哪个提交', async () => {
    const { fixture } = await createDialog();

    const dialog = get(fixture, '[data-testid="wt-create-branch-dialog"]');
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title === null ? '' : textOf(title)).toBe('Create a branch');
    const input = get(fixture, '[data-testid="wt-create-branch-name"]') as HTMLInputElement;
    expect(input.labels?.[0] === undefined ? '' : textOf(input.labels[0])).toBe('Name');
    expect(textOf(get(fixture, '[data-testid="wt-create-branch-base"]'))).toBe(
      "Your new branch will be based on the commit 'Add todos' (0123456) from your repository."
    );
  });

  it('基于当前分支：写明是当前分支；在默认分支上补一句它是默认分支', async () => {
    const fromBranch: CreateBranchDialogState = { ...FROM_COMMIT, from: 'branch' };
    const onMain = await createDialog({ dialog: fromBranch, activeBranch: 'main' });
    expect(textOf(get(onMain.fixture, '[data-testid="wt-create-branch-base"]'))).toBe(
      'Your new branch will be based on your currently checked out branch (main). main is the default branch for your repository.'
    );

    const onFeature = await createDialog({ dialog: fromBranch, activeBranch: 'feature/x' });
    expect(textOf(get(onFeature.fixture, '[data-testid="wt-create-branch-base"]'))).toBe(
      'Your new branch will be based on your currently checked out branch (feature/x).'
    );
  });

  it('名字为空或全是空白：Create 置灰；有名字时点 Create 交出去掉首尾空白的名字', async () => {
    const empty = await createDialog({ name: '   ' });
    expect(confirmButton(empty.fixture).disabled).toBe(true);

    const { fixture, events } = await createDialog({ name: '  feature/y ' });
    expect(confirmButton(fixture).disabled).toBe(false);
    confirmButton(fixture).click();
    expect(events.confirmed).toEqual(['feature/y']);
  });

  it('名字框里回车提交；输入法组字中的回车不提交', async () => {
    const { fixture, events } = await createDialog({ name: 'feature/y' });
    const input = get(fixture, '[data-testid="wt-create-branch-name"]');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    expect(events.confirmed).toEqual([]);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(events.confirmed).toEqual(['feature/y']);
  });

  it('预检还没回来：写着在检查，Create 置灰', async () => {
    const { fixture } = await createDialog({ dialog: { ...FROM_COMMIT, availability: 'checking' }, name: 'y' });

    expect(textOf(get(fixture, '[data-testid="wt-create-branch-checking"]'))).toBe('Checking this commit…');
    expect(confirmButton(fixture).disabled).toBe(true);
  });

  it('预检被拒：以 alert 写明原因，Create 置灰', async () => {
    const { fixture } = await createDialog({
      dialog: { ...FROM_COMMIT, availability: 'history_rewritten' },
      name: 'y'
    });

    const reason = get(fixture, '[data-testid="wt-create-branch-unavailable"]');
    expect(reason.getAttribute('role')).toBe('alert');
    expect(textOf(reason)).toBe(
      'Changes in this commit were undone or redone after it was made, so a branch based on it would not match it.'
    );
    expect(confirmButton(fixture).disabled).toBe(true);
  });

  it('建分支报错：以 alert 写出来；进行中按钮置灰、写着 Creating…', async () => {
    const failed = await createDialog({ name: 'main', error: 'Branch id (main) already exists' });
    const error = get(failed.fixture, '[data-testid="wt-create-branch-error"]');
    expect([error.getAttribute('role'), textOf(error)]).toEqual(['alert', 'Branch id (main) already exists']);

    const creating = await createDialog({ name: 'y', creating: true });
    expect([confirmButton(creating.fixture).disabled, textOf(confirmButton(creating.fixture))]).toEqual([
      true,
      'Creating…'
    ]);
  });

  it('建分支进行中关不掉：Cancel 置灰，Escape 与点背板都不理', async () => {
    const { fixture, events } = await createDialog({ name: 'y', creating: true });

    expect((get(fixture, '[data-testid="wt-create-branch-cancel"]') as HTMLButtonElement).disabled).toBe(true);
    get(fixture, '[data-testid="wt-create-branch-dialog"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    get(fixture, '[aria-label="Close dialog"]').click();
    expect(events.closed).toBe(0);
  });

  it('名字框里组字中的 Escape 是输入法在取消候选词，不关对话框', async () => {
    const { fixture, events } = await createDialog({ name: 'feature/y' });
    const input = get(fixture, '[data-testid="wt-create-branch-name"]');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }));
    expect(events.closed).toBe(0);
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(events.closed).toBe(1);
  });

  it('Cancel 与 Escape 都请求关闭', async () => {
    const { fixture, events } = await createDialog();

    get(fixture, '[data-testid="wt-create-branch-cancel"]').click();
    get(fixture, '[data-testid="wt-create-branch-dialog"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
    );
    expect(events.closed).toBe(2);
  });
});

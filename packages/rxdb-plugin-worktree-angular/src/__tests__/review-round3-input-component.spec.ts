import { provideRxDB, useRxDB } from '@aiao/rxdb-angular';
import type { WorktreeDiff, WorktreeStatus } from '@aiao/rxdb-plugin-worktree';
import { createWorktreeHookStubs, deferred, diffWith, statusWith } from '@aiao/rxdb-plugin-worktree/testing';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  provideZonelessChangeDetection,
  reflectComponentType,
  signal
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it } from 'vitest';
import { useWorktree } from '../index.js';

// 组件经 vite.config.mts 里的 analog 插件编译，input.required() 带真实输入元数据；
// 此前包里缺这个插件，只能靠提交 ngc 产物绕过，现已不需要。
@Component({
  selector: 'r3-required-worktree-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span data-testid="branch">{{ branchId() }}</span>
    <span data-testid="phase">{{ tree.statusState().phase }}</span>
    <span data-testid="switch-phase">{{ tree.switchBranchState().phase }}</span>
    @let state = tree.statusState();
    @if (state.phase === 'empty' || state.phase === 'success') {
      <span data-testid="status-branch">{{ state.value.branchId }}</span>
    }
    <button (click)="selectBranch()" data-testid="switch">切分支</button>
  `
})
class RequiredWorktreePanel {
  readonly branchId = input.required<string>();
  readonly database = useRxDB();
  readonly tree = useWorktree();
  lastSwitch?: Promise<void>;

  selectBranch(): Promise<void> {
    this.lastSwitch = this.tree.switchBranch(this.branchId());
    return this.lastSwitch;
  }
}

@Component({
  selector: 'r3-worktree-parent',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RequiredWorktreePanel],
  template: `<r3-required-worktree-panel [branchId]="branchId()" />`
})
class WorktreeInputParent {
  readonly branchId = signal('main');
}

const rootElement = (element: unknown): HTMLElement => {
  if (!(element instanceof HTMLElement)) throw new Error('组件没有真实 DOM 根节点');
  return element;
};

const text = (element: unknown, name: string): string | null =>
  rootElement(element).querySelector(`[data-testid="${name}"]`)?.textContent ?? null;

const panelOf = (fixture: ComponentFixture<WorktreeInputParent>): RequiredWorktreePanel => {
  const element = fixture.debugElement.query(By.directive(RequiredWorktreePanel));
  if (!element) throw new Error('父模板没有挂载工作树子组件');
  return element.injector.get(RequiredWorktreePanel);
};

const clickSwitch = (element: unknown): void => {
  const button = rootElement(element).querySelector<HTMLButtonElement>('[data-testid="switch"]');
  if (!button) throw new Error('父模板没有切分支按钮');
  button.click();
};

const configure = () => {
  const stubs = createWorktreeHookStubs();
  TestBed.configureTestingModule({
    imports: [RequiredWorktreePanel, WorktreeInputParent],
    providers: [provideZonelessChangeDetection(), provideRxDB(stubs.rxdb)],
    errorOnUnknownProperties: true
  });
  return stubs;
};

const mountParent = () => {
  const stubs = configure();
  const fixture = TestBed.createComponent(WorktreeInputParent);
  fixture.detectChanges();
  return { ...stubs, fixture, panel: panelOf(fixture) };
};

const branchStatus = (branchId: string): WorktreeStatus => ({ ...statusWith(0), branchId });

const branchDiff = (branchId: string): WorktreeDiff => ({ ...diffWith(1), branchId });

afterEach(() => TestBed.resetTestingModule());

describe('R3-04 required signal 输入与真实父模板归属', () => {
  it('真实编译的 required 输入未绑定时抛 NG0950，不伪造默认分支', () => {
    const { worktree, versionManager } = configure();
    const fixture = TestBed.createComponent(RequiredWorktreePanel);
    try {
      expect(() => fixture.detectChanges()).toThrow(/NG0950/);
      expect(worktree.status).not.toHaveBeenCalled();
      expect(worktree.enable).not.toHaveBeenCalled();
      expect(versionManager.switchBranch).not.toHaveBeenCalled();
    } finally {
      fixture.destroy();
    }
  });

  it('输入元数据真实编译后，同一个 setInput API 能更新 signal 与 OnPush DOM', async () => {
    const { worktree, versionManager } = configure();
    const fixture = TestBed.createComponent(RequiredWorktreePanel);
    expect(reflectComponentType(RequiredWorktreePanel)?.inputs).toEqual([
      expect.objectContaining({ propName: 'branchId', templateName: 'branchId', isSignal: true })
    ]);
    fixture.componentRef.setInput('branchId', 'main');
    fixture.detectChanges();
    expect(text(fixture.nativeElement, 'branch')).toBe('main');
    fixture.componentRef.setInput('branchId', 'feature');
    await fixture.whenStable();
    expect(fixture.componentInstance.branchId()).toBe('feature');
    expect(text(fixture.nativeElement, 'branch')).toBe('feature');
    expect(worktree.status).not.toHaveBeenCalled();
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
  });

  it('父模板首帧绑定 required signal，真实 provider 与 hook 创建都不发 IO', () => {
    const { rxdb, worktree, versionManager, fixture, panel } = mountParent();
    expect(panel.branchId()).toBe('main');
    expect(text(fixture.nativeElement, 'branch')).toBe('main');
    expect(panel.database).toBe(rxdb);
    expect(text(fixture.nativeElement, 'phase')).toBe('idle');
    expect(text(fixture.nativeElement, 'switch-phase')).toBe('idle');
    expect(worktree.status).not.toHaveBeenCalled();
    expect(worktree.diff).not.toHaveBeenCalled();
    expect(worktree.enable).not.toHaveBeenCalled();
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
  });

  it('父 signal 来回更新真实输入和 DOM，不切库、不切分支、不重算旧 diff', async () => {
    const { rxdb, worktree, versionManager, fixture, panel } = mountParent();
    worktree.diff.mockResolvedValue(branchDiff('main'));
    await panel.tree.diff();
    await fixture.whenStable();
    const before = panel.tree.diffState();
    fixture.componentInstance.branchId.set('feature');
    await fixture.whenStable();
    expect(panel.branchId()).toBe('feature');
    expect(text(fixture.nativeElement, 'branch')).toBe('feature');
    expect(panel.tree.diffState()).toBe(before);
    expect(panel.database).toBe(rxdb);
    fixture.componentInstance.branchId.set('main');
    await fixture.whenStable();
    expect(panel.branchId()).toBe('main');
    expect(text(fixture.nativeElement, 'branch')).toBe('main');
    expect(panel.tree.diffState()).toBe(before);
    expect(worktree.diff).toHaveBeenCalledTimes(1);
    expect(worktree.status).not.toHaveBeenCalled();
    expect(worktree.enable).not.toHaveBeenCalled();
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
  });

  it('真实模板点击把当前 required 输入送给命令，pending 与成功后的 status 自动刷新 DOM', async () => {
    const { worktree, versionManager, fixture, panel } = mountParent();
    const pending = deferred<void>();
    versionManager.switchBranch.mockReturnValueOnce(pending.promise);
    worktree.status.mockResolvedValue(branchStatus('feature'));
    fixture.componentInstance.branchId.set('feature');
    await fixture.whenStable();
    clickSwitch(fixture.nativeElement);
    const running = panel.lastSwitch;
    expect(running).toBeInstanceOf(Promise);
    await fixture.whenStable();
    expect(versionManager.switchBranch).toHaveBeenCalledTimes(1);
    expect(versionManager.switchBranch).toHaveBeenCalledWith('feature', undefined);
    expect(text(fixture.nativeElement, 'switch-phase')).toBe('loading');
    expect(text(fixture.nativeElement, 'phase')).toBe('idle');
    expect(worktree.status).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await running;
    await fixture.whenStable();
    expect(text(fixture.nativeElement, 'branch')).toBe('feature');
    expect(text(fixture.nativeElement, 'switch-phase')).toBe('success');
    expect(text(fixture.nativeElement, 'phase')).toBe('empty');
    expect(text(fixture.nativeElement, 'status-branch')).toBe('feature');
    expect(worktree.status).toHaveBeenCalledTimes(1);
    expect(panel.tree.statusState()).toEqual({ phase: 'empty', value: branchStatus('feature') });
  });

  it('真实事件中的拒绝仍归调用方，错误 signal 刷新 DOM 且不假装已切分支', async () => {
    const { worktree, versionManager, fixture, panel } = mountParent();
    await panel.tree.status();
    await fixture.whenStable();
    const before = panel.tree.statusState();
    const pending = deferred<void>();
    const failure = new Error('切分支被拒');
    versionManager.switchBranch.mockReturnValueOnce(pending.promise);
    fixture.componentInstance.branchId.set('feature');
    await fixture.whenStable();
    clickSwitch(fixture.nativeElement);
    expect(panel.lastSwitch).toBeInstanceOf(Promise);
    const observed = expect(panel.lastSwitch).rejects.toBe(failure);
    pending.reject(failure);
    await observed;
    await fixture.whenStable();
    expect(versionManager.switchBranch).toHaveBeenCalledWith('feature', undefined);
    expect(text(fixture.nativeElement, 'branch')).toBe('feature');
    expect(text(fixture.nativeElement, 'switch-phase')).toBe('error');
    expect(text(fixture.nativeElement, 'status-branch')).toBe('main');
    expect(panel.tree.switchBranchState()).toEqual({ phase: 'error', error: failure });
    expect(panel.tree.statusState()).toBe(before);
    expect(worktree.status).toHaveBeenCalledTimes(1);
  });
});

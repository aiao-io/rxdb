import { provideRxDB, useRxDB } from '@aiao/rxdb-angular';
import type { WorkingTreeDiff, WorkingTreeStatus } from '@aiao/rxdb-plugin-working-tree';
import { createWorkingTreeHookStubs, deferred, diffWith, statusWith } from '@aiao/rxdb-plugin-working-tree/testing';
import {
  ChangeDetectionStrategy,
  Component,
  input,
  provideZonelessChangeDetection,
  reflectComponentType
} from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkingTree } from '../index.js';

type InputFixtureModule =
  typeof import('../../../../requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/compiled/input-fixture.js');
type RequiredPanelInstance = InstanceType<InputFixtureModule['RequiredWorkingTreePanel']>;
type InputParentInstance = InstanceType<InputFixtureModule['WorkingTreeInputParent']>;

const { RequiredWorkingTreePanel, RXDB_ENTRY, WORKING_TREE_ENTRY, WorkingTreeInputParent } =
  await vi.importActual<InputFixtureModule>(
    '../../../../requirements/reviews/evidence/2026-10-05/parallel-round3/working-tree-input/compiled/input-fixture.js'
  );

@Component({
  selector: 'r3-untransformed-plain-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span data-testid="branch">{{ branchId() }}</span>`
})
class UntransformedPlainPanel {
  readonly branchId = input('main');
}

@Component({
  selector: 'r3-untransformed-working-tree-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span data-testid="branch">{{ branchId() }}</span>`
})
class UntransformedWorkingTreePanel {
  readonly branchId = input('main');
  readonly tree = useWorkingTree();
}

const rootElement = (element: unknown): HTMLElement => {
  if (!(element instanceof HTMLElement)) throw new Error('组件没有真实 DOM 根节点');
  return element;
};

const text = (element: unknown, name: string): string | null =>
  rootElement(element).querySelector(`[data-testid="${name}"]`)?.textContent ?? null;

const panelOf = (fixture: ComponentFixture<InputParentInstance>): RequiredPanelInstance => {
  const element = fixture.debugElement.query(By.directive(RequiredWorkingTreePanel));
  if (!element) throw new Error('父模板没有挂载工作树子组件');
  return element.injector.get(RequiredWorkingTreePanel);
};

const clickSwitch = (element: unknown): void => {
  const button = rootElement(element).querySelector<HTMLButtonElement>('[data-testid="switch"]');
  if (!button) throw new Error('父模板没有切分支按钮');
  button.click();
};

const configure = () => {
  const stubs = createWorkingTreeHookStubs();
  TestBed.configureTestingModule({
    imports: [RequiredWorkingTreePanel, WorkingTreeInputParent],
    providers: [
      provideZonelessChangeDetection(),
      provideRxDB(stubs.rxdb),
      { provide: RXDB_ENTRY, useValue: useRxDB },
      { provide: WORKING_TREE_ENTRY, useValue: useWorkingTree }
    ],
    errorOnUnknownProperties: true
  });
  return stubs;
};

const mountParent = () => {
  const stubs = configure();
  const fixture = TestBed.createComponent(WorkingTreeInputParent);
  fixture.detectChanges();
  return { ...stubs, fixture, panel: panelOf(fixture) };
};

const branchStatus = (branchId: string): WorkingTreeStatus => ({ ...statusWith(0), branchId });

const branchDiff = (branchId: string): WorkingTreeDiff => ({ ...diffWith(1), branchId });

afterEach(() => {
  const { assertionCalls, currentTestName } = expect.getState();
  console.info('R3_ASSERTIONS', JSON.stringify({ currentTestName, assertionCalls }));
  TestBed.resetTestingModule();
});

describe('R3-04 required signal 输入与真实父模板归属', () => {
  it.each([
    { name: '纯 Angular 组件', component: UntransformedPlainPanel },
    { name: '真实 useWorkingTree 组件', component: UntransformedWorkingTreePanel }
  ])('$name 未经 Angular 输入变换时复现 NG0303 与旧 DOM', ({ component }) => {
    const stubs = createWorkingTreeHookStubs();
    TestBed.configureTestingModule({
      imports: [component],
      providers: [provideZonelessChangeDetection(), provideRxDB(stubs.rxdb)]
    });
    const fixture = TestBed.createComponent(component);
    fixture.detectChanges();
    expect(reflectComponentType(component)?.inputs).toEqual([]);
    expect(text(fixture.nativeElement, 'branch')).toBe('main');
    const error = vi.spyOn(console, 'error');
    try {
      fixture.componentRef.setInput('branchId', 'feature');
      fixture.detectChanges();
      expect(error).toHaveBeenCalledTimes(1);
      expect(error).toHaveBeenCalledWith(expect.stringContaining('NG0303'));
      expect(fixture.componentInstance.branchId()).toBe('main');
      expect(text(fixture.nativeElement, 'branch')).toBe('main');
      expect(stubs.versionManager.switchBranch).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });

  it('真实编译的 required 输入未绑定时抛 NG0950，不伪造默认分支', () => {
    const { workingTree, versionManager } = configure();
    const fixture = TestBed.createComponent(RequiredWorkingTreePanel);
    try {
      expect(() => fixture.detectChanges()).toThrow(/NG0950/);
      expect(workingTree.status).not.toHaveBeenCalled();
      expect(workingTree.enable).not.toHaveBeenCalled();
      expect(versionManager.switchBranch).not.toHaveBeenCalled();
    } finally {
      fixture.destroy();
    }
  });

  it('输入元数据真实编译后，同一个 setInput API 能更新 signal 与 OnPush DOM', async () => {
    const { workingTree, versionManager } = configure();
    const fixture = TestBed.createComponent(RequiredWorkingTreePanel);
    expect(reflectComponentType(RequiredWorkingTreePanel)?.inputs).toEqual([
      expect.objectContaining({ propName: 'branchId', templateName: 'branchId', isSignal: true })
    ]);
    fixture.componentRef.setInput('branchId', 'main');
    fixture.detectChanges();
    expect(text(fixture.nativeElement, 'branch')).toBe('main');
    fixture.componentRef.setInput('branchId', 'feature');
    await fixture.whenStable();
    expect(fixture.componentInstance.branchId()).toBe('feature');
    expect(text(fixture.nativeElement, 'branch')).toBe('feature');
    expect(workingTree.status).not.toHaveBeenCalled();
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
  });

  it('父模板首帧绑定 required signal，真实 provider 与 hook 创建都不发 IO', () => {
    const { rxdb, workingTree, versionManager, fixture, panel } = mountParent();
    expect(panel.branchId()).toBe('main');
    expect(text(fixture.nativeElement, 'branch')).toBe('main');
    expect(panel.database).toBe(rxdb);
    expect(TestBed.inject(RXDB_ENTRY)).toBe(useRxDB);
    expect(TestBed.inject(WORKING_TREE_ENTRY)).toBe(useWorkingTree);
    expect(text(fixture.nativeElement, 'phase')).toBe('idle');
    expect(text(fixture.nativeElement, 'switch-phase')).toBe('idle');
    expect(workingTree.status).not.toHaveBeenCalled();
    expect(workingTree.diff).not.toHaveBeenCalled();
    expect(workingTree.enable).not.toHaveBeenCalled();
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
  });

  it('父 signal 来回更新真实输入和 DOM，不切库、不切分支、不重算旧 diff', async () => {
    const { rxdb, workingTree, versionManager, fixture, panel } = mountParent();
    workingTree.diff.mockResolvedValue(branchDiff('main'));
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
    expect(workingTree.diff).toHaveBeenCalledTimes(1);
    expect(workingTree.status).not.toHaveBeenCalled();
    expect(workingTree.enable).not.toHaveBeenCalled();
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
  });

  it('真实模板点击把当前 required 输入送给命令，pending 与成功后的 status 自动刷新 DOM', async () => {
    const { workingTree, versionManager, fixture, panel } = mountParent();
    const pending = deferred<void>();
    versionManager.switchBranch.mockReturnValueOnce(pending.promise);
    workingTree.status.mockResolvedValue(branchStatus('feature'));
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
    expect(workingTree.status).not.toHaveBeenCalled();
    pending.resolve(undefined);
    await running;
    await fixture.whenStable();
    expect(text(fixture.nativeElement, 'branch')).toBe('feature');
    expect(text(fixture.nativeElement, 'switch-phase')).toBe('success');
    expect(text(fixture.nativeElement, 'phase')).toBe('empty');
    expect(text(fixture.nativeElement, 'status-branch')).toBe('feature');
    expect(workingTree.status).toHaveBeenCalledTimes(1);
    expect(panel.tree.statusState()).toEqual({ phase: 'empty', value: branchStatus('feature') });
  });

  it('真实事件中的拒绝仍归调用方，错误 signal 刷新 DOM 且不假装已切分支', async () => {
    const { workingTree, versionManager, fixture, panel } = mountParent();
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
    expect(workingTree.status).toHaveBeenCalledTimes(1);
  });
});

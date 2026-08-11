import { RxDB, RxDBBranch } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchManager } from './branch-manager';

const angularMocks = vi.hoisted(() => ({ useFindAll: vi.fn() }));

vi.mock('@aiao/rxdb-angular', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb-angular')>();
  return { ...actual, useFindAll: angularMocks.useFindAll };
});

function createResource<T>(value: T) {
  return {
    error: signal<Error | undefined>(undefined),
    hasValue: signal(true),
    isEmpty: signal(Array.isArray(value) ? value.length === 0 : value == null),
    isLoading: signal(false),
    value: signal(value)
  };
}

function createDeferred() {
  let resolvePromise: (() => void) | undefined;
  let rejectPromise: ((reason: unknown) => void) | undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    reject: (reason: unknown) => rejectPromise!(reason),
    resolve: () => resolvePromise!()
  };
}

function getCreateButton(fixture: ComponentFixture<BranchManager>): HTMLButtonElement {
  const button = fixture.nativeElement.querySelector('button[title="创建分支"]') as HTMLButtonElement | null;
  if (!button) throw new Error('Missing create branch button');
  return button;
}

function getBranchSelect(fixture: ComponentFixture<BranchManager>): HTMLSelectElement {
  const select = fixture.nativeElement.querySelector('select') as HTMLSelectElement | null;
  if (!select) throw new Error('Missing branch select');
  return select;
}

function renderBranchManager(
  options: {
    createBranch?: (name: string) => Promise<unknown>;
    switchBranch?: (name: string) => Promise<unknown>;
  } = {}
) {
  const createBranch = vi.fn(options.createBranch ?? (() => Promise.resolve()));
  const switchBranch = vi.fn(options.switchBranch ?? (() => Promise.resolve()));
  angularMocks.useFindAll.mockReturnValue(createResource([{ activated: true, id: 'main' }] as RxDBBranch[]));
  TestBed.configureTestingModule({
    imports: [BranchManager],
    providers: [
      {
        provide: RxDB,
        useValue: { versionManager: { createBranch, switchBranch } }
      }
    ]
  });
  const fixture = TestBed.createComponent(BranchManager);
  fixture.detectChanges();
  return { createBranch, fixture, switchBranch };
}

describe('BranchManager actions', () => {
  beforeEach(() => angularMocks.useFindAll.mockReset());

  it('disables branch actions until creation succeeds', async () => {
    const operation = createDeferred();
    const { createBranch, fixture } = renderBranchManager({ createBranch: () => operation.promise });
    const component = fixture.componentInstance;
    component.$branchName.set(' feature ');
    component.$showPopover.set(true);

    const pending = component.createBranch(component.$branchName());
    fixture.detectChanges();

    expect(createBranch).toHaveBeenCalledWith('feature');
    expect(getCreateButton(fixture).disabled).toBe(true);

    operation.resolve();
    await pending;
    fixture.detectChanges();

    expect(getCreateButton(fixture).disabled).toBe(false);
    expect(component.$branchName()).toBe('');
    expect(component.$showPopover()).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('keeps failed creation editable and renders its error', async () => {
    const { fixture } = renderBranchManager({
      createBranch: () => Promise.reject(new Error('duplicate branch'))
    });
    const component = fixture.componentInstance;
    component.$branchName.set('feature');
    component.$showPopover.set(true);

    await component.createBranch(component.$branchName());
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(alert?.textContent).toContain('创建分支失败：duplicate branch');
    expect(getCreateButton(fixture).disabled).toBe(false);
    expect(component.$branchName()).toBe('feature');
    expect(component.$showPopover()).toBe(true);
  });

  it('disables branch selection until a successful switch settles', async () => {
    const operation = createDeferred();
    const { fixture, switchBranch } = renderBranchManager({ switchBranch: () => operation.promise });

    const pending = fixture.componentInstance.switchBranch('feature');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(switchBranch).toHaveBeenCalledWith('feature');
    expect(fixture.componentInstance.$switching()).toBe(true);
    expect(getBranchSelect(fixture).disabled).toBe(true);

    operation.resolve();
    await pending;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(getBranchSelect(fixture).disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a rejected branch switch and restores selection', async () => {
    const { fixture, switchBranch } = renderBranchManager({
      switchBranch: () => Promise.reject(new Error('switch conflict'))
    });

    await fixture.componentInstance.switchBranch('feature');
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(switchBranch).toHaveBeenCalledWith('feature');
    expect(alert?.textContent).toContain('切换分支失败：switch conflict');
    expect(getBranchSelect(fixture).disabled).toBe(false);
  });
});

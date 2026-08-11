import { RxDB } from '@aiao/rxdb';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { AsyncPipe } from '@angular/common';
import { NO_ERRORS_SCHEMA, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { LucideDynamicIcon } from '@lucide/angular';
import { of } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RemoteSyncState } from '../remote-sync-state';
import TodoPage from './todo.page';
import todoPageTemplate from './todo.page.html?raw';

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

function getButton(fixture: ComponentFixture<TodoPage>, label: string): HTMLButtonElement {
  const button = fixture.nativeElement.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  if (!button) throw new Error(`Missing ${label} button`);
  return button;
}

function renderTodoPage(
  options: {
    connected?: boolean;
    pull?: () => Promise<unknown>;
    push?: () => Promise<unknown>;
  } = {}
) {
  const history = {
    histories$: of([]),
    redo: vi.fn(),
    redoCount$: of(0),
    type: 'entity' as const,
    undo: vi.fn(),
    undoCount$: of(0)
  };
  const pull = vi.fn(options.pull ?? (() => Promise.resolve()));
  const push = vi.fn(options.push ?? (() => Promise.resolve()));
  const rxdb = {
    entityManager: {
      removeMany: vi.fn(() => Promise.resolve()),
      saveMany: vi.fn(() => Promise.resolve())
    },
    versionManager: {
      history: vi.fn(() => history),
      pull,
      pullableCount$: of(1),
      push,
      pushableCount$: of(1)
    }
  };
  const remoteSync = new RemoteSyncState();
  remoteSync.markConnected(options.connected ?? false);
  angularMocks.useFindAll.mockReturnValue(createResource([]));
  TestBed.overrideComponent(TodoPage, {
    set: {
      imports: [AsyncPipe, FormsModule, LucideDynamicIcon, ScrollingModule],
      schemas: [NO_ERRORS_SCHEMA],
      styleUrls: [],
      styles: [],
      template: todoPageTemplate
    }
  });
  TestBed.configureTestingModule({
    providers: [
      { provide: RxDB, useValue: rxdb },
      { provide: RemoteSyncState, useValue: remoteSync }
    ]
  });
  const fixture = TestBed.createComponent(TodoPage);
  fixture.detectChanges();
  return { fixture, pull, push };
}

describe('TodoPage remote sync controls', () => {
  beforeEach(() => angularMocks.useFindAll.mockReset());

  it('keeps Pull and Push disabled in the zero-config local demo', () => {
    const { fixture, pull, push } = renderTodoPage();

    const pullButton = getButton(fixture, 'Pull');
    const pushButton = getButton(fixture, 'Push');

    expect(pullButton.disabled).toBe(true);
    expect(pushButton.disabled).toBe(true);
    expect(pullButton.title).toContain('纯本地模式');
    pullButton.click();
    pushButton.click();
    expect(pull).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
  });

  it('disables both sync controls until a successful Push settles', async () => {
    const operation = createDeferred();
    const { fixture, push } = renderTodoPage({ connected: true, push: () => operation.promise });

    const pending = fixture.componentInstance.push();
    fixture.detectChanges();

    expect(push).toHaveBeenCalledOnce();
    expect(getButton(fixture, 'Pull').disabled).toBe(true);
    expect(getButton(fixture, 'Push').disabled).toBe(true);

    operation.resolve();
    await pending;
    fixture.detectChanges();

    expect(getButton(fixture, 'Pull').disabled).toBe(false);
    expect(getButton(fixture, 'Push').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });

  it('renders a rejected Pull and restores the controls', async () => {
    const { fixture, pull } = renderTodoPage({
      connected: true,
      pull: () => Promise.reject(new Error('remote unavailable'))
    });

    await fixture.componentInstance.pull();
    fixture.detectChanges();

    const alert = fixture.nativeElement.querySelector('[role="alert"]') as HTMLElement | null;
    expect(pull).toHaveBeenCalledOnce();
    expect(alert?.textContent).toContain('同步失败：remote unavailable');
    expect(getButton(fixture, 'Pull').disabled).toBe(false);
    expect(getButton(fixture, 'Push').disabled).toBe(false);
  });
});

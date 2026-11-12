import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SqlExecutionDialogComponent } from '../../components/sql-execution/sql-execution-dialog.component';
import { DEFAULT_TRANSLATIONS, MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { SqlExecutionPreview, SqlExecutionResult } from '../../services/sql-execution-adapter';
import { SqlExecutionService, type SqlExecutionState } from '../../services/sql-execution.service';

const SQL = 'ALTER TABLE users ADD COLUMN name text;';
const PREVIEW: SqlExecutionPreview = {
  sql: SQL,
  committed: false,
  destructive: false,
  affectedTables: ['users'],
  statementCount: 1
};
const RESULT: SqlExecutionResult = {
  sql: SQL,
  committed: true,
  affectedTables: ['users'],
  statementCount: 1
};
const DESTRUCTIVE_PREVIEW: SqlExecutionPreview = {
  sql: 'DROP TABLE users;',
  committed: false,
  destructive: true,
  affectedTables: ['users'],
  statementCount: 1
};

function configureComponent(initialState: SqlExecutionState) {
  const state = signal<SqlExecutionState>(initialState);
  const execution = {
    state,
    preflight: vi.fn().mockResolvedValue(undefined),
    execute: vi.fn().mockResolvedValue(undefined),
    retry: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn()
  };
  const close = vi.fn();
  TestBed.configureTestingModule({
    providers: [
      { provide: DIALOG_DATA, useValue: { sql: SQL } },
      { provide: DialogRef, useValue: { close } },
      { provide: SqlExecutionService, useValue: execution },
      { provide: MODEL_DESIGNER_TRANSLATIONS, useValue: signal(DEFAULT_TRANSLATIONS) }
    ]
  });
  return { execution, state, close };
}

function createComponent(initialState: SqlExecutionState = { phase: 'idle' }) {
  const context = configureComponent(initialState);
  const component = TestBed.runInInjectionContext(() => new SqlExecutionDialogComponent());
  return { component, ...context };
}

function renderComponent(initialState: SqlExecutionState) {
  const context = configureComponent(initialState);
  const fixture = TestBed.createComponent(SqlExecutionDialogComponent);
  fixture.detectChanges();
  return { component: fixture.componentInstance, fixture, ...context };
}

describe('SqlExecutionDialogComponent', () => {
  beforeEach(() => TestBed.resetTestingModule());

  it('starts preflight with the dialog SQL snapshot', () => {
    const { execution } = createComponent();
    expect(execution.preflight).toHaveBeenCalledWith(SQL);
  });

  it('renders a visible CDK dialog surface', () => {
    const { fixture } = renderComponent({ phase: 'idle' });
    const surface = fixture.nativeElement.querySelector('[data-testid="sql-execution-dialog-surface"]') as HTMLElement;

    expect(surface).not.toBeNull();
    expect(surface.classList).not.toContain('modal-box');
    expect(surface.classList).toContain('bg-base-100');
  });

  it('exposes loading, impact, error, and success states to the template', () => {
    const { component, state } = createComponent({ phase: 'preflighting', sql: SQL });
    expect(component['state']().phase).toBe('preflighting');

    state.set({ phase: 'ready', preview: PREVIEW });
    expect(component['state']()).toEqual({ phase: 'ready', preview: PREVIEW });

    state.set({ phase: 'execution-error', preview: PREVIEW, message: 'permission denied' });
    expect(component['state']().phase).toBe('execution-error');

    state.set({ phase: 'success', preview: PREVIEW, result: RESULT });
    expect(component['state']().phase).toBe('success');
  });

  it('delegates confirmation and retry to the state machine', async () => {
    const { component, execution } = createComponent({ phase: 'ready', preview: PREVIEW });
    await component.onExecute();
    await component.onRetry();
    expect(execution.execute).toHaveBeenCalledOnce();
    expect(execution.retry).toHaveBeenCalledOnce();
  });

  it('does not close while busy', () => {
    const { component, close } = createComponent({ phase: 'executing', preview: PREVIEW });
    component.onClose();
    expect(close).not.toHaveBeenCalled();
  });

  it('resets and closes from a stable state', () => {
    const { component, execution, close } = createComponent({ phase: 'success', preview: PREVIEW, result: RESULT });
    component.onClose();
    expect(execution.reset).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('shows textual destructive risk, backup guidance, affected tables, and a danger action', () => {
    const { fixture } = renderComponent({ phase: 'ready', preview: DESTRUCTIVE_PREVIEW });
    const text = fixture.nativeElement.textContent as string;
    const action = fixture.nativeElement.querySelector('[data-testid="confirm-destructive"]') as HTMLButtonElement;

    expect(text).toContain(DEFAULT_TRANSLATIONS.sqlExecution.destructiveTitle);
    expect(text).toContain(DEFAULT_TRANSLATIONS.sqlExecution.backupWarning);
    expect(text).toContain('users');
    expect(action.textContent).toContain(DEFAULT_TRANSLATIONS.sqlExecution.confirmDestructive);
    expect(action.classList).toContain('btn-error');
  });

  it('shows an unknown outcome without offering an unsafe retry', () => {
    const { fixture } = renderComponent({
      phase: 'execution-unknown',
      preview: PREVIEW,
      message: 'connection closed before the response arrived'
    });
    const text = fixture.nativeElement.textContent as string;

    expect(text).toContain(DEFAULT_TRANSLATIONS.sqlExecution.outcomeUnknown);
    expect(text).toContain(DEFAULT_TRANSLATIONS.sqlExecution.compareBeforeContinuing);
    expect(text).not.toContain(DEFAULT_TRANSLATIONS.sqlExecution.retry);
  });

  it('cancels destructive SQL without executing', () => {
    const { component, execution, close } = createComponent({ phase: 'ready', preview: DESTRUCTIVE_PREVIEW });
    component.onClose();

    expect(execution.execute).not.toHaveBeenCalled();
    expect(execution.reset).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('passes explicit confirmation once and removes the action while executing', async () => {
    const { fixture, execution, state } = renderComponent({ phase: 'ready', preview: DESTRUCTIVE_PREVIEW });
    execution.execute.mockImplementation(async () => {
      state.set({ phase: 'executing', preview: DESTRUCTIVE_PREVIEW });
    });

    const action = fixture.nativeElement.querySelector('[data-testid="confirm-destructive"]') as HTMLButtonElement;
    action.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(execution.execute).toHaveBeenCalledOnce();
    expect(execution.execute).toHaveBeenCalledWith(true);
    expect(fixture.nativeElement.querySelector('[data-testid="confirm-destructive"]')).toBeNull();
  });
});

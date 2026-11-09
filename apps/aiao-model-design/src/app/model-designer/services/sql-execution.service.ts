import { Injectable, inject, signal } from '@angular/core';
import {
  SQL_EXECUTION_ADAPTER,
  SqlExecutionOutcomeUnknownError,
  type SqlExecutionPreview,
  type SqlExecutionResult
} from './sql-execution-adapter';

/** Observable phases for one SQL preflight and execution workflow. */
export type SqlExecutionState =
  | { readonly phase: 'idle' }
  | { readonly phase: 'preflighting'; readonly sql: string }
  | { readonly phase: 'ready'; readonly preview: SqlExecutionPreview }
  | { readonly phase: 'executing'; readonly preview: SqlExecutionPreview }
  | { readonly phase: 'success'; readonly preview: SqlExecutionPreview; readonly result: SqlExecutionResult }
  | { readonly phase: 'preflight-error'; readonly sql: string; readonly message: string }
  | { readonly phase: 'execution-error'; readonly preview: SqlExecutionPreview; readonly message: string }
  | { readonly phase: 'execution-unknown'; readonly preview: SqlExecutionPreview; readonly message: string };

/** Coordinates rollback-only preflight, commit, and phase-specific retry for one designer instance. */
@Injectable()
export class SqlExecutionService {
  readonly #adapter = inject(SQL_EXECUTION_ADAPTER, { optional: true });
  readonly #state = signal<SqlExecutionState>({ phase: 'idle' });
  #operation: Promise<void> | null = null;

  /** Current execution workflow state. */
  readonly state = this.#state.asReadonly();

  /** Preflights an immutable SQL snapshot and coalesces concurrent requests. */
  preflight(sql: string): Promise<void> {
    if (this.#operation) return this.#operation;

    const snapshot = String(sql);
    if (!this.#adapter) {
      this.#state.set({ phase: 'preflight-error', sql: snapshot, message: 'SQL execution service is unavailable' });
      return Promise.resolve();
    }
    this.#state.set({ phase: 'preflighting', sql: snapshot });
    this.#operation = this.#runPreflight(snapshot);
    return this.#operation;
  }

  /** Executes a ready preview after any required destructive confirmation. */
  execute(confirmDestructive = false): Promise<void> {
    if (this.#operation) return this.#operation;

    const current = this.#state();
    if (current.phase !== 'ready') return Promise.resolve();
    if (current.preview.destructive && !confirmDestructive) return Promise.resolve();

    this.#state.set({ phase: 'executing', preview: current.preview });
    this.#operation = this.#runExecution(current.preview, current.preview.destructive);
    return this.#operation;
  }

  /** Retries only the phase that most recently failed. */
  retry(confirmDestructive = false): Promise<void> {
    void confirmDestructive;
    const current = this.#state();
    if (current.phase === 'preflight-error') return this.preflight(current.sql);
    if (current.phase === 'execution-error') return this.preflight(current.preview.sql);
    return Promise.resolve();
  }

  /** Returns a stable workflow to its initial state. */
  reset(): void {
    if (this.#operation) return;
    this.#state.set({ phase: 'idle' });
  }

  async #runPreflight(sql: string): Promise<void> {
    if (!this.#adapter) return;
    try {
      const preview = await this.#adapter.dryRun(sql);
      if (preview.sql !== sql) {
        throw new Error('SQL preflight response does not match the requested snapshot');
      }
      this.#state.set({ phase: 'ready', preview });
    } catch (error) {
      this.#state.set({ phase: 'preflight-error', sql, message: this.#message(error) });
    } finally {
      this.#operation = null;
    }
  }

  async #runExecution(preview: SqlExecutionPreview, confirmDestructive: boolean): Promise<void> {
    if (!this.#adapter) return;
    try {
      const result = await this.#adapter.execute(preview.sql, confirmDestructive);
      if (result.sql !== preview.sql) {
        throw new Error('SQL execution response does not match the preflight snapshot');
      }
      this.#state.set({ phase: 'success', preview, result });
    } catch (error) {
      const phase = error instanceof SqlExecutionOutcomeUnknownError ? 'execution-unknown' : 'execution-error';
      this.#state.set({ phase, preview, message: this.#message(error) });
    } finally {
      this.#operation = null;
    }
  }

  #message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}

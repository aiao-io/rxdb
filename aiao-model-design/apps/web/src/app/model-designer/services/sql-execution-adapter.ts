import { InjectionToken } from '@angular/core';

/** Signals that a commit request may have reached the server but its result cannot be verified. */
export class SqlExecutionOutcomeUnknownError extends Error {
  constructor(message = 'SQL execution outcome is unknown; compare the remote schema before continuing') {
    super(message);
    this.name = 'SqlExecutionOutcomeUnknownError';
  }
}

/** Rollback-only SQL preflight result returned by the server. */
export interface SqlExecutionPreview {
  readonly sql: string;
  readonly committed: false;
  readonly destructive: boolean;
  readonly affectedTables: readonly string[];
  readonly statementCount: number;
}

/** Committed SQL execution result returned by the server. */
export interface SqlExecutionResult {
  readonly sql: string;
  readonly committed: true;
  readonly affectedTables: readonly string[];
  readonly statementCount: number;
}

/** Host-provided boundary for preflighting and executing generated SQL. */
export interface SqlExecutionAdapter {
  dryRun(sql: string): Promise<SqlExecutionPreview>;
  execute(sql: string, confirmDestructive: boolean): Promise<SqlExecutionResult>;
}

/** Injection token for the host application's authenticated SQL API adapter. */
export const SQL_EXECUTION_ADAPTER = new InjectionToken<SqlExecutionAdapter>('SQL_EXECUTION_ADAPTER');

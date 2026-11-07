import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SQL_EXECUTION_ADAPTER,
  SqlExecutionOutcomeUnknownError,
  type SqlExecutionAdapter,
  type SqlExecutionPreview,
  type SqlExecutionResult
} from '../../services/sql-execution-adapter';
import { SqlExecutionService } from '../../services/sql-execution.service';

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
  sql: SQL,
  committed: false,
  destructive: true,
  affectedTables: ['users'],
  statementCount: 1
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('SqlExecutionService', () => {
  let service: SqlExecutionService;
  let adapter: {
    dryRun: ReturnType<typeof vi.fn<SqlExecutionAdapter['dryRun']>>;
    execute: ReturnType<typeof vi.fn<SqlExecutionAdapter['execute']>>;
  };

  beforeEach(() => {
    adapter = {
      dryRun: vi.fn<SqlExecutionAdapter['dryRun']>().mockResolvedValue(PREVIEW),
      execute: vi.fn<SqlExecutionAdapter['execute']>().mockResolvedValue(RESULT)
    };
    TestBed.configureTestingModule({
      providers: [
        SqlExecutionService,
        { provide: SQL_EXECUTION_ADAPTER, useValue: adapter satisfies SqlExecutionAdapter }
      ]
    });
    service = TestBed.inject(SqlExecutionService);
  });

  it('preflights an immutable SQL snapshot and becomes ready', async () => {
    const mutable = { sql: SQL };
    const operation = service.preflight(mutable.sql);
    mutable.sql = 'DROP TABLE other;';
    await operation;

    expect(adapter.dryRun).toHaveBeenCalledWith(SQL);
    expect(service.state()).toEqual({ phase: 'ready', preview: PREVIEW });
  });

  it('coalesces repeated preflight while one request is in flight', async () => {
    const pending = deferred<SqlExecutionPreview>();
    adapter.dryRun.mockReturnValue(pending.promise);

    const first = service.preflight(SQL);
    const second = service.preflight('CREATE TABLE ignored (id uuid);');
    expect(adapter.dryRun).toHaveBeenCalledTimes(1);

    pending.resolve(PREVIEW);
    await Promise.all([first, second]);
    expect(service.state()).toEqual({ phase: 'ready', preview: PREVIEW });
  });

  it('executes an ordinary preview without destructive confirmation', async () => {
    await service.preflight(SQL);
    await service.execute();

    expect(adapter.execute).toHaveBeenCalledWith(SQL, false);
    expect(service.state()).toEqual({ phase: 'success', preview: PREVIEW, result: RESULT });
  });

  it('coalesces repeated execute while one request is in flight', async () => {
    const pending = deferred<SqlExecutionResult>();
    adapter.execute.mockReturnValue(pending.promise);
    await service.preflight(SQL);

    const first = service.execute();
    const second = service.execute();
    expect(adapter.execute).toHaveBeenCalledTimes(1);

    pending.resolve(RESULT);
    await Promise.all([first, second]);
  });

  it('retains SQL after preflight failure and retries only preflight', async () => {
    adapter.dryRun.mockRejectedValueOnce(new Error('offline'));
    await service.preflight(SQL);

    expect(service.state()).toEqual({ phase: 'preflight-error', sql: SQL, message: 'offline' });
    await service.retry();
    expect(adapter.dryRun).toHaveBeenCalledTimes(2);
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(service.state()).toEqual({ phase: 'ready', preview: PREVIEW });
  });

  it('re-preflights the retained SQL before retrying a known execution failure', async () => {
    adapter.execute.mockRejectedValueOnce(new Error('permission denied'));
    await service.preflight(SQL);
    await service.execute();

    expect(service.state()).toEqual({ phase: 'execution-error', preview: PREVIEW, message: 'permission denied' });
    await service.retry();
    expect(adapter.dryRun).toHaveBeenCalledTimes(2);
    expect(adapter.execute).toHaveBeenCalledOnce();
    expect(service.state()).toEqual({ phase: 'ready', preview: PREVIEW });

    await service.execute();
    expect(adapter.execute).toHaveBeenCalledTimes(2);
    expect(service.state()).toEqual({ phase: 'success', preview: PREVIEW, result: RESULT });
  });

  it('does not retry when the execution outcome is unknown', async () => {
    adapter.execute.mockRejectedValue(
      new SqlExecutionOutcomeUnknownError('Execution outcome is unknown; compare the remote schema before continuing')
    );
    await service.preflight(SQL);
    await service.execute();

    expect(service.state()).toEqual({
      phase: 'execution-unknown',
      preview: PREVIEW,
      message: 'Execution outcome is unknown; compare the remote schema before continuing'
    });
    await service.retry();
    expect(adapter.execute).toHaveBeenCalledOnce();
  });

  it('resets completed work to idle', async () => {
    await service.preflight(SQL);
    service.reset();
    expect(service.state()).toEqual({ phase: 'idle' });
  });

  it('requires explicit confirmation when the server marks the preview destructive', async () => {
    adapter.dryRun.mockResolvedValue(DESTRUCTIVE_PREVIEW);
    await service.preflight(SQL);

    await service.execute();
    expect(adapter.execute).not.toHaveBeenCalled();
    expect(service.state()).toEqual({ phase: 'ready', preview: DESTRUCTIVE_PREVIEW });

    await service.execute(true);
    expect(adapter.execute).toHaveBeenCalledWith(SQL, true);
  });

  it('does not infer destructive risk from SQL text', async () => {
    const serverSafeDrop = { ...PREVIEW, sql: 'DROP TABLE users;' };
    const serverResult = { ...RESULT, sql: serverSafeDrop.sql };
    adapter.dryRun.mockResolvedValue(serverSafeDrop);
    adapter.execute.mockResolvedValue(serverResult);

    await service.preflight(serverSafeDrop.sql);
    await service.execute();

    expect(adapter.execute).toHaveBeenCalledWith(serverSafeDrop.sql, false);
  });

  it('coalesces repeated destructive confirmation while execution is in flight', async () => {
    const pending = deferred<SqlExecutionResult>();
    adapter.dryRun.mockResolvedValue(DESTRUCTIVE_PREVIEW);
    adapter.execute.mockReturnValue(pending.promise);
    await service.preflight(SQL);

    const first = service.execute(true);
    const second = service.execute(true);
    expect(adapter.execute).toHaveBeenCalledTimes(1);

    pending.resolve(RESULT);
    await Promise.all([first, second]);
  });

  it('fails closed when preflight returns a different SQL snapshot', async () => {
    adapter.dryRun.mockResolvedValue({ ...PREVIEW, sql: 'DROP TABLE other;' });

    await service.preflight(SQL);

    expect(service.state()).toEqual({
      phase: 'preflight-error',
      sql: SQL,
      message: 'SQL preflight response does not match the requested snapshot'
    });
    await service.execute(true);
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it('fails closed when execute returns a different SQL snapshot', async () => {
    adapter.execute.mockResolvedValue({ ...RESULT, sql: 'DROP TABLE other;' });
    await service.preflight(SQL);

    await service.execute();

    expect(service.state()).toEqual({
      phase: 'execution-error',
      preview: PREVIEW,
      message: 'SQL execution response does not match the preflight snapshot'
    });
  });
});

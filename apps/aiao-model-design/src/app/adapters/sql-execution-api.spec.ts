import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SqlExecutionOutcomeUnknownError } from '../model-designer/services/sql-execution-adapter';
import { sqlExecutionApi } from './sql-execution-api';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

const sql = 'ALTER TABLE users ADD COLUMN name text;';

describe('sqlExecutionApi', () => {
  beforeEach(() => vi.stubGlobal('fetch', vi.fn()));
  afterEach(() => vi.unstubAllGlobals());

  it('preflights through the BFF and returns a narrowed preview', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        committed: false,
        destructive: false,
        affectedTables: ['users'],
        statementCount: 1,
        sql
      })
    );

    await expect(sqlExecutionApi.dryRun(sql)).resolves.toEqual({
      committed: false,
      destructive: false,
      affectedTables: ['users'],
      statementCount: 1,
      sql
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/bff/model-designer/sql/dry-run',
      expect.objectContaining({ method: 'POST', credentials: 'include', body: JSON.stringify({ sql }) })
    );
  });

  it('sends the explicit destructive confirmation to execute', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: true, committed: true, affectedTables: ['users'], statementCount: 1, sql })
    );

    await expect(sqlExecutionApi.execute(sql, true)).resolves.toMatchObject({ committed: true, sql });
    expect(fetchMock).toHaveBeenCalledWith(
      '/bff/model-designer/sql/execute',
      expect.objectContaining({ body: JSON.stringify({ sql, confirmDestructive: true }) })
    );
  });

  it('throws the stable API message for non-success responses', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({ ok: false, error: 'execution_failed', message: 'permission denied' }, 500)
    );

    await expect(sqlExecutionApi.execute(sql, false)).rejects.toThrow('permission denied');
  });

  it('marks a lost execute response as an unknown outcome', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(sqlExecutionApi.execute(sql, false)).rejects.toBeInstanceOf(SqlExecutionOutcomeUnknownError);
  });

  it('rejects malformed success bodies instead of fabricating defaults', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(jsonResponse({ ok: true, committed: true, affectedTables: 'users' }));

    await expect(sqlExecutionApi.execute(sql, false)).rejects.toBeInstanceOf(SqlExecutionOutcomeUnknownError);
  });

  it('rejects successful dry-run responses for a different SQL snapshot', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        committed: false,
        destructive: false,
        affectedTables: ['other'],
        statementCount: 1,
        sql: 'DROP TABLE other;'
      })
    );

    await expect(sqlExecutionApi.dryRun(sql)).rejects.toThrow('SQL execution response is invalid');
  });

  it('rejects successful execute responses for a different SQL snapshot', async () => {
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      jsonResponse({
        ok: true,
        committed: true,
        affectedTables: ['other'],
        statementCount: 1,
        sql: 'DROP TABLE other;'
      })
    );

    await expect(sqlExecutionApi.execute(sql, false)).rejects.toBeInstanceOf(SqlExecutionOutcomeUnknownError);
  });
});

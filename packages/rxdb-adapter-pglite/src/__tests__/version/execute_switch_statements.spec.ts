import { describe, expect, it, vi } from 'vitest';
import { executeSwitchStatements, splitSwitchStatements } from '../../version/execute_switch_statements.js';

describe('execute_switch_statements', () => {
  it('splitSwitchStatements trims and drops empty segments', () => {
    expect(splitSwitchStatements('  a  ---STATEMENT_SEPARATOR---  \n  b  ---STATEMENT_SEPARATOR--- ')).toEqual([
      'a',
      'b'
    ]);
  });

  it('executes a single parameterized statement', async () => {
    const adapter = {
      query: vi.fn(async () => ({ rows: [{ id: 1 }], affectedRows: 1, fields: [] }))
    };

    const result = await executeSwitchStatements(adapter as never, 'SELECT $1', [42]);
    expect(adapter.query).toHaveBeenCalledWith('SELECT $1', [42]);
    expect(result.rows).toEqual([{ id: 1 }]);
  });

  it('rejects parameterized multi-statement SQL', async () => {
    const adapter = { query: vi.fn() };
    await expect(
      executeSwitchStatements(adapter as never, 'SELECT 1---STATEMENT_SEPARATOR---SELECT 2', [1])
    ).rejects.toThrow(/exactly one statement/);
    expect(adapter.query).not.toHaveBeenCalled();
  });

  it('combines multi-statement results without params', async () => {
    const adapter = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [{ a: 1 }], affectedRows: 1, fields: [{ name: 'a' }] })
        .mockResolvedValueOnce({ rows: [{ b: 2 }], affectedRows: undefined, fields: [{ name: 'b' }] })
    };

    const result = await executeSwitchStatements(adapter as never, 'SELECT 1---STATEMENT_SEPARATOR---SELECT 2');
    expect(adapter.query).toHaveBeenCalledTimes(2);
    expect(result.rows).toEqual([{ a: 1 }, { b: 2 }]);
    expect(result.affectedRows).toBe(2); // 1 + rows.length 兜底
    expect(result.fields).toEqual([{ name: 'b' }]);
  });
});

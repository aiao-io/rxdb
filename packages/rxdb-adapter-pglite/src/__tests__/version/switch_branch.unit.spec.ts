import { afterEach, describe, expect, it, vi } from 'vitest';

const triggerControl = vi.hoisted(() => ({
  mode: 'actual' as 'actual' | 'throw' | 'empty'
}));

const transactionResultMock = vi.hoisted(() => vi.fn());

vi.mock('../../table/trigger_sql.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../table/trigger_sql.js')>();
  return {
    ...actual,
    default: (...args: Parameters<typeof actual.default>) => {
      if (triggerControl.mode === 'throw') {
        throw new Error('trigger fail');
      }
      if (triggerControl.mode === 'empty') {
        return '   \n  ';
      }
      return actual.default(...args);
    }
  };
});

vi.mock('../../transaction_pglite_result.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../transaction_pglite_result.js')>();
  return {
    ...actual,
    transaction_pglite_result: (...args: unknown[]) => transactionResultMock(...args)
  };
});

import { RxDBBranch, type SwitchBranchOptions } from '@aiao/rxdb';
import { Todo } from '@aiao/rxdb-test/entities';
import { RxdbAdapterPGliteError } from '../../pglite.utils.js';
import { generateSwitchBranchSql, switch_branch } from '../../version/switch_branch.js';

type MockAdapter = {
  query: ReturnType<typeof vi.fn>;
  transaction: ReturnType<typeof vi.fn>;
  rxdb: { config: { entities: unknown[] }; dispatchEvent: ReturnType<typeof vi.fn> };
} & Record<string, unknown>;

const makeAdapter = (overrides: Record<string, unknown> = {}): MockAdapter => {
  const query = vi.fn().mockResolvedValue({ rows: [{ id: 'main', activated: true }], affectedRows: 1, fields: [] });
  const adapter: MockAdapter = {
    query,
    transaction: vi.fn((fn: (executor: { adapter: unknown }) => Promise<unknown>) => fn({ adapter })),
    setRxDBChangeSequence: vi.fn(),
    encryptionContext: { resolveEntityMetadata: vi.fn() },
    rxdb: {
      config: { entities: [] as unknown[] },
      dispatchEvent: vi.fn()
    },
    ...overrides
  } as MockAdapter;
  return adapter;
};

describe('switch_branch pure unit edges', () => {
  afterEach(() => {
    triggerControl.mode = 'actual';
    transactionResultMock.mockReset();
    vi.clearAllMocks();
  });

  it('generateSwitchBranchSql escapes quotes without entities', () => {
    const sql = generateSwitchBranchSql(makeAdapter() as never, "test'branch");
    expect(sql).toContain("test''branch");
    expect(sql).toContain('UPDATE');
    expect(sql).toContain('TRUE');
  });

  it('generateSwitchBranchSql skips log:false entities (RxDBBranch)', () => {
    const sql = generateSwitchBranchSql(
      makeAdapter({ rxdb: { config: { entities: [RxDBBranch] }, dispatchEvent: vi.fn() } }) as never,
      'b-log-false'
    );
    expect(sql).toContain('b-log-false');
    expect(sql).toContain('UPDATE');
    expect(sql.split('---STATEMENT_SEPARATOR---').length).toBe(1);
  });

  it('generateSwitchBranchSql propagates trigger generation failures', () => {
    triggerControl.mode = 'throw';

    expect(() =>
      generateSwitchBranchSql(
        makeAdapter({ rxdb: { config: { entities: [Todo] }, dispatchEvent: vi.fn() } }) as never,
        'branch-1'
      )
    ).toThrow('trigger fail');
  });

  it('generateSwitchBranchSql includes non-empty trigger SQL and skips whitespace-only', () => {
    const adapter = makeAdapter({ rxdb: { config: { entities: [Todo] }, dispatchEvent: vi.fn() } });

    triggerControl.mode = 'actual';
    const sql = generateSwitchBranchSql(adapter as never, 'b1');
    expect(sql).toContain('---STATEMENT_SEPARATOR---');
    expect(sql.toLowerCase()).toContain('trigger');

    triggerControl.mode = 'empty';
    const sql2 = generateSwitchBranchSql(adapter as never, 'b2');
    expect(sql2).not.toMatch(/CREATE\s+TRIGGER/i);
    expect(sql2).toContain('UPDATE');
  });

  it('switch_branch without actions only runs branch SQL', async () => {
    const adapter = makeAdapter();
    adapter.query.mockResolvedValue({ rows: [], affectedRows: 0, fields: [] });
    transactionResultMock.mockResolvedValue([]);

    await switch_branch(adapter as never, { branchId: 'solo' } as SwitchBranchOptions);

    expect(adapter.query).toHaveBeenCalled();
    expect(adapter.rxdb.dispatchEvent).not.toHaveBeenCalled();
  });

  it('switch_branch keeps trigger removal and restoration in one transaction', async () => {
    const adapter = makeAdapter();
    transactionResultMock.mockResolvedValue([]);

    await switch_branch(adapter as never, { branchId: 'feature' } as SwitchBranchOptions);

    expect(adapter.transaction).toHaveBeenCalledTimes(1);
  });

  it('switch_branch dispatches branch update events when results exist', async () => {
    const now = new Date('2020-01-01T00:00:00.000Z');
    const adapter = makeAdapter();
    adapter.query.mockResolvedValue({
      rows: [
        { id: 'main', activated: false, updatedAt: now, createdAt: now },
        { id: 'feature', activated: true, updatedAt: now, createdAt: now }
      ],
      affectedRows: 2,
      fields: []
    });
    transactionResultMock.mockResolvedValue([
      { id: 'main', activated: false, updatedAt: now, createdAt: now },
      { id: 'feature', activated: true, updatedAt: now, createdAt: now }
    ]);

    await switch_branch(adapter as never, { branchId: 'feature' } as SwitchBranchOptions);

    expect(transactionResultMock).toHaveBeenCalled();
    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalled();
    const event = adapter.rxdb.dispatchEvent.mock.calls[0][0];
    expect(event.entities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'feature',
          type: 'UPDATE',
          inversePatch: expect.objectContaining({ activated: false })
        }),
        expect.objectContaining({
          id: 'main',
          type: 'UPDATE',
          inversePatch: expect.objectContaining({ activated: true })
        })
      ])
    );
  });

  it('switch_branch recordAt falls back and affectedRows uses rows.length', async () => {
    const adapter = makeAdapter();
    // 没有 affectedRows → convertResults 使用 rows.length。
    adapter.query.mockResolvedValue({
      rows: [{ id: 'solo', activated: true }],
      fields: []
    });
    transactionResultMock.mockResolvedValue([
      { id: 'solo', activated: true } // 没有 updatedAt/createdAt → new Date()
    ]);

    await switch_branch(adapter as never, { branchId: 'solo' } as SwitchBranchOptions);

    expect(adapter.rxdb.dispatchEvent).toHaveBeenCalled();
    const event = adapter.rxdb.dispatchEvent.mock.calls[0][0];
    expect(event.entities[0].recordAt).toBeInstanceOf(Date);
    expect(event.entities[0].id).toBe('solo');
  });

  it('switch_branch wraps failures as RxdbAdapterPGliteError', async () => {
    const adapter = makeAdapter();
    const cause = new Error('db down');
    Reflect.set(cause, 'code', '08006');
    adapter.query.mockRejectedValue(cause);

    const promise = switch_branch(adapter as never, { branchId: 'bad' } as SwitchBranchOptions);
    await expect(promise).rejects.toBeInstanceOf(RxdbAdapterPGliteError);
    await expect(promise).rejects.toMatchObject({
      message: 'switch branch bad failed: db down',
      originalError: cause,
      cause
    });
  });

  it('switch_branch transaction failure is wrapped', async () => {
    const adapter = makeAdapter({
      transaction: vi.fn(async () => {
        throw new Error('tx fail');
      })
    });

    await expect(switch_branch(adapter as never, { branchId: 'tx' } as SwitchBranchOptions)).rejects.toThrow(
      /switch branch tx failed/
    );
  });
});

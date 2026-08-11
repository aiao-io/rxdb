import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RxdbAdapterPGliteError } from '../../pglite.utils.js';
import type { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';

const { RxDBBranchMock } = vi.hoisted(() => {
  class RxDBBranchMock {
    id?: string;
    activated?: boolean;
    local?: boolean;
    remote?: boolean;
    fromChangeId?: number | null;
    parentId?: string;
  }
  return { RxDBBranchMock };
});

vi.mock('@aiao/rxdb', async importOriginal => {
  const actual = await importOriginal<typeof import('@aiao/rxdb')>();
  return {
    ...actual,
    RxDBBranch: RxDBBranchMock
  };
});

import createBranch from '../../version/create_branch.js';

describe('rxdb_adapter_create_branch (unit)', () => {
  let branchFind: ReturnType<typeof vi.fn>;
  let branchGet: ReturnType<typeof vi.fn>;
  let branchCreate: ReturnType<typeof vi.fn>;
  let changeFind: ReturnType<typeof vi.fn>;
  let changeGet: ReturnType<typeof vi.fn>;
  let adapter: RxDBAdapterPGlite;

  beforeEach(() => {
    branchFind = vi.fn();
    branchGet = vi.fn();
    branchCreate = vi.fn(async (branch: unknown) => branch);
    changeFind = vi.fn();
    changeGet = vi.fn();

    adapter = {
      localRxDBBranch: () => ({
        find: branchFind,
        get: branchGet,
        create: branchCreate
      }),
      localRxDBChange: () => ({
        find: changeFind,
        get: changeGet
      })
    } as unknown as RxDBAdapterPGlite;
  });

  it('rejects when the branch id already exists', async () => {
    branchFind.mockResolvedValue([{ id: 'dup' }]);
    await expect(createBranch(adapter, 'dup')).rejects.toBeInstanceOf(RxdbAdapterPGliteError);
    await expect(createBranch(adapter, 'dup')).rejects.toThrow(/already exists/);
  });

  it('creates from the active branch and uses latest unreverted change id', async () => {
    branchFind
      .mockResolvedValueOnce([]) // 存在性检查
      .mockResolvedValueOnce([{ id: 'main', activated: true }]); // 活动分支
    changeFind.mockResolvedValue([{ id: 7 }]);

    const result = await createBranch(adapter, 'feature');

    expect(result).toMatchObject({
      id: 'feature',
      activated: false,
      local: true,
      remote: false,
      fromChangeId: 7,
      parentId: 'main'
    });
    expect(branchCreate).toHaveBeenCalledOnce();
  });

  it('creates from active branch with null fromChangeId when no changes exist', async () => {
    branchFind.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'main', activated: true }]);
    changeFind.mockResolvedValue([]);

    const result = await createBranch(adapter, 'empty');
    expect(result.fromChangeId).toBeNull();
    expect(result.parentId).toBe('main');
  });

  it('throws when no active source branch is available', async () => {
    branchFind.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
    await expect(createBranch(adapter, 'orphan')).rejects.toThrow(/Source branch not found/);
  });

  it('creates from a change record and its branch', async () => {
    branchFind.mockResolvedValueOnce([]);
    changeGet.mockResolvedValue({ id: 42, branchId: 'main' });
    branchGet.mockResolvedValue({ id: 'main' });

    const result = await createBranch(adapter, 'from-change', 42);

    expect(changeGet).toHaveBeenCalledWith(42);
    expect(branchGet).toHaveBeenCalledWith('main');
    expect(result).toMatchObject({
      id: 'from-change',
      fromChangeId: 42,
      parentId: 'main'
    });
    expect(changeFind).not.toHaveBeenCalled();
  });

  it('throws when fromChangeId cannot be resolved', async () => {
    branchFind.mockResolvedValueOnce([]);
    changeGet.mockResolvedValue(undefined);
    await expect(createBranch(adapter, 'missing-change', 99)).rejects.toThrow(/Change ID \(99\) not found/);
  });

  it('throws when change record has no branchId', async () => {
    branchFind.mockResolvedValueOnce([]);
    changeGet.mockResolvedValue({ id: 11, branchId: null });
    await expect(createBranch(adapter, 'no-branch', 11)).rejects.toThrow(/has no branchId/);
  });
});

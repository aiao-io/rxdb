// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import type { BackendAdapter } from '../../src/routes/model-designer/backend-adapter/contracts';
import {
  createBackendAdapterRegistry,
  runBackendAdapterCapability
} from '../../src/routes/model-designer/backend-adapter/registry';
import { createSupabaseBackendAdapter } from '../../src/routes/model-designer/backend-adapter/supabase';
import { validationBackendAdapter } from '../../src/routes/model-designer/backend-adapter/validation';
import { createMockSqlExecutor } from '../../src/routes/model-designer/sql-executor';

const emptySchema = { tables: [] };

function adapter(overrides: Partial<BackendAdapter> = {}): BackendAdapter {
  return {
    descriptor: { id: 'test', label: 'Test', capabilities: [] },
    ...overrides
  };
}

describe('backend adapter registry', () => {
  it('rejects duplicate and invalid IDs', () => {
    expect(() => createBackendAdapterRegistry([adapter(), adapter()], 'test')).toThrowError(/duplicate/i);
    expect(() =>
      createBackendAdapterRegistry(
        [adapter({ descriptor: { id: 'Bad ID', label: 'Bad', capabilities: [] } })],
        'Bad ID'
      )
    ).toThrowError(/invalid/i);
  });

  it('rejects capability and method mismatches', () => {
    expect(() =>
      createBackendAdapterRegistry(
        [adapter({ descriptor: { id: 'test', label: 'Test', capabilities: ['schema.read'] } })],
        'test'
      )
    ).toThrowError(/schema.read/i);
    expect(() => createBackendAdapterRegistry([adapter({ readSchema: async () => emptySchema })], 'test')).toThrowError(
      /schema.read/i
    );
  });

  it('rejects unknown selection and keeps the selected adapter immutable', () => {
    expect(() => createBackendAdapterRegistry([adapter()], 'missing')).toThrowError(/unknown/i);
    const registry = createBackendAdapterRegistry([adapter()], 'test');
    expect(registry.selected.descriptor.id).toBe('test');
    expect(Object.isFrozen(registry.selected.descriptor)).toBe(true);
  });

  it('rejects unsupported capabilities instead of succeeding as a no-op', async () => {
    await expect(
      runBackendAdapterCapability(validationBackendAdapter, 'schema.read', current => current.readSchema?.())
    ).rejects.toMatchObject({ code: 'capability_unavailable', status: 501 });
  });
});

describe('SupabaseBackendAdapter', () => {
  it('delegates schema read, diff, dry-run, and execute to existing implementations', async () => {
    const log: Array<{ sql: string; commit: boolean }> = [];
    const backend = createSupabaseBackendAdapter({
      schemaReader: async () => ({
        tables: [
          {
            name: 'legacy',
            columns: [{ name: 'id', type: 'uuid', nullable: false, primaryKey: true }],
            foreignKeys: [],
            indexes: []
          }
        ]
      }),
      executor: createMockSqlExecutor(log)
    });

    expect(await backend.readSchema?.()).toEqual(expect.objectContaining({ tables: expect.any(Array) }));
    const diff = await backend.diffSchema?.(emptySchema);
    expect(diff?.sql).toContain('DROP TABLE legacy;');
    await backend.executeDdl?.('CREATE TABLE demo (id uuid);', { commit: false });
    await backend.executeDdl?.('CREATE TABLE demo (id uuid);', { commit: true });
    expect(log).toEqual([
      { sql: 'CREATE TABLE demo (id uuid);', commit: false },
      { sql: 'CREATE TABLE demo (id uuid);', commit: true }
    ]);
  });

  it('normalizes driver failures without exposing their message', async () => {
    const backend = createSupabaseBackendAdapter({
      schemaReader: vi.fn(async () => {
        throw new Error('postgresql://secret@db/internal');
      }),
      executor: createMockSqlExecutor()
    });

    await expect(
      runBackendAdapterCapability(backend, 'schema.read', current => current.readSchema?.())
    ).rejects.toMatchObject({ code: 'adapter_operation_failed', status: 502 });
    await expect(
      runBackendAdapterCapability(backend, 'schema.read', current => current.readSchema?.())
    ).rejects.not.toThrow(/secret@db/);
  });
});

describe('validation backend adapter', () => {
  it('has a stable descriptor and no side-effect capability', () => {
    expect(validationBackendAdapter.descriptor).toEqual({
      id: 'validation',
      label: 'Validation',
      capabilities: []
    });
    expect(validationBackendAdapter.readSchema).toBeUndefined();
    expect(validationBackendAdapter.diffSchema).toBeUndefined();
    expect(validationBackendAdapter.executeDdl).toBeUndefined();
  });
});

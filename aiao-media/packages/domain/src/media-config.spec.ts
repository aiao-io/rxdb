import { getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import {
  MediaConfigCommit,
  MediaConfigCommitChange,
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy,
  MediaSyncRecord,
  assertValidMediaConfigCommit,
  canTransitionMediaConfigCommit,
  createMediaConfigChangeFingerprint,
  createMediaConfigCommitEnvelope,
  createMediaConfigCommitFingerprint,
  type MediaConfigCommitChangeInput,
  type MediaConfigCommitInput
} from './index.js';

type EntityConstructor<T extends object> = new (initData?: Partial<T>) => T;

const entityManagerSymbol = Symbol.for('@aiao/rxdb/ɵEntityManager');
const proxySymbol = Symbol.for('@aiao/rxdb/ɵProxy');

function instantiateWithoutDatabase<T extends object>(EntityType: EntityConstructor<T>): T {
  const prototype = EntityType.prototype as object;
  const previous = Object.getOwnPropertyDescriptor(prototype, entityManagerSymbol);
  const entityManager = { [proxySymbol]: (entity: object): object => entity };
  Object.defineProperty(prototype, entityManagerSymbol, { configurable: true, value: entityManager });
  try {
    return new EntityType();
  } finally {
    if (previous) Object.defineProperty(prototype, entityManagerSymbol, previous);
    else delete (prototype as Record<PropertyKey, unknown>)[entityManagerSymbol];
  }
}

describe('media configuration domain contracts', () => {
  it('exposes RxDB entities with the shared workspace and revision fields', () => {
    expect(getEntityMetadata(MediaPromptTemplate).properties.map(property => property.name)).toContain('workspaceId');
    expect(getEntityMetadata(MediaProviderPolicy).properties.map(property => property.name)).toContain('providers');
    expect(getEntityMetadata(MediaPlatformModel).properties.map(property => property.name)).toContain('modelId');
    expect(getEntityMetadata(MediaConfigCommit).properties.map(property => property.name)).toContain('operationId');
    expect(getEntityMetadata(MediaConfigCommitChange).properties.map(property => property.name)).toContain(
      'expectedRevision'
    );
  });

  it('keeps commit and change defaults safe for a new local working-tree record', () => {
    const commit = instantiateWithoutDatabase(MediaConfigCommit);
    const change = instantiateWithoutDatabase(MediaConfigCommitChange);
    expect(commit.parentIds).toEqual([]);
    expect(commit.status).toBe('prepared');
    expect(commit.appliedAt).toBeNull();
    expect(commit.releasedAt).toBeNull();
    expect(commit.rejectionCode).toBeNull();
    expect(change.patch).toEqual({});
    expect(change.inversePatch).toBeNull();
    expect(change.expectedRevision).toBeNull();
  });

  it('keeps a new sync record at the first revision and active state', () => {
    const record = instantiateWithoutDatabase(MediaSyncRecord);
    expect(record.revision).toBe(1);
    expect(record.deleted).toBe(false);
    expect(record.baseRevision).toBe(0);
  });

  it('maps the shared sync record to the existing Supabase table and workspace index', () => {
    const metadata = getEntityMetadata(MediaSyncRecord);
    expect(metadata.namespace).toBe('public');
    expect(metadata.tableName).toBe('media_sync_records');
    expect(metadata.properties.map(property => property.name)).toEqual(
      expect.arrayContaining(['workspaceId', 'sourceId', 'kind', 'payload', 'revision', 'deleted', 'baseRevision'])
    );
    expect(metadata.indexes).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'workspace_kind_source', unique: true })])
    );
  });

  it('allows only the declared commit state transitions', () => {
    expect(canTransitionMediaConfigCommit('prepared', 'synced')).toBe(true);
    expect(canTransitionMediaConfigCommit('synced', 'validated')).toBe(true);
    expect(canTransitionMediaConfigCommit('validated', 'applied')).toBe(true);
    expect(canTransitionMediaConfigCommit('validated', 'rejected')).toBe(true);
    expect(canTransitionMediaConfigCommit('prepared', 'applied')).toBe(false);
    expect(canTransitionMediaConfigCommit('released', 'prepared')).toBe(false);
  });

  it('creates an order-sensitive fingerprint for the complete commit envelope', async () => {
    const commit: MediaConfigCommitInput = {
      id: '10000000-0000-4000-8000-000000000001',
      workspaceId: '10000000-0000-4000-8000-000000000002',
      branchId: 'main',
      parentIds: ['10000000-0000-4000-8000-000000000003'],
      authorId: '10000000-0000-4000-8000-000000000004',
      message: '更新运行模型',
      operationId: '10000000-0000-4000-8000-000000000005',
      status: 'prepared',
      changes: [
        {
          id: '10000000-0000-4000-8000-000000000006',
          sequence: 1,
          entity: 'MediaPlatformModel',
          entityId: '10000000-0000-4000-8000-000000000007',
          operation: 'update',
          patch: { enabled: true },
          inversePatch: { enabled: false },
          expectedRevision: 2
        },
        {
          id: '10000000-0000-4000-8000-000000000008',
          sequence: 2,
          entity: 'MediaProviderPolicy',
          entityId: '10000000-0000-4000-8000-000000000009',
          operation: 'delete',
          patch: {},
          inversePatch: null,
          expectedRevision: 1
        }
      ]
    };
    const reordered = { ...commit, changes: [...commit.changes].reverse() };
    const fingerprint = await createMediaConfigCommitFingerprint(commit);
    expect(fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(await createMediaConfigCommitFingerprint(commit)).toBe(fingerprint);
    expect(await createMediaConfigCommitFingerprint(reordered)).not.toBe(fingerprint);
  });

  it('creates per-change fingerprints and a complete envelope', async () => {
    const input = {
      id: '10000000-0000-4000-8000-000000000001',
      workspaceId: '10000000-0000-4000-8000-000000000002',
      branchId: 'main',
      parentIds: [],
      authorId: '10000000-0000-4000-8000-000000000004',
      message: '新增模板',
      operationId: '10000000-0000-4000-8000-000000000005',
      status: 'prepared' as const,
      changes: [
        {
          id: '10000000-0000-4000-8000-000000000006',
          sequence: 1,
          entity: 'MediaPromptTemplate',
          entityId: '10000000-0000-4000-8000-000000000007',
          operation: 'insert' as const,
          patch: { value: { key: 'fixture' } },
          inversePatch: null,
          expectedRevision: 0
        }
      ]
    };
    const envelope = await createMediaConfigCommitEnvelope(input);
    expect(envelope.commit.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.changes[0].contentFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(envelope.changes[0].contentFingerprint).toBe(await createMediaConfigChangeFingerprint(input.changes[0]));
  });

  it('rejects incomplete commits and change sequences', () => {
    const invalid = {
      id: 'not-a-uuid',
      workspaceId: 'workspace',
      branchId: 'main',
      parentIds: [],
      authorId: 'actor',
      message: '',
      operationId: 'operation',
      status: 'prepared',
      changes: []
    } as unknown as MediaConfigCommitInput;
    expect(() => assertValidMediaConfigCommit(invalid)).toThrow('提交');
    const duplicateSequence: MediaConfigCommitChangeInput[] = [
      {
        id: '10000000-0000-4000-8000-000000000006',
        sequence: 1,
        entity: 'MediaPlatformModel',
        entityId: '10000000-0000-4000-8000-000000000007',
        operation: 'update',
        patch: {},
        inversePatch: null,
        expectedRevision: 1
      },
      {
        id: '10000000-0000-4000-8000-000000000008',
        sequence: 1,
        entity: 'MediaProviderPolicy',
        entityId: '10000000-0000-4000-8000-000000000009',
        operation: 'delete',
        patch: {},
        inversePatch: null,
        expectedRevision: 1
      }
    ];
    expect(() =>
      assertValidMediaConfigCommit({
        ...invalid,
        id: '10000000-0000-4000-8000-000000000001',
        workspaceId: '10000000-0000-4000-8000-000000000002',
        authorId: '10000000-0000-4000-8000-000000000004',
        message: '有效提交',
        operationId: '10000000-0000-4000-8000-000000000005',
        changes: duplicateSequence
      })
    ).toThrow('序号');
    expect(() =>
      assertValidMediaConfigCommit({
        ...invalid,
        id: '10000000-0000-4000-8000-000000000001',
        workspaceId: '10000000-0000-4000-8000-000000000002',
        authorId: '10000000-0000-4000-8000-000000000004',
        message: '空提交',
        operationId: '10000000-0000-4000-8000-000000000005',
        changes: []
      })
    ).toThrow('变更');
  });

  it('rejects invalid commit metadata and change fields before projection', () => {
    const change: MediaConfigCommitChangeInput = {
      id: '10000000-0000-4000-8000-000000000006',
      sequence: 1,
      entity: 'MediaPromptTemplate',
      entityId: '10000000-0000-4000-8000-000000000007',
      operation: 'update',
      patch: { value: ['draft', null] },
      inversePatch: null,
      expectedRevision: 1
    };
    const commit = (overrides: Partial<MediaConfigCommitInput> = {}): MediaConfigCommitInput => ({
      id: '10000000-0000-4000-8000-000000000001',
      workspaceId: '10000000-0000-4000-8000-000000000002',
      branchId: 'main',
      parentIds: [],
      authorId: '10000000-0000-4000-8000-000000000004',
      message: '有效提交',
      operationId: '10000000-0000-4000-8000-000000000005',
      status: 'prepared',
      changes: [change],
      ...overrides
    });

    expect(() => assertValidMediaConfigCommit(commit({ branchId: '' }))).toThrow('提交内容');
    expect(() =>
      assertValidMediaConfigCommit(commit({ status: 'unknown' as MediaConfigCommitInput['status'] }))
    ).toThrow('状态');
    expect(() => assertValidMediaConfigCommit(commit({ changes: [{ ...change, id: 'invalid' }] }))).toThrow('序号');
    expect(() => assertValidMediaConfigCommit(commit({ changes: [{ ...change, sequence: 0 }] }))).toThrow('序号');
    expect(() => assertValidMediaConfigCommit(commit({ changes: [{ ...change, entity: '' }] }))).toThrow('变更');
    expect(() =>
      assertValidMediaConfigCommit(
        commit({ changes: [{ ...change, operation: 'replace' as MediaConfigCommitChangeInput['operation'] }] })
      )
    ).toThrow('变更');
    expect(() => assertValidMediaConfigCommit(commit({ changes: [{ ...change, expectedRevision: -1 }] }))).toThrow(
      '预期修订号'
    );
    expect(() => assertValidMediaConfigCommit(commit({ changes: [{ ...change, sequence: 2 }] }))).toThrow('连续');
  });

  it('declares the change count so a partial envelope can never look complete', async () => {
    expect(getEntityMetadata(MediaConfigCommit).properties.map(property => property.name)).toContain('changeCount');
    const change = (sequence: number): MediaConfigCommitChangeInput => ({
      id: `10000000-0000-4000-8000-00000000010${sequence}`,
      sequence,
      entity: 'MediaPromptTemplate',
      entityId: `10000000-0000-4000-8000-00000000020${sequence}`,
      operation: 'update',
      patch: { value: { key: `fixture-${sequence}` } },
      inversePatch: null,
      expectedRevision: 1
    });
    const envelope = await createMediaConfigCommitEnvelope({
      id: '10000000-0000-4000-8000-000000000001',
      workspaceId: '10000000-0000-4000-8000-000000000002',
      branchId: 'main',
      parentIds: [],
      authorId: '10000000-0000-4000-8000-000000000004',
      message: '三项变更',
      operationId: '10000000-0000-4000-8000-000000000005',
      status: 'prepared',
      changes: [change(1), change(2), change(3)]
    });
    expect(envelope.commit.changeCount).toBe(3);
    expect(envelope.changes).toHaveLength(3);
  });

  it('fingerprints only immutable commit content, so server-advanced status never invalidates it', async () => {
    const input: MediaConfigCommitInput = {
      id: '10000000-0000-4000-8000-000000000001',
      workspaceId: '10000000-0000-4000-8000-000000000002',
      branchId: 'main',
      parentIds: [],
      authorId: '10000000-0000-4000-8000-000000000004',
      message: '状态无关',
      operationId: '10000000-0000-4000-8000-000000000005',
      status: 'prepared',
      changes: [
        {
          id: '10000000-0000-4000-8000-000000000006',
          sequence: 1,
          entity: 'MediaPromptTemplate',
          entityId: '10000000-0000-4000-8000-000000000007',
          operation: 'insert',
          patch: { value: { key: 'hero' } },
          inversePatch: null,
          expectedRevision: null
        }
      ]
    };
    const prepared = await createMediaConfigCommitFingerprint(input);
    for (const status of ['synced', 'validated', 'applied', 'released', 'rejected'] as const) {
      expect(await createMediaConfigCommitFingerprint({ ...input, status })).toBe(prepared);
    }
    expect(await createMediaConfigCommitFingerprint({ ...input, message: '内容变化' })).not.toBe(prepared);
  });

  it('accepts the UUID v7 identities that RxDB and the working tree generate', () => {
    const v7 = '01a1e4ab-2eb4-74ac-8053-9f223ad0bf50';
    expect(() =>
      assertValidMediaConfigCommit({
        id: v7,
        workspaceId: '10000000-0000-4000-8000-000000000002',
        branchId: 'main',
        parentIds: ['01a1e4ab-2eb4-74ac-8053-9f223ad0bf51'],
        authorId: '10000000-0000-4000-8000-000000000004',
        message: 'v7 提交',
        operationId: '01a1e4ab-2eb4-74ac-8053-9f223ad0bf52',
        status: 'prepared',
        changes: [
          {
            id: '01a1e4ab-2eb4-74ac-8053-9f223ad0bf53',
            sequence: 1,
            entity: 'MediaPromptTemplate',
            entityId: v7,
            operation: 'insert',
            patch: { value: { key: 'hero' } },
            inversePatch: null,
            expectedRevision: null
          }
        ]
      })
    ).not.toThrow();
  });

  it('keeps every synced entity addressable by workspace, including the change rows', () => {
    for (const EntityType of [
      MediaPromptTemplate,
      MediaProviderPolicy,
      MediaPlatformModel,
      MediaConfigCommit,
      MediaConfigCommitChange
    ]) {
      expect(getEntityMetadata(EntityType).properties.map(property => property.name)).toContain('workspaceId');
    }
  });
});

import { CORE_SYSTEM_ENTITIES, SyncType, getEntityMetadata, isSystemEntity } from '@aiao/rxdb';
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import {
  MEDIA_CONFIG_SYNC_ENTITIES,
  MEDIA_CONFIG_VERSIONED_ENTITIES,
  MEDIA_TEMPLATE_PUBLICATION_FIELDS,
  MediaConfigCommit,
  MediaConfigCommitChange,
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy,
  MediaSyncRecord,
  assertMediaConfigSyncEntities,
  createMediaConfigSyncOptions,
  templateAttributionMigration
} from './index.js';

const workspaceId = '10000000-0000-4000-8000-000000000001';
const adapters = { local: 'sqlite-wasm', remote: 'supabase' } as const;

describe('media configuration sync plan', () => {
  it('syncs exactly the configuration entities and the commit projection', () => {
    expect(MEDIA_CONFIG_SYNC_ENTITIES).toEqual([
      MediaPromptTemplate,
      MediaProviderPolicy,
      MediaPlatformModel,
      MediaConfigCommit,
      MediaConfigCommitChange
    ]);
    expect(MEDIA_CONFIG_VERSIONED_ENTITIES).toEqual([MediaPromptTemplate, MediaProviderPolicy, MediaPlatformModel]);
    expect(MEDIA_CONFIG_SYNC_ENTITIES.some(entity => isSystemEntity(entity))).toBe(false);
    expect(() => assertMediaConfigSyncEntities(MEDIA_CONFIG_SYNC_ENTITIES)).not.toThrow();
  });

  it('refuses RxDB internal system entities even when they are listed explicitly', () => {
    expect(CORE_SYSTEM_ENTITIES.length).toBeGreaterThan(0);
    for (const entity of CORE_SYSTEM_ENTITIES) {
      expect(() => assertMediaConfigSyncEntities([entity])).toThrow(/系统实体/);
      expect(() => createMediaConfigSyncOptions({ workspaceId, adapters, entities: [entity] })).toThrow(/系统实体/);
    }
    expect(() => assertMediaConfigSyncEntities([MediaPromptTemplate, CORE_SYSTEM_ENTITIES[0]])).toThrow(/系统实体/);
  });

  it('refuses entities that are not part of the configuration sync boundary', () => {
    // 草稿 / 作品同步记录是另一条同步链路的业务实体，不能顺手混进配置同步。
    expect(() => assertMediaConfigSyncEntities([MediaSyncRecord])).toThrow(/不在配置同步范围/);
    expect(() => assertMediaConfigSyncEntities([class NotAnEntity {}])).toThrow(/不是 RxDB 实体/);
    expect(() => assertMediaConfigSyncEntities([MediaPromptTemplate, MediaPromptTemplate])).toThrow(/重复/);
  });

  it('maps every synced entity to the public schema table that Supabase exposes', () => {
    expect(
      MEDIA_CONFIG_SYNC_ENTITIES.map(entity => {
        const metadata = getEntityMetadata(entity);
        return `${metadata.namespace}.${metadata.tableName}`;
      })
    ).toEqual([
      'public.media_prompt_templates',
      'public.media_provider_policies',
      'public.media_platform_models',
      'public.media_config_projection_commits',
      'public.media_config_projection_changes'
    ]);
  });

  it('versions configuration edits with a workspace filter and keeps the projection remote-authoritative', () => {
    const plan = createMediaConfigSyncOptions({ workspaceId: workspaceId.toUpperCase(), adapters });

    expect(plan.sync).toEqual({
      type: SyncType.Full,
      local: { adapter: 'sqlite-wasm' },
      remote: { adapter: 'supabase' }
    });
    expect(plan.syncOverrides.map(item => item.entity)).toEqual([...MEDIA_CONFIG_SYNC_ENTITIES]);
    const byEntity = new Map(plan.syncOverrides.map(item => [item.entity, item.sync]));
    for (const entity of MEDIA_CONFIG_VERSIONED_ENTITIES) {
      const sync = byEntity.get(entity);
      expect(sync?.type).toBe(SyncType.Filter);
      if (sync?.type !== SyncType.Filter) throw new Error('expected filter sync');
      expect(sync.local).toEqual({ adapter: 'sqlite-wasm' });
      expect(sync.remote.adapter).toBe('supabase');
      expect(sync.remote.filter()).toEqual({
        combinator: 'and',
        rules: [{ field: 'workspaceId', operator: '=', value: workspaceId }]
      });
    }
    // 投影行由服务端推进状态，作为查询缓存读写：不进工作树，也不会被下一次提交当成配置变更。
    for (const entity of [MediaConfigCommit, MediaConfigCommitChange]) {
      expect(byEntity.get(entity)).toEqual({
        type: SyncType.QueryCache,
        local: { adapter: 'sqlite-wasm' },
        remote: { adapter: 'supabase' }
      });
    }
  });

  it('supports a narrower whitelisted subset and keeps its order', () => {
    const plan = createMediaConfigSyncOptions({
      workspaceId,
      adapters,
      entities: [MediaConfigCommitChange, MediaConfigCommit]
    });
    expect(plan.syncOverrides.map(item => item.entity)).toEqual([MediaConfigCommitChange, MediaConfigCommit]);
  });

  it('rejects a workspace that cannot be used as a row-level-security filter', () => {
    for (const invalid of ['', 'other-workspace', `${workspaceId}' or true --`, ` ${workspaceId.slice(1)}`]) {
      expect(() => createMediaConfigSyncOptions({ workspaceId: invalid, adapters })).toThrow(/工作区/);
    }
  });

  it('rejects empty adapter names instead of silently falling back to a default', () => {
    expect(() => createMediaConfigSyncOptions({ workspaceId, adapters: { local: '', remote: 'supabase' } })).toThrow(
      /适配器/
    );
    expect(() => createMediaConfigSyncOptions({ workspaceId, adapters: { local: 'pglite', remote: ' ' } })).toThrow(
      /适配器/
    );
  });
});

it('SQLite 旧配置表升级和重跑保留离线草稿及已有的展示字段', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec("CREATE TABLE templates (title TEXT, author TEXT); INSERT INTO templates VALUES ('草稿', '原作者')");
    const migration = templateAttributionMigration('sqlite');
    const executor = {
      tableRef: () => '"templates"',
      async query(sql: string) {
        const statement = db.prepare(sql);
        const columns = statement.columns().map(column => column.name);
        const rows = statement.all().map(record => columns.map(column => record[column]));
        return { columns, rows, rowsAffected: 0 };
      }
    };
    await migration.up(executor as unknown as Parameters<typeof migration.up>[0]);
    await migration.up(executor as unknown as Parameters<typeof migration.up>[0]);
    expect(db.prepare('SELECT * FROM templates').get()).toEqual({
      title: '草稿',
      ...Object.fromEntries(MEDIA_TEMPLATE_PUBLICATION_FIELDS.map(key => [key, null])),
      author: '原作者'
    });
  } finally {
    db.close();
  }
});

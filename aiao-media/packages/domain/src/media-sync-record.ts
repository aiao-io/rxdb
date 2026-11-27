import { Entity, EntityBase, PropertyType, type UUID } from '@aiao/rxdb';

export const MEDIA_SYNC_RECORD_KINDS = ['draft', 'provider', 'work'] as const;
export type MediaSyncRecordKind = (typeof MEDIA_SYNC_RECORD_KINDS)[number];

/** 与现有 Supabase media_sync_records 表一一对应的共享同步实体。 */
@Entity({
  name: 'MediaSyncRecord',
  tableName: 'media_sync_records',
  namespace: 'public',
  displayName: '媒体同步记录',
  properties: [
    { name: 'workspaceId', type: PropertyType.uuid, displayName: '工作区' },
    { name: 'sourceId', type: PropertyType.string, displayName: '来源标识' },
    { name: 'kind', type: PropertyType.enum, enum: MEDIA_SYNC_RECORD_KINDS, displayName: '记录类型' },
    { name: 'payload', type: PropertyType.string, displayName: '公开载荷' },
    { name: 'revision', type: PropertyType.integer, displayName: '修订号' },
    { name: 'deleted', type: PropertyType.boolean, displayName: '已删除' },
    { name: 'baseRevision', type: PropertyType.integer, displayName: '基准修订号' }
  ],
  indexes: [{ name: 'workspace_kind_source', properties: ['workspaceId', 'kind', 'sourceId'], unique: true }]
})
export class MediaSyncRecord extends EntityBase {
  workspaceId!: UUID;
  sourceId!: string;
  kind!: MediaSyncRecordKind;
  payload!: string;
  revision = 1;
  deleted = false;
  baseRevision = 0;
}

import { Entity, PropertyType, SYSTEM_ENTITY_PERMISSIONS } from '@aiao/rxdb';

@Entity({
  namespace: 'rxdb',
  name: 'RxDBSyncBucketProgress',
  tableName: 'rxdb_sync_bucket_progress',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'namespace', type: PropertyType.string },
    { name: 'entity', type: PropertyType.string },
    { name: 'branchId', type: PropertyType.string },
    { name: 'bucket', type: PropertyType.string },
    { name: 'filterFingerprint', type: PropertyType.string },
    { name: 'snapshotPoint', type: PropertyType.integer },
    { name: 'snapshotOffset', type: PropertyType.integer, default: 0 },
    { name: 'cursor', type: PropertyType.integer, default: 0 },
    { name: 'snapshotComplete', type: PropertyType.boolean, default: false },
    { name: 'snapshotRunId', type: PropertyType.string },
    { name: 'remoteBackendId', type: PropertyType.string, nullable: true },
    { name: 'lastPulledAt', type: PropertyType.date, nullable: true },
    { name: 'createdAt', type: PropertyType.date, default: () => new Date() },
    { name: 'updatedAt', type: PropertyType.date, default: () => new Date() }
  ],
  indexes: [
    {
      name: 'scope',
      properties: ['namespace', 'entity', 'branchId', 'bucket', 'filterFingerprint'],
      unique: true
    },
    { name: 'repository', properties: ['namespace', 'entity', 'branchId'] }
  ]
})
export class RxDBSyncBucketProgress {
  id!: string;
  namespace!: string;
  entity!: string;
  branchId!: string;
  bucket!: string;
  filterFingerprint!: string;
  snapshotPoint!: number;
  snapshotOffset!: number;
  cursor!: number;
  snapshotComplete!: boolean;
  snapshotRunId!: string;
  remoteBackendId!: string | null;
  lastPulledAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}

@Entity({
  namespace: 'rxdb',
  name: 'RxDBSyncBucketRow',
  tableName: 'rxdb_sync_bucket_row',
  log: false,
  permissions: SYSTEM_ENTITY_PERMISSIONS,
  properties: [
    { name: 'id', type: PropertyType.string, primary: true },
    { name: 'namespace', type: PropertyType.string },
    { name: 'entity', type: PropertyType.string },
    { name: 'branchId', type: PropertyType.string },
    { name: 'bucket', type: PropertyType.string },
    { name: 'filterFingerprint', type: PropertyType.string },
    { name: 'entityId', type: PropertyType.string },
    { name: 'snapshotRunId', type: PropertyType.string, nullable: true }
  ],
  indexes: [
    {
      name: 'scope_entity',
      properties: ['namespace', 'entity', 'branchId', 'bucket', 'filterFingerprint', 'entityId'],
      unique: true
    },
    { name: 'entity', properties: ['namespace', 'entity', 'branchId', 'entityId'] }
  ]
})
export class RxDBSyncBucketRow {
  id!: string;
  namespace!: string;
  entity!: string;
  branchId!: string;
  bucket!: string;
  filterFingerprint!: string;
  entityId!: string;
  snapshotRunId!: string | null;
}

import {
  Entity,
  EntityBase,
  PropertyType,
  SyncType,
  type RxDB,
  type RxDBEvent,
  type TransactionExecutor
} from '@aiao/rxdb';
import { publicProvider } from '../app/local-provider';
import { validateGenerationJobSummary } from '../contracts/index';
import { validateAudioSubmissionBook } from './audio-submissions';
import { validateNotebook } from './draft-notebook';
import { validateImageSubmissionBook } from './image-submissions';
import { localRepository } from './local-repository';
import { validateVideoSubmissionBook } from './video-submissions';

export type LocalCollection =
  'providers' | 'tasks' | 'drafts' | 'image-submissions' | 'audio-submissions' | 'video-submissions';
export interface CollectionEntry {
  sourceId: string;
  payload: string;
  position: number;
  status: string;
  providerId: string;
}
@Entity({
  name: 'LocalCollectionRecord',
  tableName: 'local_collection_record',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'collection', type: PropertyType.string, required: true },
    { name: 'sourceId', type: PropertyType.string, required: true },
    { name: 'payload', type: PropertyType.string, required: true },
    { name: 'position', type: PropertyType.integer, required: true },
    { name: 'status', type: PropertyType.string, required: true },
    { name: 'providerId', type: PropertyType.string, required: true }
  ],
  indexes: [
    { name: 'local_collection_source', properties: ['collection', 'sourceId'], unique: true },
    { name: 'local_collection_status', properties: ['collection', 'status'] },
    { name: 'local_collection_provider', properties: ['collection', 'providerId'] }
  ]
})
export class LocalCollectionRecord extends EntityBase implements CollectionEntry {
  collection!: LocalCollection;
  sourceId!: string;
  payload!: string;
  position!: number;
  status!: string;
  providerId!: string;
}
@Entity({
  name: 'LocalCollectionCheckpoint',
  tableName: 'local_collection_checkpoint',
  namespace: 'media',
  log: false,
  sync: { type: SyncType.None },
  properties: [
    { name: 'collection', type: PropertyType.string, required: true },
    { name: 'sourceRevision', type: PropertyType.integer, required: true }
  ],
  indexes: [{ name: 'local_collection_checkpoint_name', properties: ['collection'], unique: true }]
})
export class LocalCollectionCheckpoint extends EntityBase {
  collection!: LocalCollection;
  sourceRevision!: number;
}

export function decodeCollection(collection: LocalCollection, payload: string): CollectionEntry[] {
  const source: unknown = JSON.parse(payload);
  const rows: { id: string; value: unknown; status?: string; providerId?: string }[] = [];
  if (collection === 'providers') {
    const value = source as { providers: unknown[]; defaultId: string };
    if (!value || !Array.isArray(value.providers) || value.providers.length > 30 || typeof value.defaultId !== 'string')
      throw new Error('供应商目录不可读。');
    for (const input of value.providers) {
      const provider = publicProvider(input);
      rows.push({ id: provider.id, value: provider });
    }
  }
  if (collection === 'tasks') {
    if (!Array.isArray(source) || source.length > 100) throw new Error('任务目录不可读。');
    for (const value of source) {
      if (!value || typeof value !== 'object') throw new Error('本机任务无效。');
      const { saved, acknowledged, ...input } = value;
      if ([saved, acknowledged].some(flag => flag !== undefined && typeof flag !== 'boolean'))
        throw new Error('任务状态无效。');
      const task = validateGenerationJobSummary(input);
      rows.push({
        id: task.id,
        value: {
          ...task,
          ...(saved === undefined ? {} : { saved }),
          ...(acknowledged === undefined ? {} : { acknowledged })
        },
        status: task.status,
        providerId: task.request.providerInstanceId
      });
    }
  }
  if (collection === 'drafts')
    for (const draft of validateNotebook(source).drafts)
      rows.push({
        id: draft.id,
        value: draft,
        status:
          draft.deleted ? 'deleted'
          : draft.conflict ? 'conflict'
          : draft.dirty ? 'dirty'
          : 'saved'
      });
  if (collection === 'image-submissions')
    for (const submission of validateImageSubmissionBook(source).submissions)
      rows.push({
        id: submission.id,
        value: submission,
        status: submission.firstSentAt ? 'sent' : 'prepared',
        providerId: submission.selection.providerInstanceId
      });
  if (collection === 'audio-submissions' || collection === 'video-submissions') {
    const pending =
      collection === 'audio-submissions' ?
        validateAudioSubmissionBook(source).pending
      : validateVideoSubmissionBook(source).pending;
    if (pending)
      rows.push({
        id: pending.key,
        value: pending,
        status: pending.firstSentAt ? 'sent' : 'prepared',
        providerId: pending.request.providerInstanceId
      });
  }
  const ids = new Set(rows.map(row => row.id));
  if (ids.size !== rows.length) throw new Error('旧集合包含重复标识；未迁移或删除原数据。');
  return rows.map((row, position) => ({
    sourceId: row.id,
    payload: JSON.stringify(row.value),
    position,
    status: row.status ?? '',
    providerId: row.providerId ?? ''
  }));
}

/** 在同一事务内导入旧集合；旧表继续作为兼容快照保留。 */
export async function projectCollection(
  db: RxDB,
  executor: TransactionExecutor,
  events: RxDBEvent[],
  collection: LocalCollection,
  payload: string,
  revision: number
): Promise<void> {
  const checkpoints = localRepository(
    LocalCollectionCheckpoint,
    executor.getRepository(LocalCollectionCheckpoint),
    event => events.push(event)
  );
  const where = {
    combinator: 'and' as const,
    rules: [{ field: 'collection' as const, operator: '=' as const, value: collection }]
  };
  const [checkpoint] = await checkpoints.find({ where });
  if (checkpoint?.sourceRevision === revision) return;
  const entries = decodeCollection(collection, payload);
  const repository = localRepository(LocalCollectionRecord, executor.getRepository(LocalCollectionRecord), event =>
    events.push(event)
  );
  const existing = await repository.find({ where, limit: 1000 });
  for (const entry of entries) {
    const old = existing.find(row => row.sourceId === entry.sourceId);
    if (!old) await repository.create(db.entityManager.instantiate(LocalCollectionRecord, { ...entry, collection }));
    else if (old.payload !== entry.payload || old.position !== entry.position) await repository.update(old, entry);
  }
  for (const old of existing) if (!entries.some(entry => entry.sourceId === old.sourceId)) await repository.remove(old);
  if (checkpoint) await checkpoints.update(checkpoint, { sourceRevision: revision });
  else
    await checkpoints.create(
      db.entityManager.instantiate(LocalCollectionCheckpoint, { collection, sourceRevision: revision })
    );
}

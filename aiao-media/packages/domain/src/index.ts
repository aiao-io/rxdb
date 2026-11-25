export type MediaKind = 'image' | 'audio' | 'video';
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type WorkspaceId = string & { readonly __brand: 'WorkspaceId' };
export type MediaId = string & { readonly __brand: 'MediaId' };

export interface GenerationEntity {
  id: MediaId;
  workspaceId: WorkspaceId;
  kind: MediaKind;
  status: GenerationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInstance {
  id: string;
  name: string;
  baseUrl: string;
  enabled: boolean;
}

export {
  MEDIA_CONFIG_COMMIT_OPERATIONS,
  MEDIA_CONFIG_COMMIT_STATUSES,
  MEDIA_TEMPLATE_PUBLICATION_FIELDS,
  MediaConfigCommit,
  MediaConfigCommitChange,
  MediaPlatformModel,
  MediaPromptTemplate,
  MediaProviderPolicy,
  assertValidMediaConfigCommit,
  canTransitionMediaConfigCommit,
  createMediaConfigChangeFingerprint,
  createMediaConfigCommitEnvelope,
  createMediaConfigCommitFingerprint,
  type MediaConfigCommitChangeInput,
  type MediaConfigCommitEnvelope,
  type MediaConfigCommitInput,
  type MediaConfigCommitOperation,
  type MediaConfigCommitStatus
} from './media-config.js';

export { MEDIA_SYNC_RECORD_KINDS, MediaSyncRecord, type MediaSyncRecordKind } from './media-sync-record.js';

export {
  MEDIA_CONFIG_SYNC_ENTITIES,
  MEDIA_CONFIG_VERSIONED_ENTITIES,
  assertMediaConfigSyncEntities,
  createMediaConfigSyncOptions,
  templateAttributionMigration,
  type MediaConfigSyncAdapters,
  type MediaConfigSyncPlan,
  type MediaConfigSyncPlanOptions
} from './config-sync.js';

export function domain(): string {
  return 'aiao-media';
}

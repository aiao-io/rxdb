/** Draft metadata only. Local file IDs, paths, image bytes and credentials never belong here. */
export interface SyncedDraftContent {
  kind: 'image' | 'audio' | 'video';
  prompt: string;
  requiresReference: boolean;
  parameters: {
    providerInstanceId?: string;
    modelId?: string;
    operation?: 'text-to-image' | 'reference-image';
  };
}
export interface SyncedDraft {
  id: string;
  revision: number;
  sequence: number;
  deleted: boolean;
  content: SyncedDraftContent | null;
  updatedAt: string;
}
export interface DraftSyncMutation {
  version: 1;
  mutationId: string;
  draftId: string;
  baseRevision: number;
  deleted: boolean;
  content: SyncedDraftContent | null;
}
export interface DraftSyncConflict {
  id: string;
  draftId: string;
  local: DraftSyncMutation;
  /** Remote version at the time of conflict, retained even after another edit. */
  remote: SyncedDraft | null;
  createdAt: string;
}
export type DraftSyncPushResult =
  | { version: 1; status: 'applied'; draft: SyncedDraft; reused: boolean }
  | {
      version: 1;
      status: 'conflict';
      conflict: DraftSyncConflict;
      reused: boolean;
    };
export interface DraftSyncPullRequest {
  version: 1;
  checkpoint: string | null;
}
export interface DraftSyncPullResult {
  version: 1;
  /** Full current metadata snapshot, including retained tombstones. Never discard dirty local edits. */
  reset: boolean;
  drafts: SyncedDraft[];
  checkpoint: string;
  hasMore: boolean;
}
export interface DraftSyncConflictView extends DraftSyncConflict {
  currentRemote: SyncedDraft | null;
}
export interface DraftSyncResolution {
  version: 1;
  choice: 'local' | 'remote';
  expectedRemoteRevision: number;
}
export interface DraftSyncResolutionResult {
  version: 1;
  conflictId: string;
  choice: 'local' | 'remote';
  draft: SyncedDraft | null;
  resolvedAt: string;
  reused: boolean;
}

export const mediaKinds = ['image', 'audio', 'video'] as const;
export type MediaKind = (typeof mediaKinds)[number];
export interface GenerationRequest {
  kind: MediaKind;
  prompt: string;
}
export type GenerationStatus = 'queued' | 'processing' | 'completed' | 'failed';
export interface Generation {
  id: string;
  kind: MediaKind;
  prompt: string;
  status: GenerationStatus;
  createdAt: string;
}
export function isGenerationRequest(input: unknown): input is GenerationRequest {
  if (typeof input !== 'object' || input === null) return false;
  const value = input as Record<string, unknown>;
  return (
    mediaKinds.some(kind => kind === value['kind']) &&
    typeof value['prompt'] === 'string' &&
    value['prompt'].trim().length > 0 &&
    value['prompt'].length <= 4000
  );
}

export type {
  GenerationDeliveryStatus,
  GenerationFailureCategory,
  GenerationJobFailure,
  GenerationJobStatus,
  GenerationJobSummary,
  GenerationReconciliation,
  GenerationReviewItem,
  GenerationReviewRequest,
  ImageJobRequest,
  ReferenceImageUpload
} from './generation-jobs';

export type {
  DraftSyncConflict,
  DraftSyncConflictView,
  DraftSyncMutation,
  DraftSyncPullRequest,
  DraftSyncPullResult,
  DraftSyncPushResult,
  DraftSyncResolution,
  DraftSyncResolutionResult,
  SyncedDraft,
  SyncedDraftContent
} from './draft-sync';
export {
  DraftSyncProtocolError,
  validateDraftConflicts,
  validateDraftContent,
  validateDraftMutation,
  validateDraftPull,
  validateDraftPush,
  validateDraftResolution,
  validateSyncedDraft
} from './draft-sync-validation';

export { REFERENCE_IMAGE_MAX_BYTES } from './generation-jobs';
export type { ImageGenerationOption } from './generation-jobs';
export {
  GenerationProtocolError,
  isGenerationUuid,
  validateGenerationJobSummary,
  validateImageGenerationOptions,
  validateImageJobRequest,
  validateReferenceImageUpload
} from './generation-validation';

export { AUDIO_DURATION_MAX_MS, AUDIO_TEXT_MAX_LENGTH, AUDIO_WAV_MAX_BYTES } from './generation-jobs';
export type {
  AudioGenerationJobSummary,
  AudioGenerationOption,
  AudioJobRequest,
  AudioResultMetadata,
  GenerationJobRequest,
  MediaGenerationJobSummary
} from './generation-jobs';
export {
  validateAudioGenerationJobSummary,
  validateAudioGenerationOptions,
  validateAudioJobRequest,
  validateAudioResultMetadata
} from './generation-validation';

export { VIDEO_MP4_MAX_BYTES, VIDEO_TEXT_MAX_LENGTH } from './generation-jobs';
export type {
  VideoGenerationJobSummary,
  VideoGenerationOption,
  VideoJobRequest,
  VideoResultMetadata
} from './generation-jobs';
export {
  validateVideoGenerationJobSummary,
  validateVideoGenerationOptions,
  validateVideoJobRequest,
  validateVideoResultMetadata
} from './generation-validation';

export { IMAGE_PROMPT_MAX_LENGTH } from './generation-jobs';
export type { ImageAspectRatio } from './generation-jobs';

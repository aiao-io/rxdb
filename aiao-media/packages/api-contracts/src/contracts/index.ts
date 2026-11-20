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
  AsrGenerationJobSummary,
  AsrGenerationOption,
  AsrJobRequest,
  AudioGenerationJobSummary,
  AudioGenerationOption,
  AudioInputReference,
  AudioJobRequest,
  AudioResultManifest,
  AudioResultMetadata,
  GenerationJobRequest,
  GenerationJobSummary,
  GenerationReconciliation,
  GenerationReviewItem,
  GenerationReviewRequest,
  ImageJobRequest,
  LegacyAudioJobRequest,
  LegacyMusicJobRequest,
  MediaGenerationJobSummary,
  MusicGenerationJobSummary,
  MusicGenerationOption,
  MusicJobRequest,
  MusicJobRequestWithParameters,
  ReferenceImageUpload,
  TextToSpeechJobRequest,
  TranscriptResult,
  VideoGenerationJobSummary,
  VideoGenerationOption,
  VideoJobRequest,
  VideoParameters,
  TextToVideoJobRequest,
  LegacyVideoJobRequest,
  VideoResultManifest,
  VideoResultMetadata
} from './generation-jobs.ts';

export {
  DraftSyncProtocolError,
  validateDraftConflicts,
  validateDraftContent,
  validateDraftMutation,
  validateDraftPull,
  validateDraftPush,
  validateDraftResolution,
  validateSyncedDraft
} from './draft-sync-validation.ts';
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
} from './draft-sync.ts';

export { REFERENCE_IMAGE_MAX_BYTES } from './generation-jobs.ts';
export type { ImageGenerationOption } from './generation-jobs.ts';
export {
  GenerationProtocolError,
  isGenerationUuid,
  validateGenerationJobRequest,
  validateGenerationJobSummary,
  validateImageGenerationJobSummary,
  validateImageGenerationOptions,
  validateImageJobRequest,
  validateReferenceImageUpload
} from './generation-validation.ts';

export {
  ASR_AUDIO_DURATION_MAX_MS,
  ASR_AUDIO_MAX_BYTES,
  AUDIO_DURATION_MAX_MS,
  AUDIO_TEXT_MAX_LENGTH,
  AUDIO_WAV_MAX_BYTES,
  MUSIC_AUDIO_MAX_BYTES,
  MUSIC_DURATION_MAX_MS,
  MUSIC_TEXT_MAX_LENGTH
} from './generation-jobs.ts';
export {
  validateAsrGenerationJobSummary,
  validateAsrGenerationOptions,
  validateAsrJobRequest,
  validateAudioGenerationJobSummary,
  validateAudioGenerationOptions,
  validateAudioInputReference,
  validateAudioJobRequest,
  validateAudioResultMetadata,
  validateMusicGenerationJobSummary,
  validateMusicGenerationOptions,
  validateMusicJobRequest,
  validateTranscriptResult
} from './generation-validation.ts';

export { VIDEO_DURATION_MAX_MS, VIDEO_MP4_MAX_BYTES, VIDEO_TEXT_MAX_LENGTH } from './generation-jobs.ts';
export {
  validateVideoGenerationJobSummary,
  validateVideoGenerationOptions,
  validateVideoJobRequest,
  validateVideoResultMetadata
} from './generation-validation.ts';

export { IMAGE_PROMPT_MAX_LENGTH } from './generation-jobs.ts';
export type { ImageAspectRatio } from './generation-jobs.ts';
export * from './media-capabilities.ts';

/** Public task metadata only: no credentials, temporary file paths or upstream URLs. */
export type GenerationJobStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'needs_review' | 'cancelled';
export type GenerationDeliveryStatus = 'pending' | 'available' | 'acknowledged' | 'expired' | 'unavailable';
export type GenerationFailureCategory =
  | 'authentication'
  | 'rate_limit'
  | 'model_or_capability'
  | 'timeout'
  | 'upstream_unavailable'
  | 'quota'
  | 'content_policy'
  | 'invalid_request'
  | 'capability_revoked'
  | 'reference_unavailable'
  | 'delivery_failed'
  | 'dispatch_uncertain'
  | 'reconciled_not_generated'
  | 'reconciled_delivery_unavailable';
export interface GenerationJobFailure {
  category: GenerationFailureCategory;
  retryable: boolean;
  providerRequestId?: string;
}
/** Server-side private reference spool; local originals are never deleted by this lifecycle. */
export const REFERENCE_IMAGE_MAX_BYTES = 4 * 1024 * 1024;
export interface ReferenceImageUpload {
  id: string;
  mediaType: 'image/png';
  bytes: number;
  width: number;
  height: number;
  expiresAt: string;
}
export type ImageAspectRatio = 'square' | 'landscape' | 'portrait';
export const IMAGE_PROMPT_MAX_LENGTH = 2000;
interface ImageJobSelection {
  kind: 'image';
  aspectRatio?: ImageAspectRatio;
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  prompt: string;
}
/** Opaque upload id only: remote URLs, file paths and inline base64 are not accepted. */
export type ImageJobRequest = ImageJobSelection &
  ({ operation: 'text-to-image' } | { operation: 'reference-image'; referenceImageId: string });
/** Fixed speech output profile; arbitrary voices, formats and tuning knobs are not accepted. */
export const AUDIO_TEXT_MAX_LENGTH = 500;
export const AUDIO_WAV_MAX_BYTES = 8 * 1024 * 1024;
export const AUDIO_DURATION_MAX_MS = 120_000;
export interface AudioJobRequest {
  kind: 'audio';
  operation: 'text-to-speech';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  voiceId: string;
  profileId: string;
  prompt: string;
}
export const VIDEO_TEXT_MAX_LENGTH = 1000;
export const VIDEO_MP4_MAX_BYTES = 64 * 1024 * 1024;
export interface VideoJobRequest {
  kind: 'video';
  operation: 'text-to-video';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  profileId: string;
  prompt: string;
}
export interface VideoResultMetadata {
  mediaType: 'video/mp4';
  format: 'mp4';
  codec: 'h264';
  width: number;
  height: number;
  durationMs: number;
  bytes: number;
}
export interface VideoGenerationOption {
  providerInstanceId: string;
  providerRevision: number;
  providerName: string;
  providerType: 'minimax';
  modelId: string;
  operation: 'text-to-video';
  profileId: string;
  maxTextLength: number;
  durationSeconds: 5;
  resolution: '768P';
  ratio: '16:9';
  format: 'mp4';
}
export type GenerationJobRequest = ImageJobRequest | AudioJobRequest | VideoJobRequest;
export interface AudioResultMetadata {
  mediaType: 'audio/wav';
  format: 'wav';
  durationMs: number;
  sampleRate: 32000;
  channels: 1;
  bytes: number;
}
export interface AudioGenerationOption {
  providerInstanceId: string;
  providerRevision: number;
  providerName: string;
  providerType: 'minimax';
  modelId: string;
  operation: 'text-to-speech';
  voiceId: string;
  voiceLabel: string;
  profileId: string;
  maxTextLength: number;
  format: 'wav';
  sampleRate: 32000;
  channels: 1;
}
export interface GenerationJobSummary<R extends GenerationJobRequest = ImageJobRequest> {
  id: string;
  request: R;
  status: GenerationJobStatus;
  createdAt: string;
  updatedAt: string;
  delivery: {
    status: GenerationDeliveryStatus;
    expiresAt: string | null;
    acknowledgedAt: string | null;
  };
  failure: GenerationJobFailure | null;
  /** Sanitized provider correlation id, not a credential or upstream URL. */
  providerRequestId?: string;
}

/** Operational metadata only: never prompt text, lease tokens, credentials or file paths. */
export interface GenerationReviewItem {
  id: string;
  userId: string;
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  operation: GenerationJobRequest['operation'];
  updatedAt: string;
  dispatchStartedAt: string | null;
  failureCategory: GenerationFailureCategory;
  providerRequestId: string | null;
}
export interface GenerationReviewRequest {
  expectedUpdatedAt: string;
  outcome: 'not_generated' | 'generated_without_result';
  /** SHA-256 of an operator-verified provider receipt, not the receipt itself. */
  evidenceDigest: string;
  providerRequestId?: string;
  confirmed: true;
}
export interface GenerationReconciliation {
  jobId: string;
  actorId: string;
  observedUpdatedAt: string;
  outcome: GenerationReviewRequest['outcome'];
  evidenceDigest: string;
  providerRequestId: string | null;
  createdAt: string;
}

/** Creator-safe catalog. Only a backend with verified instance/model/operation evidence may publish entries. */
export interface ImageGenerationOption {
  providerInstanceId: string;
  providerRevision: number;
  providerName: string;
  providerType: 'minimax' | 'openai';
  modelId: string;
  operations: (
    | { operation: 'text-to-image'; label: string }
    | {
        operation: 'reference-image';
        label: string;
        referenceSemantics: 'edit' | 'style' | 'subject';
      }
  )[];
}

export interface AudioGenerationJobSummary extends GenerationJobSummary<AudioJobRequest> {
  /** Actual canonical PCM sample metadata, never an upstream playback URL. */
  result: AudioResultMetadata | null;
}
export interface VideoGenerationJobSummary extends GenerationJobSummary<VideoJobRequest> {
  result: VideoResultMetadata | null;
}
export type MediaGenerationJobSummary = GenerationJobSummary | AudioGenerationJobSummary | VideoGenerationJobSummary;

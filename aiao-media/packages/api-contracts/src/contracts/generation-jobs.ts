/** 任务公开元数据，不包含凭据、临时路径或供应商 URL。 */
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
/** 服务端私有引用暂存，生命周期不会删除本机原文件。 */
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
  aspectRatioValue?: string;
  resolution?: string;
  size?: string;
  quality?: string;
  complexity?: string;
  thinkingLevel?: string;
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  prompt: string;
}
/** 只接受不透明上传 ID，不接受远程 URL、文件路径和内联 base64。 */
export type ImageJobRequest = ImageJobSelection &
  (
    | { operation: 'text-to-image' }
    | { operation: 'reference-image'; referenceImageId?: string; referenceImageSource?: 'inline' }
  );
export const AUDIO_TEXT_MAX_LENGTH = 500;
export const AUDIO_WAV_MAX_BYTES = 8 * 1024 * 1024;
export const AUDIO_DURATION_MAX_MS = 120_000;
export const MUSIC_TEXT_MAX_LENGTH = 1000;
export const MUSIC_AUDIO_MAX_BYTES = 32 * 1024 * 1024;
export const MUSIC_DURATION_MAX_MS = 300_000;
export const ASR_AUDIO_MAX_BYTES = 16 * 1024 * 1024;
export const ASR_AUDIO_DURATION_MAX_MS = 600_000;
interface AudioJobSelection {
  kind: 'audio';
  operation: 'text-to-speech';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
}
/** 新版 TTS 请求，字段与能力目录中的可选参数一一对应。 */
export interface TextToSpeechJobRequest extends AudioJobSelection {
  language: string;
  voiceId: string;
  speed: number;
  text: string;
  profileId?: string;
}
/** 旧版 TTS 请求，保留用于读取已有任务和本机提交日志。 */
export interface LegacyAudioJobRequest extends AudioJobSelection {
  voiceId: string;
  profileId: string;
  prompt: string;
}
export type AudioJobRequest = TextToSpeechJobRequest | LegacyAudioJobRequest;
export interface MusicParameters {
  durationSeconds: number;
  instrumental: boolean;
}
export interface MusicJobRequestWithParameters {
  kind: 'audio';
  operation: 'text-to-music';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  prompt: string;
  parameters: MusicParameters;
  profileId?: string;
}
/** 早期音乐请求的扁平字段形式，读取时继续支持。 */
export interface LegacyMusicJobRequest {
  kind: 'audio';
  operation: 'text-to-music';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  profileId: string;
  prompt: string;
  durationSeconds: number;
  instrumental: boolean;
}
export type MusicJobRequest = MusicJobRequestWithParameters | LegacyMusicJobRequest;
export interface AudioInputReference {
  id: string;
  mediaType: 'audio/wav';
  bytes: number;
  durationMs: number;
  sha256: string;
  expiresAt: string;
}
export interface AsrJobRequest {
  kind: 'audio';
  operation: 'speech-to-text';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  language: string | null;
  input: AudioInputReference;
  profileId?: string;
}
export const VIDEO_TEXT_MAX_LENGTH = 1000;
export const VIDEO_MP4_MAX_BYTES = 64 * 1024 * 1024;
export const VIDEO_DURATION_MAX_MS = 300_000;
export interface VideoParameters {
  ratio: string;
  durationSeconds: number;
  resolution: string;
}
export interface TextToVideoJobRequest {
  kind: 'video';
  operation: 'text-to-video';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  prompt: string;
  parameters: VideoParameters;
  profileId?: string;
}
/** 旧版视频请求，保留用于读取已有任务。 */
export interface LegacyVideoJobRequest {
  kind: 'video';
  operation: 'text-to-video';
  providerInstanceId: string;
  providerRevision: number;
  modelId: string;
  profileId: string;
  prompt: string;
}
export type VideoJobRequest = TextToVideoJobRequest | LegacyVideoJobRequest;
export interface LegacyVideoResultMetadata {
  mediaType: 'video/mp4';
  format: 'mp4';
  codec: 'h264';
  width: number;
  height: number;
  durationMs: number;
  bytes: number;
}
export interface VideoResultManifest extends LegacyVideoResultMetadata {
  kind: 'video';
  sha256: string;
}
export type VideoResultMetadata = LegacyVideoResultMetadata | VideoResultManifest;
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
export interface MusicGenerationOption {
  providerInstanceId: string;
  providerRevision: number;
  providerName: string;
  providerType: 'minimax' | 'openai';
  modelId: string;
  operation: 'text-to-music';
  profileId: string;
  maxTextLength: number;
  durationsSeconds: number[];
  formats: ['wav'];
}
export interface AsrGenerationOption {
  providerInstanceId: string;
  providerRevision: number;
  providerName: string;
  providerType: 'minimax' | 'openai';
  modelId: string;
  operation: 'speech-to-text';
  profileId: string;
  inputMediaTypes: ['audio/wav'];
  maxInputBytes: number;
  maxDurationMs: number;
  languages: string[];
}
export type GenerationJobRequest = ImageJobRequest | AudioJobRequest | MusicJobRequest | AsrJobRequest | VideoJobRequest;
export interface LegacyAudioResultMetadata {
  mediaType: 'audio/wav';
  format: 'wav';
  durationMs: number;
  sampleRate: 32000;
  channels: 1;
  bytes: number;
}
export interface AudioResultManifest extends LegacyAudioResultMetadata {
  kind: 'audio';
  sha256: string;
}
export type AudioResultMetadata = LegacyAudioResultMetadata | AudioResultManifest;
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
  languages?: string[];
  speeds?: number[];
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
  /** 清洗后的供应商关联 ID，不是凭据或上游 URL。 */
  providerRequestId?: string;
}
/** 运行审查元数据，不包含提示词、租约 token、凭据或文件路径。 */
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
  /** 操作员核验回执的 SHA-256，不保存回执原文。 */
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
/** 只有后端验证过实例、模型和 operation 后才能发布的图片目录项。 */
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
  result: AudioResultMetadata | null;
}
export interface MusicGenerationJobSummary extends GenerationJobSummary<MusicJobRequest> {
  result: AudioResultMetadata | null;
}
export interface AsrGenerationJobSummary extends GenerationJobSummary<AsrJobRequest> {
  result: TranscriptResult | null;
}
export interface VideoGenerationJobSummary extends GenerationJobSummary<VideoJobRequest> {
  result: VideoResultMetadata | null;
}
export interface TranscriptResult {
  kind: 'transcript';
  text: string;
  language: string;
  detectedLanguage: boolean;
  characters: number;
  sha256: string;
}
export type MediaGenerationJobSummary =
  | GenerationJobSummary
  | AudioGenerationJobSummary
  | MusicGenerationJobSummary
  | AsrGenerationJobSummary
  | VideoGenerationJobSummary;

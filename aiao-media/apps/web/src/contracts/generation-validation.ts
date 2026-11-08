import {
  AUDIO_DURATION_MAX_MS,
  AUDIO_TEXT_MAX_LENGTH,
  AUDIO_WAV_MAX_BYTES,
  REFERENCE_IMAGE_MAX_BYTES,
  VIDEO_MP4_MAX_BYTES,
  VIDEO_TEXT_MAX_LENGTH,
  type AudioGenerationJobSummary,
  type AudioGenerationOption,
  type AudioJobRequest,
  type AudioResultMetadata,
  type GenerationJobSummary,
  type ImageGenerationOption,
  type ImageJobRequest,
  type MediaGenerationJobSummary,
  type ReferenceImageUpload,
  type VideoGenerationJobSummary,
  type VideoGenerationOption,
  type VideoJobRequest,
  type VideoResultMetadata
} from './generation-jobs';

export class GenerationProtocolError extends Error {
  constructor() {
    super('媒体任务协议无效；未接受请求或确认结果。');
    this.name = 'GenerationProtocolError';
  }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const model = /^[a-zA-Z0-9._:-]{1,128}$/;
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new GenerationProtocolError();
  return value as Record<string, unknown>;
};
const keys = (input: Record<string, unknown>, required: string[], optional: string[] = []) => {
  if (
    required.some(key => !Object.prototype.hasOwnProperty.call(input, key)) ||
    Object.keys(input).some(key => ![...required, ...optional].includes(key))
  )
    throw new GenerationProtocolError();
};
const integer = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
export const isGenerationUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
export const isGenerationTimestamp = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length <= 40 &&
  /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(value) &&
  Number.isFinite(Date.parse(value));
export function validateImageJobRequest(value: unknown): ImageJobRequest {
  const input = object(value);
  keys(
    input,
    ['kind', 'operation', 'providerInstanceId', 'providerRevision', 'modelId', 'prompt'],
    input['operation'] === 'reference-image' ? ['referenceImageId', 'aspectRatio'] : ['aspectRatio']
  );
  if (
    input['kind'] !== 'image' ||
    !['text-to-image', 'reference-image'].includes(String(input['operation'])) ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    typeof input['prompt'] !== 'string' ||
    !input['prompt'].trim() ||
    input['prompt'].length > 4000 ||
    (input['aspectRatio'] !== undefined &&
      !['square', 'landscape', 'portrait'].includes(String(input['aspectRatio']))) ||
    (input['operation'] === 'reference-image' && !isGenerationUuid(input['referenceImageId']))
  )
    throw new GenerationProtocolError();
  // Preserve the existing canonical byte order: persisted idempotency hashes
  // from earlier releases must still replay after a contracts-only upgrade.
  return {
    kind: 'image',
    ...(input['operation'] === 'reference-image' ?
      {
        operation: 'reference-image' as const,
        referenceImageId: input['referenceImageId'] as string
      }
    : { operation: 'text-to-image' as const }),
    providerInstanceId: input['providerInstanceId'],
    providerRevision: input['providerRevision'] as number,
    modelId: input['modelId'],
    prompt: input['prompt'].trim(),
    ...(input['aspectRatio'] !== undefined ?
      { aspectRatio: input['aspectRatio'] as ImageJobRequest['aspectRatio'] }
    : {})
  };
}
export function validateReferenceImageUpload(value: unknown): ReferenceImageUpload {
  const input = object(value);
  keys(input, ['id', 'mediaType', 'bytes', 'width', 'height', 'expiresAt']);
  if (
    !isGenerationUuid(input['id']) ||
    input['mediaType'] !== 'image/png' ||
    !integer(input['bytes'], REFERENCE_IMAGE_MAX_BYTES) ||
    !integer(input['width'], 2048) ||
    !integer(input['height'], 2048) ||
    !isGenerationTimestamp(input['expiresAt'])
  )
    throw new GenerationProtocolError();
  return structuredClone(input) as unknown as ReferenceImageUpload;
}
export function validateImageGenerationOptions(value: unknown): ImageGenerationOption[] {
  if (!Array.isArray(value) || value.length > 200) throw new GenerationProtocolError();
  const seen = new Set<string>();
  const label = (v: unknown) =>
    typeof v === 'string' &&
    !!v.trim() &&
    v.length <= 80 &&
    ![...v].some(char => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127);
  for (const entry of value) {
    const input = object(entry);
    keys(input, ['providerInstanceId', 'providerRevision', 'providerName', 'providerType', 'modelId', 'operations']);
    if (
      !isGenerationUuid(input['providerInstanceId']) ||
      !integer(input['providerRevision'], 2_147_483_647) ||
      !label(input['providerName']) ||
      !['minimax', 'openai'].includes(String(input['providerType'])) ||
      typeof input['modelId'] !== 'string' ||
      !model.test(input['modelId']) ||
      !Array.isArray(input['operations']) ||
      !input['operations'].length ||
      input['operations'].length > 2
    )
      throw new GenerationProtocolError();
    const identity = `${input['providerInstanceId']}/${input['modelId']}`;
    if (seen.has(identity)) throw new GenerationProtocolError();
    seen.add(identity);
    const operations = new Set<string>();
    for (const item of input['operations']) {
      const operation = object(item);
      keys(
        operation,
        ['operation', 'label'],
        operation['operation'] === 'reference-image' ? ['referenceSemantics'] : []
      );
      if (
        !label(operation['label']) ||
        !['text-to-image', 'reference-image'].includes(String(operation['operation'])) ||
        (operation['operation'] === 'reference-image' &&
          !['edit', 'style', 'subject'].includes(String(operation['referenceSemantics']))) ||
        operations.has(String(operation['operation']))
      )
        throw new GenerationProtocolError();
      operations.add(String(operation['operation']));
    }
  }
  return structuredClone(value);
}
const failureCategories = [
  'authentication',
  'rate_limit',
  'model_or_capability',
  'timeout',
  'upstream_unavailable',
  'quota',
  'content_policy',
  'invalid_request',
  'capability_revoked',
  'reference_unavailable',
  'delivery_failed',
  'dispatch_uncertain',
  'reconciled_not_generated',
  'reconciled_delivery_unavailable'
];
function validateJobSummary(value: unknown, kind: 'image' | 'audio' | 'video'): MediaGenerationJobSummary {
  const audio = kind === 'audio';
  const video = kind === 'video';
  const input = object(value);
  keys(
    input,
    ['id', 'request', 'status', 'createdAt', 'updatedAt', 'delivery', 'failure'],
    audio || video ? ['providerRequestId', 'result'] : ['providerRequestId']
  );
  const request =
    video ? validateVideoJobRequest(input['request'])
    : audio ? validateAudioJobRequest(input['request'])
    : validateImageJobRequest(input['request']);
  if (audio || video) {
    if (!Object.prototype.hasOwnProperty.call(input, 'result')) throw new GenerationProtocolError();
    if (input['result'] !== null) {
      if (video) validateVideoResultMetadata(input['result']);
      else validateAudioResultMetadata(input['result']);
    }
    if ((input['status'] === 'completed') !== (input['result'] !== null)) throw new GenerationProtocolError();
  }
  const correlation = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
  if (
    !isGenerationUuid(input['id']) ||
    !['queued', 'processing', 'completed', 'failed', 'needs_review', 'cancelled'].includes(String(input['status'])) ||
    !isGenerationTimestamp(input['createdAt']) ||
    !isGenerationTimestamp(input['updatedAt']) ||
    (Object.prototype.hasOwnProperty.call(input, 'providerRequestId') && !correlation(input['providerRequestId']))
  )
    throw new GenerationProtocolError();
  const delivery = object(input['delivery']);
  keys(delivery, ['status', 'expiresAt', 'acknowledgedAt']);
  if (
    !['pending', 'available', 'acknowledged', 'expired', 'unavailable'].includes(String(delivery['status'])) ||
    (delivery['expiresAt'] !== null && !isGenerationTimestamp(delivery['expiresAt'])) ||
    (delivery['acknowledgedAt'] !== null && !isGenerationTimestamp(delivery['acknowledgedAt']))
  )
    throw new GenerationProtocolError();
  if (input['failure'] !== null) {
    const failure = object(input['failure']);
    keys(failure, ['category', 'retryable'], ['providerRequestId']);
    if (
      !failureCategories.includes(String(failure['category'])) ||
      typeof failure['retryable'] !== 'boolean' ||
      (Object.prototype.hasOwnProperty.call(failure, 'providerRequestId') && !correlation(failure['providerRequestId']))
    )
      throw new GenerationProtocolError();
  }
  return {
    ...structuredClone(input),
    request
  } as unknown as MediaGenerationJobSummary;
}

export function validateGenerationJobSummary(value: unknown): GenerationJobSummary {
  return validateJobSummary(value, 'image') as GenerationJobSummary;
}
export function validateAudioGenerationJobSummary(value: unknown): AudioGenerationJobSummary {
  return validateJobSummary(value, 'audio') as AudioGenerationJobSummary;
}
export function validateAudioJobRequest(value: unknown): AudioJobRequest {
  const input = object(value);
  keys(input, [
    'kind',
    'operation',
    'providerInstanceId',
    'providerRevision',
    'modelId',
    'voiceId',
    'profileId',
    'prompt'
  ]);
  if (
    input['kind'] !== 'audio' ||
    input['operation'] !== 'text-to-speech' ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    typeof input['voiceId'] !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(input['voiceId']) ||
    typeof input['profileId'] !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input['profileId']) ||
    typeof input['prompt'] !== 'string' ||
    !input['prompt'].trim() ||
    input['prompt'].length > AUDIO_TEXT_MAX_LENGTH
  )
    throw new GenerationProtocolError();
  return {
    kind: 'audio',
    operation: 'text-to-speech',
    providerInstanceId: input['providerInstanceId'],
    providerRevision: input['providerRevision'] as number,
    modelId: input['modelId'],
    voiceId: input['voiceId'],
    profileId: input['profileId'],
    prompt: input['prompt'].trim()
  };
}
export function validateAudioResultMetadata(value: unknown): AudioResultMetadata {
  const input = object(value);
  keys(input, ['mediaType', 'format', 'durationMs', 'sampleRate', 'channels', 'bytes']);
  const duration = input['durationMs'];
  if (
    input['mediaType'] !== 'audio/wav' ||
    input['format'] !== 'wav' ||
    input['sampleRate'] !== 32000 ||
    input['channels'] !== 1 ||
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > AUDIO_DURATION_MAX_MS ||
    !integer(input['bytes'], AUDIO_WAV_MAX_BYTES) ||
    (input['bytes'] as number) < 46 ||
    (input['bytes'] as number) % 2 !== 0 ||
    Math.abs(duration - ((input['bytes'] as number) - 44) / 64) > 1e-9
  )
    throw new GenerationProtocolError();
  return structuredClone(input) as unknown as AudioResultMetadata;
}
export function validateAudioGenerationOptions(value: unknown): AudioGenerationOption[] {
  if (!Array.isArray(value) || value.length > 200) throw new GenerationProtocolError();
  const seen = new Set<string>();
  const label = (v: unknown) =>
    typeof v === 'string' &&
    !!v.trim() &&
    v.length <= 80 &&
    !Array.from(v).some(character => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    });
  for (const entry of value) {
    const input = object(entry);
    keys(input, [
      'providerInstanceId',
      'providerRevision',
      'providerName',
      'providerType',
      'modelId',
      'operation',
      'voiceId',
      'voiceLabel',
      'profileId',
      'maxTextLength',
      'format',
      'sampleRate',
      'channels'
    ]);
    validateAudioJobRequest({
      kind: 'audio',
      operation: input['operation'],
      providerInstanceId: input['providerInstanceId'],
      providerRevision: input['providerRevision'],
      modelId: input['modelId'],
      voiceId: input['voiceId'],
      profileId: input['profileId'],
      prompt: 'validation'
    });
    if (
      !label(input['providerName']) ||
      !label(input['voiceLabel']) ||
      input['providerType'] !== 'minimax' ||
      !integer(input['maxTextLength'], AUDIO_TEXT_MAX_LENGTH) ||
      input['format'] !== 'wav' ||
      input['sampleRate'] !== 32000 ||
      input['channels'] !== 1
    )
      throw new GenerationProtocolError();
    const key = `${input['providerInstanceId']}/${input['modelId']}/${input['voiceId']}/${input['profileId']}`;
    if (seen.has(key)) throw new GenerationProtocolError();
    seen.add(key);
  }
  return structuredClone(value);
}

export function validateVideoJobRequest(value: unknown): VideoJobRequest {
  const input = object(value);
  keys(input, ['kind', 'operation', 'providerInstanceId', 'providerRevision', 'modelId', 'profileId', 'prompt']);
  if (
    input['kind'] !== 'video' ||
    input['operation'] !== 'text-to-video' ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    typeof input['profileId'] !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input['profileId']) ||
    typeof input['prompt'] !== 'string' ||
    !input['prompt'].trim() ||
    input['prompt'].length > VIDEO_TEXT_MAX_LENGTH
  )
    throw new GenerationProtocolError();
  return {
    kind: 'video',
    operation: 'text-to-video',
    providerInstanceId: input['providerInstanceId'],
    providerRevision: input['providerRevision'] as number,
    modelId: input['modelId'],
    profileId: input['profileId'],
    prompt: input['prompt'].trim()
  };
}
export function validateVideoResultMetadata(value: unknown): VideoResultMetadata {
  const input = object(value);
  keys(input, ['mediaType', 'format', 'codec', 'width', 'height', 'durationMs', 'bytes']);
  if (
    input['mediaType'] !== 'video/mp4' ||
    input['format'] !== 'mp4' ||
    input['codec'] !== 'h264' ||
    !integer(input['width'], 4096) ||
    !integer(input['height'], 4096) ||
    (input['width'] as number) < 16 ||
    (input['height'] as number) < 16 ||
    !integer(input['durationMs'], 15_000) ||
    (input['durationMs'] as number) < 100 ||
    !integer(input['bytes'], VIDEO_MP4_MAX_BYTES) ||
    (input['bytes'] as number) < 128
  )
    throw new GenerationProtocolError();
  return structuredClone(input) as unknown as VideoResultMetadata;
}
export function validateVideoGenerationOptions(value: unknown): VideoGenerationOption[] {
  if (!Array.isArray(value) || value.length > 200) throw new GenerationProtocolError();
  const seen = new Set<string>();
  for (const entry of value) {
    const input = object(entry);
    keys(input, [
      'providerInstanceId',
      'providerRevision',
      'providerName',
      'providerType',
      'modelId',
      'operation',
      'profileId',
      'maxTextLength',
      'durationSeconds',
      'resolution',
      'ratio',
      'format'
    ]);
    validateVideoJobRequest({
      kind: 'video',
      operation: input['operation'],
      providerInstanceId: input['providerInstanceId'],
      providerRevision: input['providerRevision'],
      modelId: input['modelId'],
      profileId: input['profileId'],
      prompt: 'validation'
    });
    if (
      typeof input['providerName'] !== 'string' ||
      !input['providerName'].trim() ||
      input['providerName'].length > 80 ||
      [...input['providerName']].some(character => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
      input['providerType'] !== 'minimax' ||
      !integer(input['maxTextLength'], VIDEO_TEXT_MAX_LENGTH) ||
      input['durationSeconds'] !== 5 ||
      input['resolution'] !== '768P' ||
      input['ratio'] !== '16:9' ||
      input['format'] !== 'mp4'
    )
      throw new GenerationProtocolError();
    const key = `${input['providerInstanceId']}/${input['modelId']}/${input['profileId']}`;
    if (seen.has(key)) throw new GenerationProtocolError();
    seen.add(key);
  }
  return structuredClone(value);
}
export function validateVideoGenerationJobSummary(value: unknown): VideoGenerationJobSummary {
  return validateJobSummary(value, 'video') as VideoGenerationJobSummary;
}

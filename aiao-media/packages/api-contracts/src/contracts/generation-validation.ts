import {
  ASR_AUDIO_DURATION_MAX_MS,
  ASR_AUDIO_MAX_BYTES,
  AUDIO_DURATION_MAX_MS,
  AUDIO_TEXT_MAX_LENGTH,
  AUDIO_WAV_MAX_BYTES,
  MUSIC_AUDIO_MAX_BYTES,
  MUSIC_DURATION_MAX_MS,
  MUSIC_TEXT_MAX_LENGTH,
  REFERENCE_IMAGE_MAX_BYTES,
  VIDEO_DURATION_MAX_MS,
  VIDEO_MP4_MAX_BYTES,
  VIDEO_TEXT_MAX_LENGTH,
  type AudioGenerationJobSummary,
  type AsrGenerationJobSummary,
  type AsrGenerationOption,
  type AsrJobRequest,
  type AudioGenerationOption,
  type AudioInputReference,
  type AudioJobRequest,
  type LegacyAudioJobRequest,
  type TextToSpeechJobRequest,
  type AudioResultMetadata,
  type GenerationJobRequest,
  type GenerationJobSummary,
  type ImageGenerationOption,
  type ImageJobRequest,
  type MediaGenerationJobSummary,
  type MusicGenerationJobSummary,
  type MusicGenerationOption,
  type MusicJobRequest,
  type ReferenceImageUpload,
  type TranscriptResult,
  type VideoGenerationJobSummary,
  type VideoGenerationOption,
  type VideoJobRequest,
  type VideoResultMetadata
} from './generation-jobs.ts';

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
const own = (input: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(input, key);
const language = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z]{2,12}(?:-[a-zA-Z0-9]{2,8})?$/.test(value);
const digest = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const label = (value: unknown): value is string =>
  typeof value === 'string' &&
  !!value.trim() &&
  value.length <= 80 &&
  !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
const speed = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0.25 && value <= 4;
const optionalProfile = (input: Record<string, unknown>) =>
  !own(input, 'profileId') ||
  (typeof input['profileId'] === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/.test(input['profileId']));
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
    input['operation'] === 'reference-image' ?
      [
        'referenceImageId',
        'referenceImageSource',
        'aspectRatio',
        'aspectRatioValue',
        'resolution',
        'size',
        'quality',
        'complexity',
        'thinkingLevel'
      ]
    : ['aspectRatio', 'aspectRatioValue', 'resolution', 'size', 'quality', 'complexity', 'thinkingLevel']
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
    (input['aspectRatioValue'] !== undefined && !validAspectRatio(input['aspectRatioValue'])) ||
    (input['resolution'] !== undefined && !['512', '1K', '2K', '4K'].includes(String(input['resolution']))) ||
    (input['size'] !== undefined && !validImageSize(input['size'])) ||
    (input['quality'] !== undefined &&
      !['auto', 'low', 'medium', 'high', 'xhigh', 'max'].includes(String(input['quality']))) ||
    (input['complexity'] !== undefined && !['low', 'medium', 'high'].includes(String(input['complexity']))) ||
    (input['thinkingLevel'] !== undefined &&
      !['minimal', 'low', 'medium', 'high'].includes(String(input['thinkingLevel']))) ||
    (input['operation'] === 'reference-image' &&
      !(isGenerationUuid(input['referenceImageId']) || input['referenceImageSource'] === 'inline')) ||
    (input['referenceImageSource'] !== undefined && input['referenceImageSource'] !== 'inline')
  )
    throw new GenerationProtocolError();
  // Preserve the existing canonical byte order: persisted idempotency hashes
  // from earlier releases must still replay after a contracts-only upgrade.
  return {
    kind: 'image',
    ...(input['operation'] === 'reference-image' ?
      {
        operation: 'reference-image' as const,
        ...(input['referenceImageId'] ? { referenceImageId: input['referenceImageId'] as string } : {}),
        ...(input['referenceImageSource'] ? { referenceImageSource: 'inline' as const } : {})
      }
    : { operation: 'text-to-image' as const }),
    providerInstanceId: input['providerInstanceId'],
    providerRevision: input['providerRevision'] as number,
    modelId: input['modelId'],
    prompt: input['prompt'].trim(),
    ...(input['aspectRatio'] !== undefined ?
      { aspectRatio: input['aspectRatio'] as ImageJobRequest['aspectRatio'] }
    : {}),
    ...(input['aspectRatioValue'] !== undefined ? { aspectRatioValue: input['aspectRatioValue'] as string } : {}),
    ...(input['resolution'] !== undefined ? { resolution: input['resolution'] as string } : {}),
    ...(input['size'] !== undefined ? { size: input['size'] as string } : {}),
    ...(input['quality'] !== undefined ? { quality: input['quality'] as string } : {}),
    ...(input['complexity'] !== undefined ? { complexity: input['complexity'] as string } : {}),
    ...(input['thinkingLevel'] !== undefined ? { thinkingLevel: input['thinkingLevel'] as string } : {})
  };
}
function validImageSize(value: unknown): boolean {
  if (typeof value !== 'string' || !/^\d{1,4}x\d{1,4}$/.test(value)) return false;
  const [width, height] = value.split('x').map(Number);
  return width > 0 && height > 0 && width * height <= 16_777_216;
}
function validAspectRatio(value: unknown): boolean {
  if (typeof value !== 'string' || !/^(\d{1,2}):(\d{1,2})$/.test(value)) return false;
  const [width, height] = value.split(':').map(Number);
  return width > 0 && height > 0;
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
function validateJobSummary(
  value: unknown,
  kind: 'image' | 'audio' | 'video',
  expectedOperation?: 'text-to-speech' | 'speech-to-text' | 'text-to-music' | 'text-to-video'
): MediaGenerationJobSummary {
  const input = object(value);
  const requestValue = object(input['request']);
  const operation = requestValue['operation'];
  const audio = kind === 'audio';
  const video = kind === 'video';
  const music = operation === 'text-to-music';
  keys(
    input,
    ['id', 'request', 'status', 'createdAt', 'updatedAt', 'delivery', 'failure'],
    audio || video ? ['providerRequestId', 'result'] : ['providerRequestId']
  );
  if (expectedOperation !== undefined && operation !== expectedOperation) throw new GenerationProtocolError();
  const request =
    video ? validateVideoJobRequest(input['request'])
    : audio && operation === 'speech-to-text' ? validateAsrJobRequest(input['request'])
    : audio && operation === 'text-to-music' ? validateMusicJobRequest(input['request'])
    : audio ? validateAudioJobRequest(input['request'])
    : validateImageJobRequest(input['request']);
  if (audio || video) {
    if (!own(input, 'result')) throw new GenerationProtocolError();
    if (input['result'] !== null) {
      if (video) validateVideoResultMetadata(input['result']);
      else if (operation === 'speech-to-text') validateTranscriptResult(input['result']);
      else
        validateAudioResultMetadata(
          input['result'],
          music ? MUSIC_AUDIO_MAX_BYTES : AUDIO_WAV_MAX_BYTES,
          music ? MUSIC_DURATION_MAX_MS : AUDIO_DURATION_MAX_MS
        );
    }
    if ((input['status'] === 'completed') !== (input['result'] !== null)) throw new GenerationProtocolError();
  }
  const correlation = (id: unknown) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id);
  if (
    !isGenerationUuid(input['id']) ||
    !['queued', 'processing', 'completed', 'failed', 'needs_review', 'cancelled'].includes(String(input['status'])) ||
    !isGenerationTimestamp(input['createdAt']) ||
    !isGenerationTimestamp(input['updatedAt']) ||
    (own(input, 'providerRequestId') && !correlation(input['providerRequestId']))
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
      (own(failure, 'providerRequestId') && !correlation(failure['providerRequestId']))
    )
      throw new GenerationProtocolError();
  }
  return {
    ...structuredClone(input),
    request
  } as unknown as MediaGenerationJobSummary;
}

export function validateGenerationJobSummary(value: unknown): MediaGenerationJobSummary {
  const input = object(value);
  const request = object(input['request']);
  if (request['kind'] === 'image') return validateJobSummary(input, 'image');
  if (request['kind'] === 'video') return validateJobSummary(input, 'video', 'text-to-video');
  if (request['kind'] !== 'audio') throw new GenerationProtocolError();
  if (request['operation'] === 'text-to-speech') return validateJobSummary(input, 'audio', 'text-to-speech');
  if (request['operation'] === 'speech-to-text') return validateJobSummary(input, 'audio', 'speech-to-text');
  if (request['operation'] === 'text-to-music') return validateJobSummary(input, 'audio', 'text-to-music');
  throw new GenerationProtocolError();
}
export function validateImageGenerationJobSummary(value: unknown): GenerationJobSummary {
  return validateJobSummary(value, 'image') as GenerationJobSummary;
}
export function validateGenerationJobRequest(value: unknown): GenerationJobRequest {
  const input = object(value);
  if (input['kind'] === 'image') return validateImageJobRequest(input) as GenerationJobRequest;
  if (input['kind'] !== 'audio' && input['kind'] !== 'video') throw new GenerationProtocolError();
  if (input['operation'] === 'text-to-speech') return validateAudioJobRequest(input);
  if (input['operation'] === 'speech-to-text') return validateAsrJobRequest(input);
  if (input['operation'] === 'text-to-music') return validateMusicJobRequest(input);
  if (input['operation'] === 'text-to-video') return validateVideoJobRequest(input);
  throw new GenerationProtocolError();
}
export function validateAudioGenerationJobSummary(value: unknown): AudioGenerationJobSummary {
  return validateJobSummary(value, 'audio', 'text-to-speech') as AudioGenerationJobSummary;
}
export function validateMusicGenerationJobSummary(value: unknown): MusicGenerationJobSummary {
  return validateJobSummary(value, 'audio', 'text-to-music') as MusicGenerationJobSummary;
}
export function validateAsrGenerationJobSummary(value: unknown): AsrGenerationJobSummary {
  return validateJobSummary(value, 'audio', 'speech-to-text') as AsrGenerationJobSummary;
}
export function validateAudioJobRequest(value: LegacyAudioJobRequest): LegacyAudioJobRequest;
export function validateAudioJobRequest(value: TextToSpeechJobRequest): TextToSpeechJobRequest;
export function validateAudioJobRequest(value: unknown): AudioJobRequest;
export function validateAudioJobRequest(value: unknown): AudioJobRequest {
  const input = object(value);
  const base = ['kind', 'operation', 'providerInstanceId', 'providerRevision', 'modelId'];
  if (
    input['kind'] !== 'audio' ||
    input['operation'] !== 'text-to-speech' ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId'])
  )
    throw new GenerationProtocolError();
  if (own(input, 'text') || own(input, 'language') || own(input, 'speed')) {
    keys(input, [...base, 'language', 'voiceId', 'speed', 'text'], ['profileId']);
    if (
      !language(input['language']) ||
      typeof input['voiceId'] !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/.test(input['voiceId']) ||
      !speed(input['speed']) ||
      typeof input['text'] !== 'string' ||
      !input['text'].trim() ||
      input['text'].length > AUDIO_TEXT_MAX_LENGTH ||
      !optionalProfile(input)
    )
      throw new GenerationProtocolError();
    return {
      kind: 'audio',
      operation: 'text-to-speech',
      providerInstanceId: input['providerInstanceId'],
      providerRevision: input['providerRevision'] as number,
      modelId: input['modelId'],
      language: input['language'],
      voiceId: input['voiceId'],
      speed: input['speed'] as number,
      text: input['text'].trim(),
      ...(own(input, 'profileId') ? { profileId: input['profileId'] as string } : {})
    };
  }
  keys(input, [...base, 'voiceId', 'profileId', 'prompt']);
  if (
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
export function validateAudioInputReference(value: unknown): AudioInputReference {
  const input = object(value);
  keys(input, ['id', 'mediaType', 'bytes', 'durationMs', 'sha256', 'expiresAt']);
  if (
    !isGenerationUuid(input['id']) ||
    input['mediaType'] !== 'audio/wav' ||
    !integer(input['bytes'], ASR_AUDIO_MAX_BYTES) ||
    (input['bytes'] as number) < 46 ||
    !integer(input['durationMs'], ASR_AUDIO_DURATION_MAX_MS) ||
    !digest(input['sha256']) ||
    !isGenerationTimestamp(input['expiresAt'])
  )
    throw new GenerationProtocolError();
  return structuredClone(input) as unknown as AudioInputReference;
}
function validateMusicParameters(value: unknown) {
  const input = object(value);
  keys(input, ['durationSeconds', 'instrumental']);
  if (!integer(input['durationSeconds'], MUSIC_DURATION_MAX_MS / 1000) || typeof input['instrumental'] !== 'boolean')
    throw new GenerationProtocolError();
  return {
    durationSeconds: input['durationSeconds'] as number,
    instrumental: input['instrumental'] as boolean
  };
}
export function validateMusicJobRequest(value: unknown): MusicJobRequest {
  const input = object(value);
  const base = ['kind', 'operation', 'providerInstanceId', 'providerRevision', 'modelId', 'prompt'];
  if (
    input['kind'] !== 'audio' ||
    input['operation'] !== 'text-to-music' ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    typeof input['prompt'] !== 'string' ||
    !input['prompt'].trim() ||
    input['prompt'].length > MUSIC_TEXT_MAX_LENGTH
  )
    throw new GenerationProtocolError();
  if (own(input, 'parameters')) {
    keys(input, [...base, 'parameters'], ['profileId']);
    if (!optionalProfile(input)) throw new GenerationProtocolError();
    return {
      kind: 'audio',
      operation: 'text-to-music',
      providerInstanceId: input['providerInstanceId'],
      providerRevision: input['providerRevision'] as number,
      modelId: input['modelId'],
      prompt: input['prompt'].trim(),
      parameters: validateMusicParameters(input['parameters']),
      ...(own(input, 'profileId') ? { profileId: input['profileId'] as string } : {})
    };
  }
  keys(input, [...base, 'profileId', 'durationSeconds', 'instrumental']);
  if (
    typeof input['profileId'] !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input['profileId']) ||
    !integer(input['durationSeconds'], MUSIC_DURATION_MAX_MS / 1000) ||
    typeof input['instrumental'] !== 'boolean'
  )
    throw new GenerationProtocolError();
  return {
    kind: 'audio',
    operation: 'text-to-music',
    providerInstanceId: input['providerInstanceId'],
    providerRevision: input['providerRevision'] as number,
    modelId: input['modelId'],
    profileId: input['profileId'],
    prompt: input['prompt'].trim(),
    durationSeconds: input['durationSeconds'] as number,
    instrumental: input['instrumental'] as boolean
  };
}
export function validateAsrJobRequest(value: unknown): AsrJobRequest {
  const input = object(value);
  keys(
    input,
    ['kind', 'operation', 'providerInstanceId', 'providerRevision', 'modelId', 'language', 'input'],
    ['profileId']
  );
  if (
    input['kind'] !== 'audio' ||
    input['operation'] !== 'speech-to-text' ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    (input['language'] !== null && !language(input['language'])) ||
    !optionalProfile(input)
  )
    throw new GenerationProtocolError();
  return {
    kind: 'audio',
    operation: 'speech-to-text',
    providerInstanceId: input['providerInstanceId'],
    providerRevision: input['providerRevision'] as number,
    modelId: input['modelId'],
    language: input['language'] as string | null,
    input: validateAudioInputReference(input['input']),
    ...(own(input, 'profileId') ? { profileId: input['profileId'] as string } : {})
  };
}
export function validateTranscriptResult(value: unknown): TranscriptResult {
  const input = object(value);
  keys(input, ['kind', 'text', 'language', 'detectedLanguage', 'characters', 'sha256']);
  const text = typeof input['text'] === 'string' ? input['text'].trim() : '';
  if (
    input['kind'] !== 'transcript' ||
    !text ||
    text.length > 100_000 ||
    !language(input['language']) ||
    typeof input['detectedLanguage'] !== 'boolean' ||
    !integer(input['characters'], 100_000) ||
    input['characters'] !== [...text].length ||
    !digest(input['sha256'])
  )
    throw new GenerationProtocolError();
  return {
    kind: 'transcript',
    text,
    language: input['language'],
    detectedLanguage: input['detectedLanguage'] as boolean,
    characters: input['characters'] as number,
    sha256: input['sha256']
  };
}
export function validateAudioResultMetadata(
  value: unknown,
  maxBytes = AUDIO_WAV_MAX_BYTES,
  maxDurationMs = AUDIO_DURATION_MAX_MS
): AudioResultMetadata {
  const input = object(value);
  const manifest = own(input, 'kind') || own(input, 'sha256');
  keys(
    input,
    manifest
      ? ['kind', 'mediaType', 'format', 'durationMs', 'sampleRate', 'channels', 'bytes', 'sha256']
      : ['mediaType', 'format', 'durationMs', 'sampleRate', 'channels', 'bytes']
  );
  const duration = input['durationMs'];
  if (
    (manifest && input['kind'] !== 'audio') ||
    (manifest && !digest(input['sha256'])) ||
    input['mediaType'] !== 'audio/wav' ||
    input['format'] !== 'wav' ||
    input['sampleRate'] !== 32000 ||
    input['channels'] !== 1 ||
    typeof duration !== 'number' ||
    !Number.isFinite(duration) ||
    duration <= 0 ||
    duration > maxDurationMs ||
    !integer(input['bytes'], maxBytes) ||
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
  for (const entry of value) {
    const input = object(entry);
    keys(
      input,
      [
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
      ],
      ['languages', 'speeds']
    );
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
    const languages = input['languages'];
    const speeds = input['speeds'];
    if (
      !isGenerationUuid(input['providerInstanceId']) ||
      !integer(input['providerRevision'], 2_147_483_647) ||
      !label(input['providerName']) ||
      !label(input['voiceLabel']) ||
      input['providerType'] !== 'minimax' ||
      !integer(input['maxTextLength'], AUDIO_TEXT_MAX_LENGTH) ||
      input['format'] !== 'wav' ||
      input['sampleRate'] !== 32000 ||
      input['channels'] !== 1 ||
      (languages !== undefined &&
        (!Array.isArray(languages) || languages.length === 0 || languages.some(item => !language(item)))) ||
      (speeds !== undefined &&
        (!Array.isArray(speeds) || speeds.length === 0 || speeds.some(item => !speed(item))))
    )
      throw new GenerationProtocolError();
    const key = `${input['providerInstanceId']}/${input['modelId']}/${input['voiceId']}/${input['profileId']}`;
    if (seen.has(key)) throw new GenerationProtocolError();
    seen.add(key);
  }
  return structuredClone(value);
}
export function validateMusicGenerationOptions(value: unknown): MusicGenerationOption[] {
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
      'durationsSeconds',
      'formats'
    ]);
    validateMusicJobRequest({
      kind: 'audio',
      operation: input['operation'],
      providerInstanceId: input['providerInstanceId'],
      providerRevision: input['providerRevision'],
      modelId: input['modelId'],
      profileId: input['profileId'],
      prompt: 'validation',
      durationSeconds: 1,
      instrumental: false
    });
    const durations = input['durationsSeconds'];
    if (
      !isGenerationUuid(input['providerInstanceId']) ||
      !integer(input['providerRevision'], 2_147_483_647) ||
      !label(input['providerName']) ||
      !['minimax', 'openai'].includes(String(input['providerType'])) ||
      !integer(input['maxTextLength'], MUSIC_TEXT_MAX_LENGTH) ||
      !Array.isArray(durations) ||
      durations.length === 0 ||
      durations.length > 20 ||
      durations.some(item => !integer(item, MUSIC_DURATION_MAX_MS / 1000)) ||
      JSON.stringify(input['formats']) !== JSON.stringify(['wav'])
    )
      throw new GenerationProtocolError();
    const key = `${input['providerInstanceId']}/${input['modelId']}/${input['profileId']}`;
    if (seen.has(key)) throw new GenerationProtocolError();
    seen.add(key);
  }
  return structuredClone(value);
}
export function validateAsrGenerationOptions(value: unknown): AsrGenerationOption[] {
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
      'inputMediaTypes',
      'maxInputBytes',
      'maxDurationMs',
      'languages'
    ]);
    if (
      !isGenerationUuid(input['providerInstanceId']) ||
      !integer(input['providerRevision'], 2_147_483_647) ||
      !label(input['providerName']) ||
      !['minimax', 'openai'].includes(String(input['providerType'])) ||
      typeof input['modelId'] !== 'string' ||
      !model.test(input['modelId']) ||
      input['operation'] !== 'speech-to-text' ||
      typeof input['profileId'] !== 'string' ||
      !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input['profileId']) ||
      JSON.stringify(input['inputMediaTypes']) !== JSON.stringify(['audio/wav']) ||
      !integer(input['maxInputBytes'], ASR_AUDIO_MAX_BYTES) ||
      !integer(input['maxDurationMs'], ASR_AUDIO_DURATION_MAX_MS) ||
      !Array.isArray(input['languages']) ||
      input['languages'].some(item => !language(item))
    )
      throw new GenerationProtocolError();
    const key = `${input['providerInstanceId']}/${input['modelId']}/${input['profileId']}`;
    if (seen.has(key)) throw new GenerationProtocolError();
    seen.add(key);
  }
  return structuredClone(value);
}

export function validateVideoJobRequest(value: unknown): VideoJobRequest {
  const input = object(value);
  const base = ['kind', 'operation', 'providerInstanceId', 'providerRevision', 'modelId', 'prompt'];
  if (
    input['kind'] !== 'video' ||
    input['operation'] !== 'text-to-video' ||
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    typeof input['prompt'] !== 'string' ||
    !input['prompt'].trim() ||
    input['prompt'].length > VIDEO_TEXT_MAX_LENGTH
  )
    throw new GenerationProtocolError();
  if (own(input, 'parameters')) {
    keys(input, [...base, 'parameters'], ['profileId']);
    const parameters = object(input['parameters']);
    keys(parameters, ['ratio', 'durationSeconds', 'resolution']);
    if (
      typeof parameters['ratio'] !== 'string' ||
      !/^\d{1,2}:\d{1,2}$/.test(parameters['ratio']) ||
      !integer(parameters['durationSeconds'], 300) ||
      !label(parameters['resolution']) ||
      !optionalProfile(input)
    )
      throw new GenerationProtocolError();
    return {
      kind: 'video',
      operation: 'text-to-video',
      providerInstanceId: input['providerInstanceId'],
      providerRevision: input['providerRevision'] as number,
      modelId: input['modelId'],
      prompt: input['prompt'].trim(),
      parameters: {
        ratio: parameters['ratio'],
        durationSeconds: parameters['durationSeconds'] as number,
        resolution: parameters['resolution']
      },
      ...(own(input, 'profileId') ? { profileId: input['profileId'] as string } : {})
    };
  }
  keys(input, [...base, 'profileId']);
  if (
    typeof input['profileId'] !== 'string' ||
    !/^[a-z0-9][a-z0-9._-]{0,127}$/.test(input['profileId'])
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
export function validateVideoResultMetadata(
  value: unknown,
  maxBytes = VIDEO_MP4_MAX_BYTES,
  maxDurationMs = VIDEO_DURATION_MAX_MS
): VideoResultMetadata {
  const input = object(value);
  const manifest = own(input, 'kind') || own(input, 'sha256');
  keys(
    input,
    manifest
      ? ['kind', 'mediaType', 'format', 'codec', 'width', 'height', 'durationMs', 'bytes', 'sha256']
      : ['mediaType', 'format', 'codec', 'width', 'height', 'durationMs', 'bytes']
  );
  if (
    (manifest && input['kind'] !== 'video') ||
    (manifest && !digest(input['sha256'])) ||
    input['mediaType'] !== 'video/mp4' ||
    input['format'] !== 'mp4' ||
    input['codec'] !== 'h264' ||
    !integer(input['width'], 4096) ||
    !integer(input['height'], 4096) ||
    (input['width'] as number) < 16 ||
    (input['height'] as number) < 16 ||
    !integer(input['durationMs'], maxDurationMs) ||
    (input['durationMs'] as number) < 100 ||
    !integer(input['bytes'], maxBytes) ||
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

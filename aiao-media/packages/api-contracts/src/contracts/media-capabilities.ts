import type {
  AsrGenerationOption,
  AudioGenerationOption,
  MusicGenerationOption,
  VideoGenerationOption
} from './generation-jobs.ts';

export type MediaCapabilityOperation = 'text-to-speech' | 'speech-to-text' | 'text-to-music' | 'text-to-video';
export interface MediaCapabilityBase {
  providerInstanceId: string;
  providerRevision: number;
  kind: 'audio' | 'video';
  operation: MediaCapabilityOperation;
  label: string;
  modelId: string;
  credits: number;
}
export interface TextToSpeechCapability extends MediaCapabilityBase {
  kind: 'audio';
  operation: 'text-to-speech';
  input: { textMaxLength: number };
  parameters: {
    languages: string[];
    voices: { id: string; label: string }[];
    speeds: number[];
  };
  output: {
    mediaTypes: ['audio/wav'];
    maxBytes: number;
    maxDurationMs: number;
  };
}
export interface SpeechToTextCapability extends MediaCapabilityBase {
  kind: 'audio';
  operation: 'speech-to-text';
  input: {
    mediaTypes: ['audio/wav'];
    maxBytes: number;
    maxDurationMs: number;
  };
  parameters: { languages: string[] };
  output: { mediaTypes: ['application/json'] };
}
export interface TextToMusicCapability extends MediaCapabilityBase {
  kind: 'audio';
  operation: 'text-to-music';
  input: { textMaxLength: number };
  parameters: {
    durationsSeconds: number[];
    instrumental: boolean[];
  };
  output: {
    mediaTypes: ['audio/wav'];
    maxBytes: number;
    maxDurationMs: number;
  };
}
export interface TextToVideoCapability extends MediaCapabilityBase {
  kind: 'video';
  operation: 'text-to-video';
  input: { textMaxLength: number };
  parameters: {
    ratios: string[];
    durationsSeconds: number[];
    resolutions: string[];
  };
  output: {
    mediaTypes: ['video/mp4'];
    maxBytes: number;
    maxDurationMs: number;
  };
}
export type MediaCapability =
  TextToSpeechCapability | SpeechToTextCapability | TextToMusicCapability | TextToVideoCapability;
export interface MediaCapabilityCatalog {
  revision: number;
  capabilities: MediaCapability[];
}
export type LegacyCapabilityOption =
  AudioGenerationOption | AsrGenerationOption | MusicGenerationOption | VideoGenerationOption;

import {
  ASR_AUDIO_DURATION_MAX_MS,
  ASR_AUDIO_MAX_BYTES,
  AUDIO_DURATION_MAX_MS,
  AUDIO_TEXT_MAX_LENGTH,
  AUDIO_WAV_MAX_BYTES,
  MUSIC_DURATION_MAX_MS,
  MUSIC_TEXT_MAX_LENGTH,
  VIDEO_DURATION_MAX_MS,
  VIDEO_MP4_MAX_BYTES,
  VIDEO_TEXT_MAX_LENGTH
} from './generation-jobs.ts';
import { GenerationProtocolError, isGenerationUuid } from './generation-validation.ts';

const model = /^[a-zA-Z0-9._:-]{1,128}$/;
const language = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-zA-Z]{2,12}(?:-[a-zA-Z0-9]{2,8})?$/.test(value);
const integer = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 && value <= max;
const decimal = (value: unknown, max: number) =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= max;
const label = (value: unknown): value is string =>
  typeof value === 'string' &&
  !!value.trim() &&
  value.length <= 80 &&
  !Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
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
const list = (value: unknown, validate: (item: unknown) => boolean, max: number): unknown[] => {
  if (!Array.isArray(value) || value.length > max || value.some(item => !validate(item)))
    throw new GenerationProtocolError();
  return value as unknown[];
};
const mediaTypes = (value: unknown, expected: string) =>
  Array.isArray(value) && value.length === 1 && value[0] === expected;
const capabilityBase = (input: Record<string, unknown>) => {
  if (
    !isGenerationUuid(input['providerInstanceId']) ||
    !integer(input['providerRevision'], 2_147_483_647) ||
    !label(input['label']) ||
    typeof input['modelId'] !== 'string' ||
    !model.test(input['modelId']) ||
    !integer(input['credits'], 2_147_483_647)
  )
    throw new GenerationProtocolError();
};
const outputBytes = (value: unknown, max: number) => integer(value, max);
const voice = (value: unknown): value is { id: string; label: string } => {
  const input = object(value);
  keys(input, ['id', 'label']);
  return typeof input['id'] === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(input['id']) && label(input['label']);
};
const duration = (value: unknown, max: number) => integer(value, max);

export function validateMediaCapabilityCatalog(value: unknown): MediaCapabilityCatalog {
  const catalog = object(value);
  keys(catalog, ['revision', 'capabilities']);
  if (!integer(catalog['revision'], 2_147_483_647)) throw new GenerationProtocolError();
  const capabilities = catalog['capabilities'];
  if (!Array.isArray(capabilities) || capabilities.length > 200) throw new GenerationProtocolError();
  const seen = new Set<string>();
  for (const entry of capabilities) {
    const input = object(entry);
    keys(
      input,
      ['providerInstanceId', 'providerRevision', 'kind', 'operation', 'label', 'modelId', 'credits'],
      ['input', 'parameters', 'output']
    );
    capabilityBase(input);
    const identity = `${input['providerInstanceId']}/${input['providerRevision']}/${input['modelId']}/${input['operation']}`;
    if (seen.has(identity)) throw new GenerationProtocolError();
    seen.add(identity);
    if (input['kind'] !== 'audio' && input['kind'] !== 'video') throw new GenerationProtocolError();
    if (input['operation'] === 'text-to-speech') {
      keys(input, [
        'providerInstanceId',
        'providerRevision',
        'kind',
        'operation',
        'label',
        'modelId',
        'credits',
        'input',
        'parameters',
        'output'
      ]);
      if (input['kind'] !== 'audio') throw new GenerationProtocolError();
      const inputSpec = object(input['input']);
      const parameters = object(input['parameters']);
      const output = object(input['output']);
      keys(inputSpec, ['textMaxLength']);
      keys(parameters, ['languages', 'voices', 'speeds']);
      keys(output, ['mediaTypes', 'maxBytes', 'maxDurationMs']);
      const languages = list(parameters['languages'], language, 50);
      const voices = list(parameters['voices'], voice, 200);
      const speeds = list(parameters['speeds'], item => decimal(item, 4), 20);
      if (
        inputSpec['textMaxLength'] !== AUDIO_TEXT_MAX_LENGTH ||
        languages.length === 0 ||
        voices.length === 0 ||
        speeds.length === 0 ||
        !mediaTypes(output['mediaTypes'], 'audio/wav') ||
        !outputBytes(output['maxBytes'], AUDIO_WAV_MAX_BYTES) ||
        !duration(output['maxDurationMs'], AUDIO_DURATION_MAX_MS)
      )
        throw new GenerationProtocolError();
      continue;
    }
    if (input['operation'] === 'speech-to-text') {
      keys(input, [
        'providerInstanceId',
        'providerRevision',
        'kind',
        'operation',
        'label',
        'modelId',
        'credits',
        'input',
        'parameters',
        'output'
      ]);
      if (input['kind'] !== 'audio') throw new GenerationProtocolError();
      const inputSpec = object(input['input']);
      const parameters = object(input['parameters']);
      const output = object(input['output']);
      keys(inputSpec, ['mediaTypes', 'maxBytes', 'maxDurationMs']);
      keys(parameters, ['languages']);
      keys(output, ['mediaTypes']);
      const languages = list(parameters['languages'], language, 50);
      if (
        !mediaTypes(inputSpec['mediaTypes'], 'audio/wav') ||
        !outputBytes(inputSpec['maxBytes'], ASR_AUDIO_MAX_BYTES) ||
        !duration(inputSpec['maxDurationMs'], ASR_AUDIO_DURATION_MAX_MS) ||
        !mediaTypes(output['mediaTypes'], 'application/json') ||
        languages.length > 50
      )
        throw new GenerationProtocolError();
      continue;
    }
    if (input['operation'] === 'text-to-music') {
      keys(input, [
        'providerInstanceId',
        'providerRevision',
        'kind',
        'operation',
        'label',
        'modelId',
        'credits',
        'input',
        'parameters',
        'output'
      ]);
      if (input['kind'] !== 'audio') throw new GenerationProtocolError();
      const inputSpec = object(input['input']);
      const parameters = object(input['parameters']);
      const output = object(input['output']);
      keys(inputSpec, ['textMaxLength']);
      keys(parameters, ['durationsSeconds', 'instrumental']);
      keys(output, ['mediaTypes', 'maxBytes', 'maxDurationMs']);
      const durations = list(parameters['durationsSeconds'], item => duration(item, MUSIC_DURATION_MAX_MS / 1000), 20);
      const instrumentals = list(parameters['instrumental'], item => typeof item === 'boolean', 4);
      if (
        inputSpec['textMaxLength'] !== MUSIC_TEXT_MAX_LENGTH ||
        durations.length === 0 ||
        instrumentals.length === 0 ||
        !mediaTypes(output['mediaTypes'], 'audio/wav') ||
        !outputBytes(output['maxBytes'], 32 * 1024 * 1024) ||
        !duration(output['maxDurationMs'], MUSIC_DURATION_MAX_MS)
      )
        throw new GenerationProtocolError();
      continue;
    }
    if (input['operation'] === 'text-to-video') {
      keys(input, [
        'providerInstanceId',
        'providerRevision',
        'kind',
        'operation',
        'label',
        'modelId',
        'credits',
        'input',
        'parameters',
        'output'
      ]);
      if (input['kind'] !== 'video') throw new GenerationProtocolError();
      const inputSpec = object(input['input']);
      const parameters = object(input['parameters']);
      const output = object(input['output']);
      keys(inputSpec, ['textMaxLength']);
      keys(parameters, ['ratios', 'durationsSeconds', 'resolutions']);
      keys(output, ['mediaTypes', 'maxBytes', 'maxDurationMs']);
      const ratios = list(parameters['ratios'], item => typeof item === 'string' && /^\d{1,2}:\d{1,2}$/.test(item), 20);
      const durations = list(parameters['durationsSeconds'], item => duration(item, 300), 20);
      const resolutions = list(parameters['resolutions'], label, 20);
      if (
        inputSpec['textMaxLength'] !== VIDEO_TEXT_MAX_LENGTH ||
        ratios.length === 0 ||
        durations.length === 0 ||
        resolutions.length === 0 ||
        !mediaTypes(output['mediaTypes'], 'video/mp4') ||
        !outputBytes(output['maxBytes'], VIDEO_MP4_MAX_BYTES) ||
        !duration(output['maxDurationMs'], VIDEO_DURATION_MAX_MS)
      )
        throw new GenerationProtocolError();
      continue;
    }
    throw new GenerationProtocolError();
  }
  return structuredClone(catalog) as unknown as MediaCapabilityCatalog;
}

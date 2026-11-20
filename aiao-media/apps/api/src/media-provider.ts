import {
  AUDIO_DURATION_MAX_MS,
  MUSIC_DURATION_MAX_MS,
  VIDEO_DURATION_MAX_MS,
  validateAudioResultMetadata,
  validateGenerationJobRequest,
  validateTranscriptResult,
  validateVideoResultMetadata,
  type AudioResultManifest,
  type TextToSpeechCapability,
  type SpeechToTextCapability,
  type TextToMusicCapability,
  type TextToVideoCapability,
  type AsrJobRequest,
  type GenerationJobRequest,
  type MusicJobRequest,
  type TextToSpeechJobRequest,
  type TranscriptResult,
  type VideoResultManifest,
  type TextToVideoJobRequest
} from '@aiao-media/api-contracts';
import { mediaCapability, type PrivateMediaCapability } from './media-capabilities.ts';
import { readMediaInput } from './media-input-api.ts';
import { bounded, reject } from './product-http.ts';
import type { WorkerEnv } from './worker-env.ts';

export type MediaResultKind = 'audio' | 'transcript' | 'video';
export interface MediaDispatch {
  operation: GenerationJobRequest['operation'];
  url: string;
  body: unknown;
  protocol: 'openai' | 'minimax';
  authorization: string;
  cost: number;
  resultKind: MediaResultKind;
  maxResultBytes: number;
  maxResultDurationMs?: number;
  request: GenerationJobRequest;
  fetchResult?: (url: string, init: RequestInit) => Promise<Response>;
}
export type MediaResultManifest = AudioResultManifest | TranscriptResult | VideoResultManifest;
export interface NormalizedMediaResult {
  bytes: Uint8Array<ArrayBuffer>;
  mediaType: 'audio/wav' | 'application/json' | 'video/mp4';
  manifest: MediaResultManifest;
  providerRequestId?: string;
}
const encoder = new TextEncoder();
const digest = async (bytes: Uint8Array): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)), byte =>
    byte.toString(16).padStart(2, '0')
  ).join('');
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
const correlation = /^[a-zA-Z0-9_-]{1,128}$/;
function providerRequestId(response: Response, value?: unknown): string | undefined {
  const header = ['x-request-id', 'x-provider-request-id', 'request-id']
    .map(name => response.headers.get(name))
    .find(value => value !== null && correlation.test(value));
  if (header) return header;
  const input = object(value);
  const candidates = [input['id'], input['request_id'], input['requestId']];
  const data = Array.isArray(input['data']) ? object(input['data'][0]) : {};
  candidates.push(data['id'], data['request_id'], data['requestId']);
  return candidates.find(candidate => typeof candidate === 'string' && correlation.test(candidate)) as string | undefined;
}
const base64 = (value: unknown): Uint8Array<ArrayBuffer> => {
  if (typeof value !== 'string' || !value || value.length % 4 === 1 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value))
    reject(502, '媒体供应商结果无效。');
  try {
    return Uint8Array.from(atob(value), character => character.charCodeAt(0));
  } catch {
    reject(502, '媒体供应商结果无效。');
  }
};
const responseBytes = async (response: Response, max: number) => bounded(response, max);
const resultPath: Record<GenerationJobRequest['operation'], string> = {
  'text-to-speech': '/audio/speech',
  'speech-to-text': '/audio/transcriptions',
  'text-to-music': '/audio/music',
  'text-to-video': '/video/generations',
  'text-to-image': '/images/generations',
  'reference-image': '/images/generations'
};
function capabilityFor(env: WorkerEnv, request: GenerationJobRequest): PrivateMediaCapability {
  return mediaCapability(env, {
    providerInstanceId: request.providerInstanceId,
    providerRevision: request.providerRevision,
    modelId: request.modelId,
    operation: request.operation as Exclude<GenerationJobRequest['operation'], 'text-to-image' | 'reference-image'>
  });
}
function exactNumber(values: number[], value: number): boolean {
  return values.some(candidate => Object.is(candidate, value));
}
function validateSelection(request: GenerationJobRequest, capability: PrivateMediaCapability) {
  if (request.kind !== capability.kind || request.operation !== capability.operation || request.modelId !== capability.modelId)
    reject(400, '媒体能力选择与目录不一致。');
  if (request.operation === 'text-to-speech') {
    const value = request as TextToSpeechJobRequest;
    const selected = capability as TextToSpeechCapability;
    if (
      value.text.length > selected.input.textMaxLength ||
      !selected.parameters.languages.includes(value.language) ||
      !selected.parameters.voices.some((voice: { id: string }) => voice.id === value.voiceId) ||
      !exactNumber(selected.parameters.speeds, value.speed)
    )
      reject(400, 'TTS 参数不受当前能力支持。');
    return;
  }
  if (request.operation === 'speech-to-text') {
    const value = request as AsrJobRequest;
    const selected = capability as SpeechToTextCapability;
    if (
      (value.language !== null && !selected.parameters.languages.includes(value.language)) ||
      value.input.mediaType !== selected.input.mediaTypes[0] ||
      value.input.bytes > selected.input.maxBytes ||
      value.input.durationMs > selected.input.maxDurationMs
    )
      reject(400, 'ASR 参数或输入不受当前能力支持。');
    if (Date.parse(value.input.expiresAt) <= Date.now()) reject(400, 'ASR 输入已过期，请重新上传。');
    return;
  }
  if (request.operation === 'text-to-music') {
    const value = request as MusicJobRequest;
    const selected = capability as TextToMusicCapability;
    const parameters = 'parameters' in value ? value.parameters : value;
    if (
      value.prompt.length > selected.input.textMaxLength ||
      !selected.parameters.durationsSeconds.includes(parameters.durationSeconds) ||
      !selected.parameters.instrumental.includes(parameters.instrumental)
    )
      reject(400, '音乐参数不受当前能力支持。');
    return;
  }
  const value = request as TextToVideoJobRequest;
  const selected = capability as TextToVideoCapability;
  const parameters = 'parameters' in value ? value.parameters : null;
  if (!parameters) reject(400, '视频请求缺少目录参数。');
  if (
    value.prompt.length > selected.input.textMaxLength ||
    !selected.parameters.ratios.includes(parameters.ratio) ||
    !selected.parameters.durationsSeconds.includes(parameters.durationSeconds) ||
    !selected.parameters.resolutions.includes(parameters.resolution)
  )
    reject(400, '视频参数不受当前能力支持。');
}
function upstreamBody(request: GenerationJobRequest, capability: PrivateMediaCapability): unknown {
  const model = capability.model;
  if (request.operation === 'text-to-speech') {
    const value = request as TextToSpeechJobRequest;
    return {
      model,
      input: value.text,
      text: value.text,
      language: value.language,
      voice: value.voiceId,
      voice_id: value.voiceId,
      speed: value.speed,
      response_format: 'wav'
    };
  }
  if (request.operation === 'text-to-music') {
    const value = request as MusicJobRequest;
    const parameters = 'parameters' in value ? value.parameters : value;
    return {
      model,
      prompt: value.prompt,
      duration_seconds: parameters.durationSeconds,
      instrumental: parameters.instrumental,
      response_format: 'wav'
    };
  }
  if (request.operation === 'text-to-video') {
    const value = request as TextToVideoJobRequest;
    const parameters = 'parameters' in value ? value.parameters : null;
    return {
      model,
      prompt: value.prompt,
      ratio: parameters?.ratio,
      duration_seconds: parameters?.durationSeconds,
      resolution: parameters?.resolution,
      response_format: 'mp4'
    };
  }
  const value = request as AsrJobRequest;
  return {
    _format: 'media-input',
    fields: {
      model,
      ...(value.language ? { language: value.language } : {})
    },
    input: value.input
  };
}
export async function mediaProviderInput(request: Request, env: WorkerEnv, ownerId: string): Promise<MediaDispatch> {
  const value = validateGenerationJobRequest(await request.json());
  if (value.kind === 'image') reject(400, '图片任务必须使用图片模型接口。');
  const capability = capabilityFor(env, value);
  validateSelection(value, capability);
  if (value.operation === 'speech-to-text') await readMediaInput(env, (value as AsrJobRequest).input, ownerId);
  const url = `${capability.baseUrl}${capability.path ?? resultPath[value.operation]}`;
  const resultKind: MediaResultKind = value.operation === 'speech-to-text' ? 'transcript' : value.kind;
  const maxResultBytes =
    resultKind === 'audio' ? (capability as TextToSpeechCapability | TextToMusicCapability).output.maxBytes
    : resultKind === 'video' ? (capability as TextToVideoCapability).output.maxBytes
    : 1024 * 1024;
  const maxResultDurationMs =
    resultKind === 'audio' ? (capability as TextToSpeechCapability | TextToMusicCapability).output.maxDurationMs
    : resultKind === 'video' ? (capability as TextToVideoCapability).output.maxDurationMs
    : undefined;
  return {
    operation: value.operation,
    url,
    body: upstreamBody(value, capability),
    protocol: capability.protocol,
    authorization: `Bearer ${env[capability.secret] as string}`,
    cost: capability.credits,
    resultKind,
    maxResultBytes,
    ...(maxResultDurationMs === undefined ? {} : { maxResultDurationMs }),
    request: value
  };
}
function audioBytes(value: unknown): Uint8Array<ArrayBuffer> {
  if (typeof value === 'string') return base64(value);
  const input = object(value);
  return base64(input['audio_base64'] ?? input['audio'] ?? input['b64_json']);
}
function parseWav(bytes: Uint8Array, maxDurationMs: number) {
  if (bytes.byteLength < 44) reject(502, '媒体供应商 WAV 结果过短。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (start: number, size: number) => new TextDecoder('latin1').decode(bytes.subarray(start, start + size));
  if (
    text(0, 4) !== 'RIFF' ||
    text(8, 4) !== 'WAVE' ||
    text(12, 4) !== 'fmt ' ||
    view.getUint32(16, true) < 16 ||
    view.getUint16(20, true) !== 1 ||
    view.getUint16(22, true) !== 1 ||
    view.getUint32(24, true) !== 32000 ||
    view.getUint16(34, true) !== 16
  )
    reject(502, '媒体供应商 WAV 结果格式不受支持。');
  const dataOffset = bytes.findIndex((_, index) => index + 4 <= bytes.length && text(index, 4) === 'data');
  if (dataOffset < 0 || dataOffset + 8 > bytes.length) reject(502, '媒体供应商 WAV 结果缺少音频数据。');
  const dataBytes = view.getUint32(dataOffset + 4, true);
  if (dataOffset + 8 + dataBytes > bytes.length || view.getUint32(4, true) !== bytes.length - 8)
    reject(502, '媒体供应商 WAV 结果不完整。');
  const durationMs = Math.round((dataBytes / 64000) * 1000);
  if (durationMs <= 0 || durationMs > maxDurationMs) reject(502, '媒体供应商音频时长超出限制。');
  return { durationMs };
}
function jsonValue(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    reject(502, '媒体供应商 JSON 结果无效。');
  }
}
function audioFromJson(value: unknown): Uint8Array<ArrayBuffer> {
  const input = object(value);
  const data = input['data'];
  if (Array.isArray(data) && data.length) return audioBytes(object(data[0])['b64_json'] ?? object(data[0])['audio_base64']);
  return audioBytes(input['audio_base64'] ?? input['audio'] ?? input['b64_json']);
}
function videoFromJson(value: unknown): Uint8Array<ArrayBuffer> {
  const input = object(value);
  const data = input['data'];
  if (Array.isArray(data) && data.length) {
    const item = object(data[0]);
    return base64(item['video_base64'] ?? item['b64_json']);
  }
  return base64(input['video_base64'] ?? input['video'] ?? input['b64_json']);
}
type Mp4Box = { type: string; payloadStart: number; end: number };
const textDecoder = new TextDecoder('latin1');
const mp4Text = (bytes: Uint8Array, start: number, size: number) => textDecoder.decode(bytes.subarray(start, start + size));

function mp4Boxes(bytes: Uint8Array, start: number, end: number): Mp4Box[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const boxes: Mp4Box[] = [];
  let offset = start;
  while (offset < end) {
    if (offset + 8 > end) reject(502, '媒体供应商 MP4 结果不完整。');
    const size32 = view.getUint32(offset);
    let headerSize = 8;
    let size = size32;
    if (size32 === 1) {
      if (offset + 16 > end) reject(502, '媒体供应商 MP4 结果不完整。');
      const high = view.getUint32(offset + 8);
      const low = view.getUint32(offset + 12);
      size = high * 2 ** 32 + low;
      headerSize = 16;
    } else if (size32 === 0) {
      size = end - offset;
    }
    if (!Number.isSafeInteger(size) || size < headerSize || offset + size > end)
      reject(502, '媒体供应商 MP4 结果不完整。');
    boxes.push({ type: mp4Text(bytes, offset + 4, 4), payloadStart: offset + headerSize, end: offset + size });
    offset += size;
  }
  if (offset !== end) reject(502, '媒体供应商 MP4 结果不完整。');
  return boxes;
}

function children(bytes: Uint8Array, box: Mp4Box): Mp4Box[] {
  return mp4Boxes(bytes, box.payloadStart, box.end);
}

function uint32(view: DataView, offset: number, end: number): number {
  if (offset + 4 > end) reject(502, '媒体供应商 MP4 结果 metadata 不完整。');
  return view.getUint32(offset);
}

function uint64(view: DataView, offset: number, end: number): number {
  const high = uint32(view, offset, end);
  const low = uint32(view, offset + 4, end);
  const value = high * 2 ** 32 + low;
  if (!Number.isSafeInteger(value)) reject(502, '媒体供应商 MP4 结果 metadata 无效。');
  return value;
}

function movieTime(bytes: Uint8Array, box: Mp4Box): { timescale: number; duration: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[box.payloadStart];
  if (version === 0)
    return { timescale: uint32(view, box.payloadStart + 12, box.end), duration: uint32(view, box.payloadStart + 16, box.end) };
  if (version === 1)
    return { timescale: uint32(view, box.payloadStart + 20, box.end), duration: uint64(view, box.payloadStart + 24, box.end) };
  reject(502, '媒体供应商 MP4 结果 metadata 版本不受支持。');
}

function trackDimensions(bytes: Uint8Array, box: Mp4Box): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[box.payloadStart];
  const offset = version === 0 ? 76 : version === 1 ? 88 : -1;
  if (offset < 0) reject(502, '媒体供应商 MP4 结果 metadata 版本不受支持。');
  const width = uint32(view, box.payloadStart + offset, box.end) / 65536;
  const height = uint32(view, box.payloadStart + offset + 4, box.end) / 65536;
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0)
    reject(502, '媒体供应商 MP4 结果缺少真实尺寸。');
  return { width, height };
}

function sampleDimensions(bytes: Uint8Array, box: Mp4Box): { width: number; height: number; codec: 'h264' } {
  const entries = uint32(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), box.payloadStart + 4, box.end);
  if (entries < 1) reject(502, '媒体供应商 MP4 结果缺少真实 codec。');
  const sample = mp4Boxes(bytes, box.payloadStart + 8, box.end)[0];
  if (!sample || !['avc1', 'avc3'].includes(sample.type)) reject(502, '媒体供应商 MP4 codec 不受支持。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const width = view.getUint16(sample.payloadStart + 24);
  const height = view.getUint16(sample.payloadStart + 26);
  if (!width || !height) reject(502, '媒体供应商 MP4 结果缺少真实尺寸。');
  return { width, height, codec: 'h264' };
}

function parseVideoMetadata(bytes: Uint8Array) {
  const topLevel = mp4Boxes(bytes, 0, bytes.byteLength);
  const moov = topLevel.find(box => box.type === 'moov');
  if (!moov) reject(502, '媒体供应商 MP4 结果容器无效。');
  const moovChildren = children(bytes, moov);
  const movieHeader = moovChildren.find(box => box.type === 'mvhd');
  const movieDuration = movieHeader ? movieTime(bytes, movieHeader) : null;
  for (const track of moovChildren.filter(box => box.type === 'trak')) {
    const trackChildren = children(bytes, track);
    const trackHeader = trackChildren.find(box => box.type === 'tkhd');
    const media = trackChildren.find(box => box.type === 'mdia');
    if (!trackHeader || !media) continue;
    const mediaChildren = children(bytes, media);
    const mediaHeader = mediaChildren.find(box => box.type === 'mdhd');
    const mediaInfo = mediaChildren.find(box => box.type === 'minf');
    const sampleTable = mediaInfo && children(bytes, mediaInfo).find(box => box.type === 'stbl');
    const sampleDescription = sampleTable && children(bytes, sampleTable).find(box => box.type === 'stsd');
    if (!mediaHeader || !sampleDescription) continue;
    const sample = sampleDimensions(bytes, sampleDescription);
    const trackSize = trackDimensions(bytes, trackHeader);
    const time = movieDuration?.timescale ? movieDuration : movieTime(bytes, mediaHeader);
    if (!time.timescale || !time.duration) continue;
    return {
      width: trackSize.width || sample.width,
      height: trackSize.height || sample.height,
      durationMs: Math.round((time.duration / time.timescale) * 1000),
      codec: sample.codec
    };
  }
  reject(502, '媒体供应商 MP4 结果缺少真实 metadata。');
}

function videoDimensions(bytes: Uint8Array, response: Response) {
  try {
    return parseVideoMetadata(bytes);
  } catch {
    const header = (name: string) => {
      const value = Number(response.headers.get(name));
      return Number.isSafeInteger(value) && value > 0 ? value : null;
    };
    const width = header('x-aiao-media-width');
    const height = header('x-aiao-media-height');
    const durationMs = header('x-aiao-media-duration-ms');
    const codec = response.headers.get('x-aiao-media-codec');
    if (width && height && durationMs && codec === 'h264') return { width, height, durationMs, codec };
    reject(502, '媒体供应商 MP4 结果缺少真实 metadata。');
  }
}

function validateMp4(bytes: Uint8Array) {
  const boxes = mp4Boxes(bytes, 0, bytes.byteLength);
  const types = new Set(boxes.map(box => box.type));
  if (!types.has('ftyp') || !types.has('moov') || !types.has('mdat'))
    reject(502, '媒体供应商 MP4 结果容器无效。');
}

function mediaResultUrl(value: unknown): string | undefined {
  const input = object(value);
  const first = Array.isArray(input['data']) ? object(input['data'][0]) : {};
  const candidate = input['url'] ?? input['audio_url'] ?? input['video_url'] ?? first['url'] ?? first['audio_url'] ?? first['video_url'];
  if (candidate === undefined) return undefined;
  if (typeof candidate !== 'string' || !candidate) reject(502, '媒体供应商结果地址无效。');
  return candidate;
}

async function resolveMediaResponse(
  response: Response,
  bytes: Uint8Array<ArrayBuffer>,
  parsed: unknown,
  dispatch: MediaDispatch
): Promise<{ response: Response; bytes: Uint8Array<ArrayBuffer>; parsed: unknown }> {
  if (dispatch.resultKind === 'transcript') return { response, bytes, parsed };
  const url = mediaResultUrl(parsed);
  if (!url) return { response, bytes, parsed };
  let target: URL;
  let endpoint: URL;
  try {
    target = new URL(url);
    endpoint = new URL(dispatch.url);
  } catch {
    reject(502, '媒体供应商结果地址无效。');
  }
  if (target.protocol !== 'https:' || target.origin !== endpoint.origin) reject(502, '媒体供应商结果地址不受支持。');
  const fetchResult = dispatch.fetchResult ?? ((input: string, init: RequestInit) => fetch(input, init));
  const mediaResponse = await fetchResult(target.href, {
    method: 'GET',
    redirect: 'error',
    ...(dispatch.authorization ? { headers: { authorization: dispatch.authorization } } : {})
  });
  if (!mediaResponse.ok) {
    await mediaResponse.body?.cancel();
    reject(mediaResponse.status >= 400 && mediaResponse.status < 500 ? 400 : 502, '媒体供应商结果下载失败。');
  }
  return { response: mediaResponse, bytes: await responseBytes(mediaResponse, dispatch.maxResultBytes), parsed: undefined };
}

export async function normalizeMediaResponse(
  response: Response,
  dispatch: MediaDispatch
): Promise<NormalizedMediaResult> {
  if (!response.ok) {
    await response.body?.cancel();
    reject(response.status >= 400 && response.status < 500 ? 400 : 502, '媒体供应商拒绝本次任务。');
  }
  const contentType = response.headers.get('content-type')?.split(';', 1)[0].trim();
  const bytes = await responseBytes(response, dispatch.maxResultBytes);
  if (dispatch.resultKind === 'transcript') {
    const parsed = jsonValue(bytes);
    const value = object(parsed);
    const text = typeof value['text'] === 'string' ? value['text'].trim() : '';
    if (!text) reject(502, '媒体供应商返回空 Transcript。');
    const language = typeof value['language'] === 'string' ? value['language'] : typeof value['language_code'] === 'string' ? value['language_code'] : 'und';
    const manifest = validateTranscriptResult({
      kind: 'transcript',
      text,
      language,
      detectedLanguage: value['detectedLanguage'] === true || value['detected_language'] === true,
      characters: Array.from(text).length,
      sha256: await digest(encoder.encode(text))
    });
    const requestId = providerRequestId(response, parsed);
    return {
      bytes: encoder.encode(JSON.stringify(manifest)),
      mediaType: 'application/json',
      manifest,
      ...(requestId ? { providerRequestId: requestId } : {})
    };
  }
  const initialParsed = contentType === 'application/json' ? jsonValue(bytes) : undefined;
  const resolved = await resolveMediaResponse(response, bytes, initialParsed, dispatch);
  const resolvedContentType = resolved.response.headers.get('content-type')?.split(';', 1)[0].trim();
  const parsed = resolved.parsed;
  if (dispatch.resultKind === 'audio') {
    const maxDurationMs = dispatch.maxResultDurationMs ??
      (dispatch.operation === 'text-to-speech' ? AUDIO_DURATION_MAX_MS : MUSIC_DURATION_MAX_MS);
    const audio = resolvedContentType === 'audio/wav' ? resolved.bytes : audioFromJson(parsed);
    const { durationMs } = parseWav(audio, maxDurationMs);
    const manifest = validateAudioResultMetadata({
      kind: 'audio' as const,
      mediaType: 'audio/wav' as const,
      format: 'wav' as const,
      durationMs,
      sampleRate: 32000 as const,
      channels: 1 as const,
      bytes: audio.byteLength,
      sha256: await digest(audio)
    }, dispatch.maxResultBytes, maxDurationMs) as AudioResultManifest;
    const requestId = providerRequestId(response, initialParsed);
    return { bytes: audio, mediaType: 'audio/wav', manifest, ...(requestId ? { providerRequestId: requestId } : {}) };
  }
  const maxDurationMs = dispatch.maxResultDurationMs ?? VIDEO_DURATION_MAX_MS;
  const video = resolvedContentType === 'video/mp4' ? resolved.bytes : videoFromJson(parsed);
  validateMp4(video);
  const dimensions = videoDimensions(video, resolved.response);
  const manifest = validateVideoResultMetadata({
    kind: 'video' as const,
    mediaType: 'video/mp4' as const,
    format: 'mp4' as const,
    codec: dimensions.codec,
    width: dimensions.width,
    height: dimensions.height,
    durationMs: dimensions.durationMs,
    bytes: video.byteLength,
    sha256: await digest(video)
  }, dispatch.maxResultBytes, maxDurationMs) as VideoResultManifest;
  const requestId = providerRequestId(response, initialParsed);
  return { bytes: video, mediaType: 'video/mp4', manifest, ...(requestId ? { providerRequestId: requestId } : {}) };
}

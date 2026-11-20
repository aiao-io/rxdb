import { ASR_AUDIO_DURATION_MAX_MS, ASR_AUDIO_MAX_BYTES, isGenerationUuid } from '@aiao-media/api-contracts';
import { member, reject, response, sameOriginWrite } from './product-http.ts';
import type { RelayResultStore, WorkerEnv } from './worker-env.ts';

export interface ParsedWav {
  bytes: number;
  durationMs: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
}
export interface MediaInputReference {
  id: string;
  mediaType: 'audio/wav';
  bytes: number;
  durationMs: number;
  sha256: string;
  expiresAt: string;
}
const read32 = (view: DataView, offset: number) => view.getUint32(offset, true);
const read16 = (view: DataView, offset: number) => view.getUint16(offset, true);
const text = (bytes: Uint8Array, offset: number, size: number) => new TextDecoder().decode(bytes.subarray(offset, offset + size));

/** 解析受支持的 PCM WAV，拒绝带私有路径或未知容器的输入。 */
export function parseWav(bytes: Uint8Array): ParsedWav {
  if (bytes.byteLength < 46 || text(bytes, 0, 4) !== 'RIFF' || text(bytes, 8, 4) !== 'WAVE')
    reject(400, 'ASR 仅支持有效的 WAV 音频。');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let format: { channels: number; sampleRate: number; bitsPerSample: number } | null = null;
  let dataBytes = 0;
  for (let offset = 12; offset + 8 <= bytes.byteLength; ) {
    const size = read32(view, offset + 4);
    const next = offset + 8 + size + (size % 2);
    if (next > bytes.byteLength) reject(400, 'WAV 音频块无效。');
    if (text(bytes, offset, 4) === 'fmt ' && size >= 16) {
      if (read16(view, offset + 8) !== 1) reject(400, 'ASR 只支持 PCM WAV。');
      format = {
        channels: read16(view, offset + 10),
        sampleRate: read32(view, offset + 12),
        bitsPerSample: read16(view, offset + 22)
      };
    }
    if (text(bytes, offset, 4) === 'data') dataBytes = size;
    offset = next;
  }
  if (!format || !dataBytes || ![1, 2].includes(format.channels) || ![8, 16, 24, 32].includes(format.bitsPerSample))
    reject(400, 'WAV 音频格式不受支持。');
  const bytesPerSecond = format.sampleRate * format.channels * (format.bitsPerSample / 8);
  const durationMs = Math.round((dataBytes / bytesPerSecond) * 1000);
  if (!Number.isSafeInteger(durationMs) || durationMs <= 0 || durationMs > ASR_AUDIO_DURATION_MAX_MS)
    reject(400, '音频时长超出 ASR 限制。');
  return { bytes: bytes.byteLength, durationMs, ...format };
}
async function readBytes(request: Request): Promise<Uint8Array<ArrayBuffer>> {
  const contentType = request.headers.get('content-type')?.split(';', 1)[0].trim();
  if (contentType !== 'audio/wav') reject(400, 'ASR 输入必须是 audio/wav。');
  if (request.body === null) reject(400, 'ASR 输入为空。');
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      size += item.value.byteLength;
      if (size > ASR_AUDIO_MAX_BYTES) reject(400, 'ASR 输入超过大小限制。');
      chunks.push(item.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}
async function sha256(bytes: Uint8Array): Promise<string> {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>)),
    byte => byte.toString(16).padStart(2, '0')
  ).join('');
}
function store(env: WorkerEnv): RelayResultStore {
  const value = env.MEDIA_INPUTS;
  if (!value) reject(503, '媒体输入存储尚未启用。');
  return value;
}

function ownerMetadata(value: { customMetadata?: Record<string, string> } | null, ownerId: string): boolean {
  return value?.customMetadata?.ownerId === ownerId;
}

/** 删除任务已经消费或放弃的临时输入，调用方必须先完成任务所有权校验。 */
export async function removeStoredMediaInput(env: WorkerEnv, inputId: string, ownerId: string): Promise<void> {
  if (!isGenerationUuid(inputId)) return;
  const bucket = env.MEDIA_INPUTS;
  if (!bucket) return;
  const metadata = await bucket.head(`inputs/${inputId}`);
  if (!metadata || !ownerMetadata(metadata, ownerId)) return;
  await bucket.delete(`inputs/${inputId}`);
}

/** 接收临时 ASR 输入并返回不含原始字节的短期引用。 */
export async function uploadMediaInput(request: Request, env: WorkerEnv): Promise<Response> {
  const { userId } = await member(request, env);
  sameOriginWrite(request, env);
  const bytes = await readBytes(request);
  const parsed = parseWav(bytes);
  const id = crypto.randomUUID();
  const reference: MediaInputReference = {
    id,
    mediaType: 'audio/wav',
    bytes: parsed.bytes,
    durationMs: parsed.durationMs,
    sha256: await sha256(bytes),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
  };
  await store(env).put(`inputs/${id}`, bytes, {
    httpMetadata: { contentType: 'audio/wav' },
    customMetadata: { ownerId: userId, expiresAt: reference.expiresAt, sha256: reference.sha256 }
  });
  return response(reference, 201);
}

/** 删除临时输入，重复删除保持成功。 */
export async function deleteMediaInput(request: Request, env: WorkerEnv, inputId: string): Promise<Response> {
  const { userId } = await member(request, env);
  sameOriginWrite(request, env);
  if (!isGenerationUuid(inputId)) reject(404, '媒体输入不存在。');
  const bucket = store(env);
  const metadata = await bucket.head(`inputs/${inputId}`);
  if (metadata && !ownerMetadata(metadata, userId)) reject(404, '媒体输入不存在。');
  await bucket.delete(`inputs/${inputId}`);
  return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
}

/** 任务执行前重新读取输入对象并核对所有权之外的全部公开元数据。 */
export async function readMediaInput(
  env: WorkerEnv,
  reference: MediaInputReference,
  ownerId: string
): Promise<Uint8Array<ArrayBuffer>> {
  if (Date.parse(reference.expiresAt) <= Date.now()) reject(400, 'ASR 输入已过期，请重新上传。');
  const object = await store(env).get(`inputs/${reference.id}`);
  if (!object) reject(400, 'ASR 输入已过期，请重新上传。');
  if (!ownerMetadata(object, ownerId)) reject(404, '媒体输入不存在。');
  const bytes = new Uint8Array(await new Response(object.body).arrayBuffer());
  if (bytes.byteLength > ASR_AUDIO_MAX_BYTES) reject(400, 'ASR 输入超过大小限制。');
  const parsed = parseWav(bytes);
  if (
    reference.mediaType !== 'audio/wav' ||
    reference.bytes !== bytes.byteLength ||
    reference.durationMs !== parsed.durationMs ||
    reference.sha256 !== (await sha256(bytes))
  )
    reject(400, 'ASR 输入引用与对象内容不一致。');
  return bytes;
}

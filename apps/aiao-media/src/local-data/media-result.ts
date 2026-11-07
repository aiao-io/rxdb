import {
  validateAudioResultMetadata,
  validateVideoResultMetadata,
  type AudioResultMetadata,
  type VideoResultMetadata
} from '../contracts/index';

export type LocalAssetKind = 'audio' | 'video';
export type LocalAssetResult = AudioResultMetadata | VideoResultMetadata;
export class MediaResultError extends Error {
  constructor(
    message: string,
    readonly code: 'corrupt' | 'unavailable' | 'locked' = 'corrupt'
  ) {
    super(message);
    this.name = 'MediaResultError';
  }
}
export function mediaResultMetadata(kind: LocalAssetKind, value: unknown): LocalAssetResult {
  try {
    if (kind !== 'audio' && kind !== 'video') throw new Error('unknown media kind');
    return kind === 'audio' ? validateAudioResultMetadata(value) : validateVideoResultMetadata(value);
  } catch {
    throw new MediaResultError('本地媒体实际格式/大小/时长记录无效。');
  }
}
/** Bounded canonical WAV / MP4 envelope checks. MP4 first-frame decoding is
 * required on save, explicit read and ACK verification; not a full decoder or
 * provider/codec proof. Recovery checks the same previously validated digest. */
export async function validateMediaBlob(
  kind: LocalAssetKind,
  blob: Blob,
  value: unknown,
  signal?: AbortSignal,
  decode = true
): Promise<LocalAssetResult> {
  const expected = mediaResultMetadata(kind, value);
  if (signal?.aborted) throw new MediaResultError('本地媒体访问已锁定。', 'locked');
  if (blob.type !== expected.mediaType || blob.size !== expected.bytes)
    throw new MediaResultError('本地媒体文件与 MIME/大小记录不一致。');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = (start: number, end: number) => new TextDecoder('latin1').decode(bytes.subarray(start, end));
  if (kind === 'audio') {
    if (
      bytes.length < 46 ||
      text(0, 4) !== 'RIFF' ||
      view.getUint32(4, true) !== bytes.length - 8 ||
      text(8, 16) !== 'WAVEfmt ' ||
      view.getUint32(16, true) !== 16 ||
      view.getUint16(20, true) !== 1 ||
      view.getUint16(22, true) !== 1 ||
      view.getUint32(24, true) !== 32000 ||
      view.getUint32(28, true) !== 64000 ||
      view.getUint16(32, true) !== 2 ||
      view.getUint16(34, true) !== 16 ||
      text(36, 40) !== 'data' ||
      view.getUint32(40, true) !== bytes.length - 44
    )
      throw new MediaResultError('本地 WAV 不是回执声明的完整 PCM16/单声道/32 kHz 文件。');
  } else {
    let offset = 0,
      count = 0;
    const boxes = new Set<string>();
    while (offset < bytes.length) {
      if (offset + 8 > bytes.length || ++count > 256) throw new MediaResultError('本地 MP4 容器不完整。');
      const size = view.getUint32(offset),
        type = text(offset + 4, offset + 8);
      if (
        size < 8 ||
        offset + size > bytes.length ||
        !/^[\x20-\x7e]{4}$/.test(type) ||
        (offset === 0 && (type !== 'ftyp' || size < 16))
      )
        throw new MediaResultError('本地 MP4 容器边界无效。');
      boxes.add(type);
      offset += size;
    }
    if (!boxes.has('moov') || !boxes.has('mdat')) throw new MediaResultError('本地 MP4 缺少视频元数据或媒体数据。');
    if (decode) {
      const url = await decodeVideoPreview(
        blob,
        expected as VideoResultMetadata,
        signal ?? new AbortController().signal
      );
      URL.revokeObjectURL(url);
    }
  }
  if (signal?.aborted) throw new MediaResultError('本地媒体访问已锁定。', 'locked');
  return expected;
}

/** Checks decoded dimensions/duration and first-frame usability, not every frame.
 * Never starts playback automatically. URL ownership transfers only on success. */
export async function decodeVideoPreview(
  blob: Blob,
  expected: { width: number; height: number; durationMs: number },
  signal: AbortSignal
): Promise<string> {
  if (signal.aborted) throw new MediaResultError('视频访问已锁定。');
  const video = document.createElement('video');
  const url = URL.createObjectURL(blob);
  let ready = false;
  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        video.onloadeddata = null;
        video.onerror = null;
      };
      const fail = (message: string, code: 'corrupt' | 'unavailable' | 'locked' = 'corrupt') => {
        cleanup();
        reject(new MediaResultError(message, code));
      };
      const abort = () => fail('视频访问已锁定。', 'locked');
      const timer = setTimeout(() => fail('视频解码超时；不自动重新生成。', 'unavailable'), 10_000);
      signal.addEventListener('abort', abort, { once: true });
      video.onloadeddata = () => {
        if (signal.aborted) {
          abort();
          return;
        }
        if (
          video.videoWidth !== expected.width ||
          video.videoHeight !== expected.height ||
          !Number.isFinite(video.duration) ||
          Math.abs(video.duration * 1000 - expected.durationMs) > 50
        ) {
          fail('浏览器解码的尺寸/时长与任务回执不一致；停止播放和下载。');
          return;
        }
        cleanup();
        resolve();
      };
      video.onerror = () => fail('浏览器无法解码此视频；停止播放和下载，不自动重新生成。');
      try {
        video.preload = 'auto';
        video.muted = true;
        video.playsInline = true;
        video.src = url;
        video.load();
      } catch {
        fail('浏览器无法初始化视频解码；停止播放和下载。');
      }
    });
    if (signal.aborted) throw new MediaResultError('视频访问已锁定。');
    ready = true;
    return url;
  } finally {
    video.removeAttribute('src');
    // Cleanup failure must not leak the URL or mask the original decode error.
    try {
      video.load();
    } catch {
      /* Decoder already detached from the Blob. */
    }
    if (!ready) URL.revokeObjectURL(url);
  }
}

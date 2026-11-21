// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mediaResultMetadata, validateMediaBlob } from './media-result';

function wav() {
  const bytes = new Uint8Array(64044),
    view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => bytes.set(new TextEncoder().encode(value), offset);
  text(0, 'RIFF');
  view.setUint32(4, bytes.length - 8, true);
  text(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 32000, true);
  view.setUint32(28, 64000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, 64000, true);
  return bytes;
}
const audio = {
  mediaType: 'audio/wav',
  format: 'wav',
  durationMs: 1000,
  sampleRate: 32000,
  channels: 1,
  bytes: 64044
};
const video = {
  mediaType: 'video/mp4',
  format: 'mp4',
  codec: 'h264',
  width: 32,
  height: 18,
  durationMs: 5000,
  bytes: 152
};
/** Envelope fixture only. Actual H.264 decoding is covered by Chromium/Electron. */
function mp4() {
  const bytes = new Uint8Array(152),
    view = new DataView(bytes.buffer);
  for (const [offset, size, name] of [
    [0, 32, 'ftyp'],
    [32, 16, 'moov'],
    [48, 104, 'mdat']
  ] as const) {
    view.setUint32(offset, size);
    bytes.set(new TextEncoder().encode(name), offset + 4);
  }
  return bytes;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe('shared persisted media validation, independent of server delivery TTL', () => {
  it('accepts full canonical WAV with actual byte-derived duration', async () => {
    const metadata = await validateMediaBlob('audio', new Blob([wav()], { type: 'audio/wav' }), audio);
    expect(metadata).toEqual(audio);
    expect(metadata).not.toBe(audio);
  });
  it.each([
    { mediaType: 'audio/mpeg' },
    { durationMs: 1001 },
    { sampleRate: 48000 },
    { channels: 2 },
    { bytes: 64043 },
    { durationMs: 120001 },
    { url: 'https://example.test/audio' }
  ])('rejects inconsistent or expanded audio metadata %j', patch => {
    expect(() => mediaResultMetadata('audio', { ...audio, ...patch })).toThrow();
  });
  it.each([0, 4, 8, 16, 20, 22, 24, 28, 32, 34, 36, 40])(
    'rejects non-canonical WAV header corruption at %i',
    async offset => {
      const bytes = wav();
      bytes[offset] ^= 1;
      await expect(validateMediaBlob('audio', new Blob([bytes], { type: 'audio/wav' }), audio)).rejects.toThrow('WAV');
    }
  );
  it('rejects mismatched MIME and truncated bytes before reading any decoder', async () => {
    await expect(validateMediaBlob('audio', new Blob([wav()], { type: 'text/html' }), audio)).rejects.toThrow('MIME');
    await expect(
      validateMediaBlob('audio', new Blob([wav().slice(0, -2)], { type: 'audio/wav' }), audio)
    ).rejects.toThrow('大小');
  });
  it('checks bounded full MP4 boxes during recovery, without starting a decoder', async () => {
    expect(await validateMediaBlob('video', new Blob([mp4()], { type: 'video/mp4' }), video, undefined, false)).toEqual(
      video
    );
  });
  it.each([0, 32, 48])('rejects MP4 zero, extended or out-of-bound box lengths at %i', async offset => {
    for (const size of [0, 1, 1000]) {
      const bytes = mp4();
      new DataView(bytes.buffer).setUint32(offset, size);
      await expect(
        validateMediaBlob('video', new Blob([bytes], { type: 'video/mp4' }), video, undefined, false)
      ).rejects.toThrow('MP4');
    }
  });
  it('requires both MP4 metadata and media data boxes', async () => {
    const bytes = mp4();
    bytes.set(new TextEncoder().encode('free'), 36);
    await expect(
      validateMediaBlob('video', new Blob([bytes], { type: 'video/mp4' }), video, undefined, false)
    ).rejects.toThrow('缺少');
  });
  it('decodes first frame on explicit video validation and releases its temporary URL', async () => {
    const element = {
      videoWidth: 32,
      videoHeight: 18,
      duration: 5,
      onloadeddata: null as (() => void) | null,
      onerror: null,
      load: vi.fn(function () {
        queueMicrotask(() => element.onloadeddata?.());
      }),
      removeAttribute: vi.fn(),
      play: vi.fn()
    };
    vi.stubGlobal('document', { createElement: () => element });
    const create = vi.spyOn(URL, 'createObjectURL'),
      revoke = vi.spyOn(URL, 'revokeObjectURL');
    await validateMediaBlob('video', new Blob([mp4()], { type: 'video/mp4' }), video);
    expect(create).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith(create.mock.results[0].value);
    expect(element.play).not.toHaveBeenCalled();
    expect(element.onloadeddata).toBeNull();
  });
  it('locked access cannot validate or allocate a preview', async () => {
    const controller = new AbortController();
    controller.abort();
    const create = vi.spyOn(URL, 'createObjectURL');
    await expect(
      validateMediaBlob('video', new Blob([mp4()], { type: 'video/mp4' }), video, controller.signal)
    ).rejects.toMatchObject({ code: 'locked' });
    expect(create).not.toHaveBeenCalled();
  });
});

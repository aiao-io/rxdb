import { describe, expect, it } from 'vitest';

import { synthWav } from './wav';

const ascii = (bytes: Uint8Array, at: number, length: number): string =>
  String.fromCharCode(...bytes.slice(at, at + length));

describe('synthWav', () => {
  it('写出 16 位单声道 PCM 的 RIFF/WAVE 文件头', () => {
    const wav = synthWav({ seconds: 1, sampleRate: 8_000, notes: [{ start: 0, duration: 0.5, frequency: 440 }] });
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(ascii(wav, 0, 4)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(wav.length - 8);
    expect(ascii(wav, 8, 8)).toBe('WAVEfmt ');
    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(8_000);
    expect(view.getUint16(34, true)).toBe(16);
    expect(ascii(wav, 36, 4)).toBe('data');
    expect(view.getUint32(40, true)).toBe(16_000);
    expect(wav.length).toBe(44 + 16_000);
  });

  it('有声音的地方采样不为零，音符之外是静音，且不削波', () => {
    const wav = synthWav({ seconds: 1, sampleRate: 8_000, notes: [{ start: 0, duration: 0.5, frequency: 440 }] });
    const samples = new Int16Array(wav.buffer.slice(44));
    const peak = (from: number, to: number): number =>
      Math.max(...Array.from(samples.slice(from, to), value => Math.abs(value)));
    expect(peak(400, 3_600)).toBeGreaterThan(2_000);
    expect(peak(4_400, 8_000)).toBe(0);
    expect(peak(0, 8_000)).toBeLessThan(32_767);
  });
});

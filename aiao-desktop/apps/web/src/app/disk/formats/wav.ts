export interface WavNote {
  /** 起点与时长，秒。 */
  readonly start: number;
  readonly duration: number;
  readonly frequency: number;
  readonly gain?: number;
}

export interface WavOptions {
  readonly seconds: number;
  readonly sampleRate: number;
  readonly notes: readonly WavNote[];
}

/** 叠一个音符：基音加两个泛音，短起音、指数衰减，在时长末尾正好落到零。 */
function addNote(samples: Float32Array, sampleRate: number, note: WavNote): void {
  const from = Math.max(0, Math.round(note.start * sampleRate));
  const to = Math.min(samples.length, Math.round((note.start + note.duration) * sampleRate));
  const length = to - from;
  const attack = Math.max(1, Math.min(0.015 * sampleRate, length / 4));
  const gain = note.gain ?? 1;
  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;
    const rise = Math.min(1, i / attack);
    const fall = Math.exp((-3 * i) / length) * (1 - i / length);
    const phase = 2 * Math.PI * note.frequency * t;
    const tone = Math.sin(phase) + 0.35 * Math.sin(2 * phase) + 0.12 * Math.sin(3 * phase);
    samples[from + i] += tone * rise * fall * gain;
  }
}

/** 合成一段 16 位单声道 PCM 的 WAV；整体归一化到满幅的 85%，不会削波。 */
export function synthWav({ seconds, sampleRate, notes }: WavOptions): Uint8Array {
  const samples = new Float32Array(Math.round(seconds * sampleRate));
  for (const note of notes) addNote(samples, sampleRate, note);
  const peak = samples.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
  const scale = peak > 0 ? 0.85 / peak : 0;
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i++) view.setUint8(at + i, text.charCodeAt(i));
  };
  ascii(0, 'RIFF');
  view.setUint32(4, buffer.byteLength - 8, true);
  ascii(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  samples.forEach((value, i) => view.setInt16(44 + i * 2, Math.round(value * scale * 32_767), true));
  return new Uint8Array(buffer);
}

/* 音乐是真的在响：单个 HTML 里没有可授权的音频可放，所以每首歌都由序号推出调式、
   速度和和弦进行，再用 pad、bass、pluck 和鼓合成。同一首歌每次都是同样的音符，
   走带读的是音频时钟，进度条跟着耳朵听到的走。 */

/** 各调式每一级相对主音的半音数。 */
const MODES = {
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  major: [0, 2, 4, 5, 7, 9, 11],
  lydian: [0, 2, 4, 6, 7, 9, 11]
} as const;

/** 和弦进行：每小节一个根音级数。 */
const PROGS = [
  [0, 5, 3, 4],
  [0, 4, 5, 3],
  [5, 3, 0, 4],
  [0, 3, 1, 4]
] as const;

const ROOTS = [57, 55, 60, 53, 58, 62, 56, 59, 61, 54];
const MODE_NAMES = ['minor', 'dorian', 'minor', 'major', 'dorian', 'lydian'] as const;
/** 暖色专辑：节奏更慢、不打鼓。 */
const WARM_ALBUMS = [2, 4, 5];
/** 琶音走向：爬升再回落，免得像在行军。 */
const ARP_SHAPE = [0, 2, 4, 6, 4, 2, 4, 2];

/** 每 40ms 调度一次，向前多排 180ms：Web Audio 的音符必须提前排好。 */
const TICK_MS = 40;
const LOOKAHEAD = 0.18;

const hz = (midi: number): number => 440 * Math.pow(2, (midi - 69) / 12);

/** 一首歌的全部乐理参数；用固定表而不是随机数，所以每次播放都一样。 */
interface Recipe {
  readonly root: number;
  readonly scale: readonly number[];
  readonly prog: readonly number[];
  readonly bpm: number;
  readonly drums: boolean;
  readonly arpDiv: number;
  readonly verb: number;
  readonly cutoff: number;
}

const recipeFor = (index: number, album: number): Recipe => {
  const warm = WARM_ALBUMS.includes(album);
  return {
    root: ROOTS[index % ROOTS.length],
    scale: MODES[MODE_NAMES[album % MODE_NAMES.length]],
    prog: PROGS[index % PROGS.length],
    bpm: warm ? 72 + ((index * 5) % 14) : 88 + ((index * 7) % 26),
    drums: !warm,
    /* 暖色唱片的拨弦更慢更软，尾音更宽。 */
    arpDiv: warm ? 2 : 1,
    verb: warm ? 0.46 : 0.3,
    cutoff: warm ? 900 : 1500
  };
};

/** 一个八分音符的时长（秒）。 */
const eighth = (rec: Recipe): number => 60 / rec.bpm / 2;

interface Graph {
  readonly ctx: AudioContext;
  readonly master: GainNode;
  readonly wet: GainNode;
  readonly verbIn: ConvolverNode;
  readonly delayIn: DelayNode;
}

/** 各个声部：每个都只是往音频图里排一串节点。 */
class Voices {
  private readonly graph: Graph;
  private readonly rec: Recipe;

  constructor(graph: Graph, rec: Recipe) {
    this.graph = graph;
    this.rec = rec;
  }

  pad(degrees: readonly number[], t: number, dur: number): void {
    const { ctx, master, verbIn } = this.graph;
    const cutoff = this.rec.cutoff;
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = cutoff;
    lowpass.Q.value = 0.7;
    /* 滤波器一开一合，持续的和弦才不会死板。 */
    lowpass.frequency.setValueAtTime(cutoff * 0.7, t);
    lowpass.frequency.linearRampToValueAtTime(cutoff * 1.25, t + dur * 0.55);
    lowpass.frequency.linearRampToValueAtTime(cutoff * 0.8, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.1, t + dur * 0.28);
    gain.gain.setValueAtTime(0.1, t + dur * 0.7);
    gain.gain.linearRampToValueAtTime(0, t + dur);
    lowpass.connect(gain);
    gain.connect(master);
    gain.connect(verbIn);
    for (const degree of degrees) {
      this.detuned(degree, -5, lowpass, t, dur);
      this.detuned(degree, 5, lowpass, t, dur);
    }
  }

  bass(degree: number, t: number, dur: number): void {
    const { ctx, master } = this.graph;
    const body = ctx.createOscillator();
    body.type = 'triangle';
    body.frequency.value = hz(this.note(degree, -1));
    const sub = ctx.createOscillator();
    sub.type = 'sine';
    sub.frequency.value = hz(this.note(degree, -2));
    this.envelope(body, t, 0.012, dur, 0.3).connect(master);
    this.envelope(sub, t, 0.012, dur, 0.22).connect(master);
    body.start(t);
    body.stop(t + dur + 0.05);
    sub.start(t);
    sub.stop(t + dur + 0.05);
  }

  pluck(degree: number, t: number, velocity = 1): void {
    const { ctx, master, delayIn, verbIn } = this.graph;
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = hz(this.note(degree, 2));
    const gain = this.envelope(osc, t, 0.004, 0.34, 0.085 * velocity);
    gain.connect(master);
    gain.connect(delayIn);
    gain.connect(verbIn);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  kick(t: number): void {
    const { ctx, master } = this.graph;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(46, t + 0.11);
    this.envelope(osc, t, 0.003, 0.17, 0.5).connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  noise(t: number, dur: number, freq: number, peak: number, type: BiquadFilterType = 'highpass'): void {
    const { ctx, master } = this.graph;
    const length = Math.floor(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    source.connect(filter);
    this.envelope(filter, t, 0.002, dur, peak).connect(master);
    source.start(t);
    source.stop(t + dur + 0.02);
  }

  /** 音阶级数转 MIDI 音高；越过第七级就进入更高的八度。 */
  private note(degree: number, octave = 0): number {
    const scale = this.rec.scale;
    const n = scale.length;
    const shift = Math.floor(degree / n) + octave;
    return this.rec.root + scale[((degree % n) + n) % n] + 12 * shift;
  }

  private envelope(node: AudioNode, t: number, attack: number, decay: number, peak: number): GainNode {
    const gain = this.graph.ctx.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    node.connect(gain);
    return gain;
  }

  private detuned(degree: number, cents: number, target: AudioNode, t: number, dur: number): void {
    const osc = this.graph.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = hz(this.note(degree, 1));
    osc.detune.value = cents;
    osc.connect(target);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

/**
 * 合成器与走带。AudioContext 在第一次播放时才建（浏览器不允许没有手势就创建），
 * 音量随系统音量与静音状态走。
 */
export class Synth {
  private graph: Graph | null = null;
  private voices: Voices | null = null;
  private rec: Recipe | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private startAt = 0;
  private offset = 0;
  private nextBeat = 0;
  private beat = 0;
  private level = 0;

  /** 系统音量变了就调主增益；还没建 AudioContext 时先记下，等建好再用。 */
  setLevel(volume: number, muted: boolean): void {
    this.level = muted ? 0 : Math.pow(volume, 1.4) * 1.15;
    this.applyLevel();
  }

  /** 从 `from` 秒附近的小节线开始播（`album` 是这首歌所属专辑的次序）；浏览器没有 AudioContext 时返回 false。 */
  start(songIndex: number, album: number, from = 0): boolean {
    const graph = this.ensure();
    if (!graph) return false;
    const { ctx } = graph;
    if (ctx.state === 'suspended') void ctx.resume();
    this.clearTimer();
    const rec = recipeFor(songIndex, album);
    this.rec = rec;
    this.voices = new Voices(graph, rec);
    graph.wet.gain.value = rec.verb;
    this.startAt = ctx.currentTime + 0.06;
    /* 中途接着播也落在小节线上，和弦进行才听得清。 */
    const spb = eighth(rec);
    this.beat = Math.round(from / spb / 8) * 8;
    this.nextBeat = this.startAt;
    this.offset = this.beat * spb;
    this.applyLevel();
    this.tick();
    this.timer = setInterval(() => this.tick(), TICK_MS);
    return true;
  }

  /** 淡出而不是硬切，否则每次暂停都带一声咔哒。 */
  stop(): void {
    this.clearTimer();
    if (this.graph) this.graph.master.gain.setTargetAtTime(0, this.graph.ctx.currentTime, 0.02);
  }

  /** 当前听到的位置（秒）；没在播或没有 AudioContext 时为 null。 */
  position(): number | null {
    if (!this.graph || this.timer === null) return null;
    return this.offset + (this.graph.ctx.currentTime - this.startAt);
  }

  /** 窗口销毁时释放音频设备。 */
  dispose(): void {
    this.clearTimer();
    const ctx = this.graph?.ctx;
    this.graph = null;
    if (ctx && ctx.state !== 'closed') void ctx.close();
  }

  private ensure(): Graph | null {
    if (this.graph) return this.graph;
    if (typeof AudioContext === 'undefined') return null;
    const ctx = new AudioContext();

    /* 链尾放一个限幅器：pad、bass 和鼓都落在同一个强拍上，没有它，这些峰值会决定整体电平。 */
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 6;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.18;
    limiter.connect(ctx.destination);
    const master = ctx.createGain();
    master.connect(limiter);

    /* 混响用衰减的噪声脉冲：两秒的尾巴是「合成器演示」和「唱片」的差别。 */
    const length = Math.floor(ctx.sampleRate * 2.4);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.6);
    }
    const verbIn = ctx.createConvolver();
    verbIn.buffer = impulse;
    const wet = ctx.createGain();
    wet.gain.value = 0.34;
    verbIn.connect(wet);
    wet.connect(master);

    /* 一个八分音符的反馈延迟，让拨弦在里面弹来弹去。 */
    const delayIn = ctx.createDelay(1);
    delayIn.delayTime.value = 0.34;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;
    const delayWet = ctx.createGain();
    delayWet.gain.value = 0.22;
    delayIn.connect(feedback);
    feedback.connect(delayIn);
    delayIn.connect(delayWet);
    delayWet.connect(master);

    this.graph = { ctx, master, wet, verbIn, delayIn };
    this.applyLevel();
    return this.graph;
  }

  private applyLevel(): void {
    if (!this.graph) return;
    this.graph.master.gain.setTargetAtTime(this.level, this.graph.ctx.currentTime, 0.04);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private tick(): void {
    const { graph, rec } = this;
    if (!graph || !rec) return;
    const spb = eighth(rec);
    while (this.nextBeat < graph.ctx.currentTime + LOOKAHEAD) {
      this.scheduleBeat(rec, this.nextBeat, this.beat);
      this.nextBeat += spb;
      this.beat++;
    }
  }

  private scheduleBeat(rec: Recipe, t: number, beat: number): void {
    const voices = this.voices;
    if (!voices) return;
    const spb = eighth(rec);
    const inBar = beat % 8;
    const chord = rec.prog[Math.floor(beat / 8) % rec.prog.length];

    if (inBar === 0) voices.pad([chord, chord + 2, chord + 4], t, spb * 8 * 0.98);
    if (inBar === 0 || inBar === 5) voices.bass(chord, t, spb * 2.4);
    if (inBar === 3 && !rec.drums) voices.bass(chord + 4, t, spb * 1.6);

    /* 和弦音上的滚动琶音：每个八分音符一个（暖色唱片是每个四分音符一个）。 */
    if (beat % rec.arpDiv === 0) {
      const step = ARP_SHAPE[Math.floor(beat / rec.arpDiv) % ARP_SHAPE.length];
      voices.pluck(chord + step, t, inBar % 2 ? 0.72 : 1);
    }
    if (!rec.drums) return;
    if (inBar === 0 || inBar === 6) voices.kick(t);
    if (inBar === 4) voices.noise(t, 0.12, 1900, 0.16);
    if (inBar % 2 === 1) voices.noise(t, 0.035, 7200, 0.06);
  }
}

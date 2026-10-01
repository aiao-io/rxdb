import { createContext, runInContext } from 'node:vm';
import { LATIN1_SHIM_VAR, LATIN1_TEXT_DECODER_VAR, latin1ShimBanner } from '../scripts/build.mjs';
import { latin1ShimEngaged, readLatin1Shim, type Latin1ShimRecord } from './latin1-shim.js';

type DecoderLike = { decode(input?: unknown): string };
type DecoderConstructor = new (label?: string, options?: object) => DecoderLike;

/** 在独立上下文里求值 banner，`TextDecoder` 是这个上下文的全局（缺省时不定义）。 */
function evaluateBanner(TextDecoder?: unknown): { Shim: DecoderConstructor; record: Latin1ShimRecord } {
  const context = createContext(TextDecoder === undefined ? {} : { TextDecoder });
  const [Shim, record] = runInContext(
    `${latin1ShimBanner()}\n[${LATIN1_TEXT_DECODER_VAR}, ${LATIN1_SHIM_VAR}]`,
    context
  ) as [DecoderConstructor, Latin1ShimRecord];
  return { Shim, record };
}

/** 与 adapter polyfill 同样只认 utf-8、其余编码抛 RangeError 的委托。 */
class Utf8OnlyDecoder {
  constructor(label = 'utf-8') {
    if (label !== 'utf-8') throw new RangeError(`不支持的 TextDecoder 编码: ${label}`);
  }
  decode(): string {
    return 'utf8-delegate';
  }
}

const ALL_BYTES = Uint8Array.from({ length: 256 }, (_, index) => index);

describe('latin1ShimBanner', () => {
  it('委托拒绝 latin1 时顶上：256 个字节解成 256 个互不相同的字符，并记下次数与委托的原始错误', () => {
    const { Shim, record } = evaluateBanner(Utf8OnlyDecoder);
    const text = new Shim('latin1').decode(ALL_BYTES);
    expect(text).toHaveLength(256);
    expect(new Set(text).size).toBe(256);
    expect(new Shim('ISO-8859-1').decode(new Uint8Array([0x41, 0xe9]).buffer)).toBe('Aé');
    expect(record).toEqual({ engaged: 2, delegateError: expect.stringContaining('latin1') });
  });

  it('大输入分段拼接，不撞参数个数上限', () => {
    const { Shim } = evaluateBanner(Utf8OnlyDecoder);
    expect(new Shim('latin1').decode(new Uint8Array(200_000))).toHaveLength(200_000);
  });

  it('委托能解 latin1 时原样用委托，不记录', () => {
    const { Shim, record } = evaluateBanner(TextDecoder);
    expect(new Shim('latin1').decode(new Uint8Array([0x80]))).toBe('€');
    expect(record).toEqual({ engaged: 0, delegateError: null });
  });

  it('其余编码一律交给委托，委托的错误原样抛出', () => {
    const { Shim, record } = evaluateBanner(Utf8OnlyDecoder);
    expect(new Shim('utf-8').decode()).toBe('utf8-delegate');
    expect(() => new Shim('gbk')).toThrow(RangeError);
    expect(record.engaged).toBe(0);
  });

  it('全局根本没有 TextDecoder 时不凭空造一个：latin1 也照样 ReferenceError', () => {
    const { Shim, record } = evaluateBanner();
    // 错误来自 vm 上下文，跨 realm 不能用 instanceof 判
    expect(() => new Shim('latin1')).toThrow(expect.objectContaining({ name: 'ReferenceError' }));
    expect(() => new Shim('utf-8')).toThrow(expect.objectContaining({ name: 'ReferenceError' }));
    expect(record.engaged).toBe(0);
  });
});

describe('readLatin1Shim', () => {
  it('没有构建 banner（源码级运行）时为 null', () => {
    expect(readLatin1Shim()).toBeNull();
  });
});

describe('latin1ShimEngaged', () => {
  it('顶上过至少一次才算；没有记录不算', () => {
    expect(latin1ShimEngaged(null)).toBe(false);
    expect(latin1ShimEngaged({ engaged: 0, delegateError: null })).toBe(false);
    expect(latin1ShimEngaged({ engaged: 1, delegateError: 'RangeError: latin1' })).toBe(true);
  });
});

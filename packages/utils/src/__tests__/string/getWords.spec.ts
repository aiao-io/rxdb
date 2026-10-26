import { describe, expect, it } from 'vitest';
import { getWords } from '../../string/getWords.js';

describe('getWords', () => {
  it('按大小写与数字边界切分 ASCII 标识符', () => {
    expect(getWords('camelCaseString')).toEqual(['camel', 'Case', 'String']);
    expect(getWords('PascalCaseString')).toEqual(['Pascal', 'Case', 'String']);
    expect(getWords('stringWith123Numbers')).toEqual(['string', 'With', '123', 'Numbers']);
    expect(getWords('HTMLParser')).toEqual(['HTML', 'Parser']);
    expect(getWords('simple')).toEqual(['simple']);
    expect(getWords('')).toEqual([]);
  });

  it('保留带变音符的拉丁字母', () => {
    // 只认 [a-z] 的模式会把 é / ö 当作边界，切出 ['h', 'llo', 'w', 'rld']。
    expect(getWords('héllo wörld')).toEqual(['héllo', 'wörld']);
    expect(getWords('CaféMenu')).toEqual(['Café', 'Menu']);
  });

  it('保留无大小写概念的文字（中日韩）', () => {
    expect(getWords('用户名称')).toEqual(['用户名称']);
    expect(getWords('用户 名称')).toEqual(['用户', '名称']);
    expect(getWords('用户ID')).toEqual(['用户', 'ID']);
    expect(getWords('订单Item')).toEqual(['订单', 'Item']);
    expect(getWords('用户123')).toEqual(['用户', '123']);
  });
});

// 模式只认 Lu / Ll / N / Lo / Lm：组合标记（Mn / Mc / Me）、emoji 与 Lt 字母都被当成分隔符静默丢掉——
// NFD 输入的重音被删、印地文 / 泰文被拆碎、emoji 整个消失。
describe('组合标记、emoji 与 Lt 字母不被丢弃', () => {
  const nfd = (text: string): string => text.normalize('NFD');

  it('组合标记跟随前一个字符成词', () => {
    expect(getWords(nfd('café'))).toEqual([nfd('café')]);
    expect(getWords(nfd('CaféMenu ÉCOLE'))).toEqual([nfd('Café'), 'Menu', nfd('ÉCOLE')]);
    expect(getWords(nfd('Tiếng Việt'))).toEqual([nfd('Tiếng'), nfd('Việt')]);
    expect(getWords('हिन्दी')).toEqual(['हिन्दी']);
    expect(getWords('สวัสดี ชาวโลก')).toEqual(['สวัสดี', 'ชาวโลก']);
  });

  it('emoji 成词，ZWJ / 肤色 / 国旗 / 区旗 / keycap 序列保持完整', () => {
    const family = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
    const thumbsUp = '\u{1F44D}\u{1F3FD}';
    const flag = '\u{1F1E8}\u{1F1F3}';
    const scotland = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}';
    const keycap = '1\uFE0F\u20E3';

    expect(getWords('😀x')).toEqual(['😀', 'x']);
    expect(getWords('hello 👋 world')).toEqual(['hello', '👋', 'world']);
    expect(getWords([family, thumbsUp, flag, scotland, keycap].join(' '))).toEqual([
      family,
      thumbsUp,
      flag,
      scotland,
      keycap
    ]);
  });

  it('Lt 字母按大写字母处理', () => {
    expect(getWords('ǅemal')).toEqual(['ǅemal']);
  });

  it('非 emoji 符号与没有基字符的组合标记仍是分隔符', () => {
    expect(getWords('a→b 25°C')).toEqual(['a', 'b', '25', 'C']);
    expect(getWords('\u0301x')).toEqual(['x']);
  });

  it('不含上述字符的输入，切分结果与旧模式逐字一致', () => {
    const LEGACY_PATTERN = /\p{Lu}?\p{Ll}+|\p{N}+|\p{Lu}+(?!\p{Ll})|[\p{Lo}\p{Lm}]+/gu;
    const pool = [
      ...Array.from({ length: 95 }, (_, index) => String.fromCharCode(0x20 + index)),
      ...'éöÀßÇñ中文用户ーカ々ДжΩ٣'
    ];
    let seed = 20261026;
    const nextIndex = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % pool.length;
    };
    const inputs = Array.from({ length: 2000 }, (_, index) =>
      Array.from({ length: index % 24 }, () => pool[nextIndex()]).join('')
    );

    const mismatches = inputs.filter(
      input => JSON.stringify(getWords(input)) !== JSON.stringify(input.match(LEGACY_PATTERN) ?? [])
    );
    expect(mismatches).toEqual([]);
  });
});

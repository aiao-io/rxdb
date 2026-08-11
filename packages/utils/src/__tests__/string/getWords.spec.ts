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

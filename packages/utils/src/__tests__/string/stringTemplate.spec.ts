import { describe, expect, it } from 'vitest';
import { stringSingleline } from '../../string/stringSingleline.js';
import { stringTemplate } from '../../string/stringTemplate.js';

describe('stringTemplate', () => {
  it('1', () => {
    const str1 = stringTemplate('name ${ name }', { name: 'aiao' });
    const str2 = stringTemplate('name ${user.name}', { user: { name: 'aiao' } });
    const str3 = stringTemplate('name ${     user.name    }', { user: { name: 'aiao' } });

    expect(str1).toEqual('name aiao');
    expect(str2).toEqual('name aiao');
    expect(str3).toEqual('name aiao');
  });
  it('array', () => {
    const str1 = stringTemplate('name ${ 0.name }', [{ name: 'aiao' }]);
    expect(str1).toEqual('name aiao');
  });
  it('array 2', () => {
    const str1 = stringTemplate('name ${ [0].name }', [{ name: 'aiao' }]);
    expect(str1).toEqual('name aiao');
  });
  it('object array', () => {
    const str1 = stringTemplate('name ${ 0 }', ['aiao']);
    expect(str1).toEqual('name aiao');
  });

  describe('CS-009 未闭合占位符不得回溯（ReDoS）', () => {
    it('大量未闭合 `${` 线性返回', () => {
      // 原 `[^}]+` 会从每个 `${` 一路扫到串尾才发现没有 `}` → O(n²)。
      const hostile = '${'.repeat(20_000);
      const startedAt = performance.now();

      expect(stringTemplate(hostile, {})).toEqual(hostile);
      expect(performance.now() - startedAt).toBeLessThan(200);
    });

    it('占位符里出现 `{` 视为未闭合，原样保留', () => {
      // `${` 是唯一的开界符，路径里不可能再有 `{`；收紧字符类才换来线性。
      expect(stringTemplate('name ${a{b}', { 'a{b': 'aiao' })).toEqual('name ${a{b}');
    });
  });
  it('stringSingleline1', () => {
    const str = stringSingleline(` hello
          world


      `);
    expect(str).toEqual('hello world');
  });

  it('stringSingleline2', () => {
    const str = stringSingleline(`
     hello
        \n
        \r
        \f
        \n
        \r
        \t
        \v
         world


      `);
    expect(str).toEqual('hello world');
  });

  it('stringSingleline3', () => {
    const str = stringSingleline(` hello       world    `);
    expect(str).toEqual('hello world');
  });
});

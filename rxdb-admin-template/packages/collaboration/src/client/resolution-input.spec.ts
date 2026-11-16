import { describe, expect, it } from 'vitest';
import { CollaborationError } from '../model.js';
import { collaborationEnglish } from '../messages.js';
import { readResolution } from './resolution-input.js';

describe('冲突处理输入', () => {
  it('未选择处理方式时不产生选择，也不读取自定义输入', () => {
    expect(readResolution('c/name', '', '{oops')).toBeNull();
  });

  it('采用来源或保留目标只产出选择本身，忽略自定义输入里的任何内容', () => {
    expect(readResolution('c/name', 'source', '{oops')).toStrictEqual({ key: 'c/name', choice: 'source' });
    expect(readResolution('c/name', 'target', '')).toStrictEqual({ key: 'c/name', choice: 'target' });
  });

  it.each([
    ['字符串', '"新名称"', '新名称'],
    ['数字', ' 42 ', 42],
    ['布尔值', 'true', true],
    ['null 表示删除或置空', 'null', null],
    ['整条记录', '{"entity":"AssetCategory","fields":{"name":"X"}}', { entity: 'AssetCategory', fields: { name: 'X' } }]
  ])('自定义结果按 JSON 值解析：%s', (_name, text, value) => {
    expect(readResolution('c/name', 'custom', text)).toStrictEqual({ key: 'c/name', choice: 'custom', value });
  });

  it('自定义结果为空时抛出带词条的错误，而不是把空串当作值或在解析时崩溃', () => {
    for (const text of ['', '   ']) {
      expect(() => readResolution('c/name', 'custom', text)).toThrow(
        expect.objectContaining({ name: 'CollaborationError', code: 'invalid', message: '自定义冲突值不能为空' })
      );
    }
  });

  it('自定义结果不是合法 JSON 时抛出带词条的错误', () => {
    expect(() => readResolution('c/name', 'custom', '{oops')).toThrow(CollaborationError);
    expect(() => readResolution('c/name', 'custom', 'unquoted text')).toThrow(
      expect.objectContaining({ code: 'invalid', message: 'JSON 格式错误' })
    );
  });

  it('拒绝下拉框之外的处理方式', () => {
    expect(() => readResolution('c/name', 'theirs', '')).toThrow(
      expect.objectContaining({ code: 'invalid', message: '请求字段不合法' })
    );
  });

  it('所有可能显示给用户的错误都有英文词条', () => {
    for (const message of ['自定义冲突值不能为空', 'JSON 格式错误', '请求字段不合法'])
      expect(Object.hasOwn(collaborationEnglish, message)).toBe(true);
  });
});

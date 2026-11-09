import { describe, expect, it } from 'vitest';
import { parsePartialJson } from './parse-partial-json';

describe('parsePartialJson', () => {
  it('解析完整 JSON', async () => {
    await expect(parsePartialJson('{"entities":[{"name":"User"}]}')).resolves.toEqual({
      value: { entities: [{ name: 'User' }] },
      state: 'successful-parse'
    });
  });

  it('修复流式 JSON 的未闭合结构', async () => {
    await expect(parsePartialJson('{"entities":[{"name":"User"')).resolves.toEqual({
      value: { entities: [{ name: 'User' }] },
      state: 'repaired-parse'
    });
  });

  it('保留字符串中的结构字符', async () => {
    await expect(parsePartialJson('{"description":"字段 {name} 仍在输入')).resolves.toEqual({
      value: { description: '字段 {name} 仍在输入' },
      state: 'repaired-parse'
    });
  });

  it('无法修复非法 JSON 时返回失败状态', async () => {
    await expect(parsePartialJson('@')).resolves.toEqual({ value: undefined, state: 'failed-parse' });
  });

  it('未提供输入时返回 undefined 状态', async () => {
    await expect(parsePartialJson(undefined)).resolves.toEqual({ value: undefined, state: 'undefined-input' });
  });
});

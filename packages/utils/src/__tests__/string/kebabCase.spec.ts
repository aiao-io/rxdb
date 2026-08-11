import { describe, expect, it } from 'vitest';
import { kebabCase } from '../../string/kebabCase.js';

describe('kebabCase', () => {
  it('1', () => {
    const str = kebabCase(`FooBar`);
    expect(str).toEqual('foo-bar');
  });
  it('2', () => {
    const str = kebabCase(``);
    expect(str).toEqual('');
  });
  it('3', () => {
    const str = kebabCase(`__Foo__Bar__`);
    expect(str).toEqual('foo-bar');
  });
  it('保留非 ASCII 字符，而不是返回空串', () => {
    expect(kebabCase('用户ID')).toEqual('用户-id');
    expect(kebabCase('héllo wörld')).toEqual('héllo-wörld');
  });
});

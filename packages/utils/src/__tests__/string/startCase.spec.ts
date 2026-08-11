import { describe, expect, it } from 'vitest';
import { startCase } from '../../string/startCase.js';
describe('startCase', () => {
  it('1', () => {
    expect(startCase('--foo-bar')).toEqual('Foo Bar');
  });
  it('2', () => {
    expect(startCase('fooBar')).toEqual('Foo Bar');
  });
  it('3', () => {
    expect(startCase('__foo_bar__')).toEqual('Foo Bar');
  });
  it('保留非 ASCII 字符，而不是返回空串', () => {
    expect(startCase('用户ID')).toEqual('用户 Id');
    expect(startCase('héllo wörld')).toEqual('Héllo Wörld');
  });
});

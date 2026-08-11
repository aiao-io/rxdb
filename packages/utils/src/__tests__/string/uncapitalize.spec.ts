import { describe, expect, it } from 'vitest';
import { uncapitalize } from '../../string/uncapitalize.js';

describe('capitalize', () => {
  it('1', () => {
    expect(uncapitalize('Hello')).toEqual('hello');
  });
  it('2', () => {
    expect(uncapitalize('')).toEqual('');
  });
  it('2', () => {
    expect(uncapitalize('Hello World')).toEqual('hello world');
  });
});

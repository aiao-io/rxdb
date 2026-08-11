import { describe, expect, it } from 'vitest';
import { capitalize } from '../../string/capitalize.js';

describe('capitalize', () => {
  it('1', () => {
    expect(capitalize('hello')).toEqual('Hello');
  });
  it('2', () => {
    expect(capitalize('')).toEqual('');
  });
});

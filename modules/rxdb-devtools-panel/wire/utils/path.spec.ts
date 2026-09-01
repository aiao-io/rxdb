import { describe, expect, it } from 'vitest';
import { normalizePath } from './path';

describe('normalizePath', () => {
  it('converts absolute /path to ./path', () => {
    expect(normalizePath('/foo/bar')).toBe('./foo/bar');
  });

  it('leaves already-relative paths unchanged', () => {
    expect(normalizePath('./foo')).toBe('./foo');
    expect(normalizePath('foo/bar')).toBe('foo/bar');
  });

  it('normalizes the root path', () => {
    expect(normalizePath('/')).toBe('./');
  });
});

import { describe, expect, it } from 'vitest';
import { getRootElement } from './main-root';

describe('getRootElement', () => {
  it('returns the root element', () => {
    document.body.innerHTML = '<div id="root"></div>';

    expect(getRootElement(document)).toBe(document.getElementById('root'));
  });

  it('throws a clear error when the root element is missing', () => {
    document.body.innerHTML = '';

    expect(() => getRootElement(document)).toThrow('Missing #root mount element');
  });
});

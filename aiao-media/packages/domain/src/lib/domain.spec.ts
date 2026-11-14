import { describe, expect, it } from 'vitest';
import { domain } from '../index.js';

describe('aiao media domain', () => {
  it('exposes the product domain package', () => {
    expect(domain()).toBe('aiao-media');
  });
});

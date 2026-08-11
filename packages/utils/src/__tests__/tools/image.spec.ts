import { describe, expect, it } from 'vitest';
import { IMAGE_MIN_BASE64_BLACK, IMAGE_MIN_BASE64_TRANSPARENT } from '../../tools/image.js';

describe('image', () => {
  it('should true', () => {
    expect(IMAGE_MIN_BASE64_BLACK).toBeTruthy();
    expect(IMAGE_MIN_BASE64_TRANSPARENT).toBeTruthy();
  });
});

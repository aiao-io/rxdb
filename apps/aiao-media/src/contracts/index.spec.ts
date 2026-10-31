import { describe, expect, it } from 'vitest';
import { isGenerationRequest } from './index';
describe('generation request', () => {
  it('accepts a bounded prompt', () => expect(isGenerationRequest({ kind: 'image', prompt: 'sunset' })).toBe(true));
  it('rejects empty and excessive prompts', () => {
    expect(isGenerationRequest({ kind: 'video', prompt: ' ' })).toBe(false);
    expect(isGenerationRequest({ kind: 'audio', prompt: 'x'.repeat(4001) })).toBe(false);
  });
});

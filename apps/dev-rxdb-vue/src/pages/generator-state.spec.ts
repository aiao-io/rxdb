import { RxDBClientGenerator } from '@aiao/rxdb-client-generator';
import { describe, expect, it, vi } from 'vitest';
import { generateSourceState } from './generator-state';

describe('generateSourceState', () => {
  it('exposes invalid JSON instead of presenting an empty result', () => {
    const state = generateSourceState('{ invalid json');

    expect(state.sources).toEqual([]);
    expect(state.error).toBeInstanceOf(Error);
  });

  it('exposes generator failures', () => {
    vi.spyOn(RxDBClientGenerator.prototype, 'exec').mockImplementationOnce(() => {
      throw new Error('generation failed');
    });

    const state = generateSourceState(JSON.stringify({ name: 'Todo', properties: [] }));

    expect(state.sources).toEqual([]);
    expect(state.error).toEqual(new Error('generation failed'));
  });
});

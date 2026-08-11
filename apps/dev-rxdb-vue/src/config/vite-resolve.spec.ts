import { defaultClientConditions } from 'vite';
import { describe, expect, it } from 'vitest';
import { appResolveConfig, sourceConditions } from './vite-resolve';

describe('workspace source resolution', () => {
  it('puts @aiao/source before the standard browser conditions', () => {
    expect(sourceConditions).toEqual(['@aiao/source', ...defaultClientConditions]);
    expect(appResolveConfig.conditions).toEqual(sourceConditions);
  });
});

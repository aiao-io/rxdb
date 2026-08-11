import { describe, expect, it } from 'vitest';

import { resolveSearchScope } from '../core/scope-resolver.js';

describe('resolveSearchScope', () => {
  it('returns all candidates when no exclusion / no allowlist', () => {
    expect(
      resolveSearchScope({
        candidates: ['Article', 'Comment', 'Tag']
      })
    ).toEqual(['Article', 'Comment', 'Tag']);
  });

  it('removes excludedCollections (plugin-level hard exclusion)', () => {
    expect(
      resolveSearchScope({
        candidates: ['Article', 'Comment', 'Tag'],
        excludedCollections: ['Comment']
      })
    ).toEqual(['Article', 'Tag']);
  });

  it('intersects with requested allowlist', () => {
    expect(
      resolveSearchScope({
        candidates: ['Article', 'Comment', 'Tag'],
        requested: ['Article', 'Tag']
      })
    ).toEqual(['Article', 'Tag']);
  });

  it('exclusion wins over requested allowlist', () => {
    expect(
      resolveSearchScope({
        candidates: ['Article', 'Comment', 'Tag'],
        excludedCollections: ['Article'],
        requested: ['Article', 'Tag']
      })
    ).toEqual(['Tag']);
  });

  it('throws on unknown names in requested (fail-fast, lists offenders)', () => {
    expect(() =>
      resolveSearchScope({
        candidates: ['Article', 'Comment'],
        requested: ['Article', 'Ghost', 'Phantom']
      })
    ).toThrow(/unknown collection\(s\).*Ghost.*Phantom/);
  });

  it('throws when requested resolves to empty scope (all requested excluded)', () => {
    expect(() =>
      resolveSearchScope({
        candidates: ['Article', 'Comment'],
        excludedCollections: ['Article'],
        requested: ['Article']
      })
    ).toThrow(/excluded/);
  });

  it('preserves candidate ordering and deduplicates', () => {
    expect(
      resolveSearchScope({
        candidates: ['Article', 'Article', 'Comment', 'Tag', 'Comment']
      })
    ).toEqual(['Article', 'Comment', 'Tag']);
  });

  it('treats empty requested array as "no allowlist"', () => {
    expect(
      resolveSearchScope({
        candidates: ['Article', 'Comment'],
        requested: []
      })
    ).toEqual(['Article', 'Comment']);
  });

  it('returns readonly array (defensive)', () => {
    const out = resolveSearchScope({ candidates: ['Article'] });
    expect(Array.isArray(out)).toBe(true);
    expect(out).toEqual(['Article']);
  });
});

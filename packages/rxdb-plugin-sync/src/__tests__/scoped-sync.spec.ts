import { describe, expect, it } from 'vitest';
import { canonicalize, filterFingerprint } from '../scoped-sync.js';

describe('scoped sync helpers', () => {
  it('canonicalizes nested values deterministically', () => {
    const left = canonicalize({ b: 2, a: [new Date('2026-01-01T00:00:00.000Z'), null] });
    const right = canonicalize({ a: ['2026-01-01T00:00:00.000Z', null], b: 2 });

    expect(left).toBe(right);
    expect(canonicalize({ b: 2, a: 1 })).toBe(canonicalize({ a: 1, b: 2 }));
  });

  it('generates stable filter fingerprints', () => {
    const first = { combinator: 'and' as const, rules: [{ field: 'tenantId', operator: '=', value: 'tenant-1' }] };
    const same = { combinator: 'and' as const, rules: [{ value: 'tenant-1', operator: '=', field: 'tenantId' }] };
    const different = { combinator: 'and' as const, rules: [{ field: 'tenantId', operator: '=', value: 'tenant-2' }] };

    expect(filterFingerprint(first)).toBe(filterFingerprint(same));
    expect(filterFingerprint(first)).not.toBe(filterFingerprint(different));
    expect(filterFingerprint(undefined)).toBe('all');
  });
});

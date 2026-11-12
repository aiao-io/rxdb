import { describe, expect, it } from 'vitest';
import { hasModelOps } from './tool-output';

describe('hasModelOps', () => {
  it('只有成功且带操作的输出需要写入', () => {
    expect(hasModelOps({ ok: true, ops: [{ op: 'removeEntity', entityId: 'e' }], summary: '' })).toBe(true);
    expect(hasModelOps({ ok: true, ops: [], summary: '' })).toBe(false);
    expect(hasModelOps({ ok: false, errors: ['x'] })).toBe(false);
    expect(hasModelOps({ ok: true, summary: '' })).toBe(false);
    expect(hasModelOps(null)).toBe(false);
    expect(hasModelOps('ops')).toBe(false);
  });
});

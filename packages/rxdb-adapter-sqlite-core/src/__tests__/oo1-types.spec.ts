import { describe, expect, it, vi } from 'vitest';
import { assertOo1Static } from '../oo1-types.js';

const createValidModule = (): Record<string, unknown> => ({
  capi: { sqlite3_update_hook: vi.fn() },
  config: { warn: vi.fn(), error: vi.fn() },
  oo1: { DB: class {}, OpfsDb: class {} },
  version: {
    libVersion: '3.53.0',
    libVersionNumber: 3053000,
    sourceId: 'mock',
    downloadVersion: 1
  }
});

describe('assertOo1Static', () => {
  it('接受共享客户端所需的最小 oo1 契约', () => {
    const module = createValidModule();

    expect(() => assertOo1Static(module)).not.toThrow();
  });

  it.each([
    null,
    {},
    { ...createValidModule(), capi: {} },
    { ...createValidModule(), oo1: { DB: 'not-a-constructor', OpfsDb: class {} } },
    { ...createValidModule(), oo1: { DB: class {}, OpfsDb: 'not-a-constructor' } },
    { ...createValidModule(), version: { libVersion: '3.53.0' } },
    { ...createValidModule(), config: { warn: 'not-a-function' } }
  ])('拒绝不兼容的上游返回值 %#', module => {
    expect(() => assertOo1Static(module)).toThrow(/invalid oo1 module/i);
  });

  it('允许运行时不提供可选的 OPFS 构造器', () => {
    const module = { ...createValidModule(), oo1: { DB: class {} } };

    expect(() => assertOo1Static(module)).not.toThrow();
  });
});

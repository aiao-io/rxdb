import { beforeEach, describe, expect, it } from 'vitest';
import { SequenceGenerator } from '../sequence.js';

describe('SequenceGenerator', () => {
  let gen: SequenceGenerator;

  beforeEach(() => {
    gen = new SequenceGenerator();
  });

  it('MUST start at 0', () => {
    expect(gen.current).toBe(0);
  });

  describe('next', () => {
    it('MUST return monotonically increasing values', () => {
      expect(gen.next()).toBe(1);
      expect(gen.next()).toBe(2);
      expect(gen.next()).toBe(3);
    });

    it('MUST update current after next()', () => {
      gen.next();
      gen.next();
      expect(gen.current).toBe(2);
    });
  });

  describe('reset', () => {
    it('MUST reset to 0', () => {
      gen.next();
      gen.next();
      gen.reset();
      expect(gen.current).toBe(0);
      expect(gen.next()).toBe(1);
    });
  });
});

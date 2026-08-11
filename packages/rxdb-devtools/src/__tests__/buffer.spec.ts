import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EventBuffer } from '../buffer.js';
import type { SerializedEvent } from '../types.js';

function makeEvent(id: string, seq = 0): SerializedEvent {
  return { id, eventType: 'TEST', timestamp: Date.now(), sequence: seq, data: {} };
}

describe('EventBuffer', () => {
  let buffer: EventBuffer;

  beforeEach(() => {
    buffer = new EventBuffer();
  });

  afterEach(() => {
    buffer.clear();
  });

  it('MUST default maxSize to 100', () => {
    expect(buffer.maxSize).toBe(100);
  });

  it('MUST accept custom maxSize', () => {
    const b = new EventBuffer(10);
    expect(b.maxSize).toBe(10);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    'MUST reject invalid maxSize %s',
    maxSize => {
      expect(() => new EventBuffer(maxSize)).toThrow(/positive safe integer/i);
    }
  );

  it('MUST start empty', () => {
    expect(buffer.length).toBe(0);
    expect(buffer.isEmpty).toBe(true);
    expect(buffer.isFull).toBe(false);
  });

  describe('push', () => {
    it('MUST add event and update length', () => {
      buffer.push(makeEvent('e1'));
      expect(buffer.length).toBe(1);
      expect(buffer.isEmpty).toBe(false);
    });

    it('MUST evict oldest event when full (FIFO)', () => {
      const b = new EventBuffer(3);
      b.push(makeEvent('e1'));
      b.push(makeEvent('e2'));
      b.push(makeEvent('e3'));
      expect(b.isFull).toBe(true);

      b.push(makeEvent('e4'));
      expect(b.length).toBe(3);

      const events = b.flush();
      expect(events.map(e => e.id)).toEqual(['e2', 'e3', 'e4']);
    });

    it('MUST handle single-capacity buffer', () => {
      const b = new EventBuffer(1);
      b.push(makeEvent('e1'));
      b.push(makeEvent('e2'));
      expect(b.length).toBe(1);
      expect(b.flush()[0].id).toBe('e2');
    });
  });

  describe('flush', () => {
    it('MUST return all events and clear buffer', () => {
      buffer.push(makeEvent('e1'));
      buffer.push(makeEvent('e2'));

      const events = buffer.flush();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('e1');
      expect(events[1].id).toBe('e2');
      expect(buffer.length).toBe(0);
      expect(buffer.isEmpty).toBe(true);
    });

    it('MUST return empty array when empty', () => {
      expect(buffer.flush()).toEqual([]);
    });

    it('MUST return a copy (not internal reference)', () => {
      buffer.push(makeEvent('e1'));
      const events = buffer.flush();
      events.push(makeEvent('e2'));
      expect(buffer.length).toBe(0);
    });
  });

  describe('clear', () => {
    it('MUST remove all events', () => {
      buffer.push(makeEvent('e1'));
      buffer.push(makeEvent('e2'));
      buffer.clear();
      expect(buffer.length).toBe(0);
      expect(buffer.isEmpty).toBe(true);
    });
  });
});

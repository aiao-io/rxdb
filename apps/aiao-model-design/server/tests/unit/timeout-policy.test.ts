import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TimeoutError } from '../../src/gateway/core/errors';
import {
  TIMEOUTS,
  createDefaultTimeoutSignal,
  createFirstByteSignal,
  createIdleSignal,
  createTotalSignal
} from '../../src/gateway/core/timeout-policy';

describe('TIMEOUTS', () => {
  it('matches FR-008 thresholds', () => {
    expect(TIMEOUTS.chat.firstByteMs).toBe(30_000);
    expect(TIMEOUTS.chat.idleMs).toBe(60_000);
    expect(TIMEOUTS.asr.totalMs).toBe(120_000);
    expect(TIMEOUTS.tts.totalMs).toBe(60_000);
  });
});

describe('createFirstByteSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('chat first-byte aborts at 30s', async () => {
    const signal = createFirstByteSignal('chat');
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(29_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal.aborted).toBe(true);
  });
});

describe('createTotalSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('asr total aborts at 120s', async () => {
    const signal = createTotalSignal('asr');
    await vi.advanceTimersByTimeAsync(119_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal.aborted).toBe(true);
  });

  it('tts total aborts at 60s', async () => {
    const signal = createTotalSignal('tts');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal.aborted).toBe(true);
  });
});

describe('createIdleSignal (chat)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fires idle abort 60s after last reset (events at 0s/10s/20s, abort ~80s)', async () => {
    const { signal, reset } = createIdleSignal('chat');
    await vi.advanceTimersByTimeAsync(10_000);
    reset();
    await vi.advanceTimersByTimeAsync(10_000);
    reset();
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeInstanceOf(TimeoutError);
    expect((signal.reason as TimeoutError).kind).toBe('idle');
  });

  it('keeps alive while reset() is called every 50s (under 60s threshold)', async () => {
    const { signal, reset } = createIdleSignal('chat');
    for (let i = 0; i < 4; i++) {
      await vi.advanceTimersByTimeAsync(50_000);
      reset();
    }
    expect(signal.aborted).toBe(false);
  });

  it('cleanup() stops the timer', async () => {
    const { signal, cleanup } = createIdleSignal('chat');
    cleanup();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(signal.aborted).toBe(false);
  });
});

describe('createDefaultTimeoutSignal', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('chat uses first-byte timeout (30s)', async () => {
    const signal = createDefaultTimeoutSignal('chat');
    await vi.advanceTimersByTimeAsync(30_001);
    expect(signal.aborted).toBe(true);
  });

  it('asr uses total timeout (120s)', async () => {
    const signal = createDefaultTimeoutSignal('asr');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(signal.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(60_001);
    expect(signal.aborted).toBe(true);
  });

  it('tts uses total timeout (60s)', async () => {
    const signal = createDefaultTimeoutSignal('tts');
    await vi.advanceTimersByTimeAsync(60_001);
    expect(signal.aborted).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkOPFSAvailable, isOPFSSupported } from '../../@browser/opfs-detection.js';

describe('OPFS detection', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('returns false when navigator is unavailable', () => {
    vi.stubGlobal('navigator', undefined);
    expect(isOPFSSupported()).toBe(false);
  });

  it('returns false without logging when OPFS access fails', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn().mockRejectedValue(new Error('denied'))
      }
    });

    await expect(checkOPFSAvailable()).resolves.toBe(false);
    expect(errorLog).not.toHaveBeenCalled();
  });
});

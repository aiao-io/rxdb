import { describe, expect, it } from 'vitest';

import { isMaxTransferBytes, isWithinTransferLimit, resolveNegotiatedTransferLimit } from '../../provider/limits.js';
import { DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES, DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT } from '../../v2/constants.js';

describe('isMaxTransferBytes', () => {
  it('MUST accept 0 through 1 GiB inclusive', () => {
    expect(isMaxTransferBytes(0)).toBe(true);
    expect(isMaxTransferBytes(DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES)).toBe(true);
    expect(isMaxTransferBytes(DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT)).toBe(true);
  });

  it('MUST reject negatives, over-limit values and non-safe integers', () => {
    expect(isMaxTransferBytes(-1)).toBe(false);
    expect(isMaxTransferBytes(DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT + 1)).toBe(false);
    expect(isMaxTransferBytes(1.5)).toBe(false);
    expect(isMaxTransferBytes(Number.NaN)).toBe(false);
    expect(isMaxTransferBytes('1024')).toBe(false);
    expect(isMaxTransferBytes(undefined)).toBe(false);
  });

  it('MUST pin the browser OPFS limit at 50 MiB', () => {
    expect(DEVTOOLS_BROWSER_OPFS_MAX_TRANSFER_BYTES).toBe(52_428_800);
  });
});

describe('resolveNegotiatedTransferLimit', () => {
  it('MUST take the minimum across panel, connector and provider', () => {
    expect(resolveNegotiatedTransferLimit([DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT, 1_024, 4_096])).toBe(1_024);
    expect(resolveNegotiatedTransferLimit([4_096, 4_096, 4_096])).toBe(4_096);
  });

  it('MUST resolve to 0 when any side declares 0', () => {
    // 0 表示「这一侧根本不做 transfer」。取最小值让它自然地关闭整条链路，
    // 而不是让某一侧以为自己还能收发。
    expect(resolveNegotiatedTransferLimit([DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT, 0])).toBe(0);
  });

  it('MUST reject an empty list and any invalid member', () => {
    expect(resolveNegotiatedTransferLimit([])).toBeUndefined();
    expect(resolveNegotiatedTransferLimit([1_024, -1])).toBeUndefined();
    expect(resolveNegotiatedTransferLimit([1_024, DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT + 1])).toBeUndefined();
    expect(resolveNegotiatedTransferLimit([1_024, undefined])).toBeUndefined();
    expect(resolveNegotiatedTransferLimit(undefined)).toBeUndefined();
  });
});

describe('isWithinTransferLimit', () => {
  it('MUST accept totals up to and including the negotiated limit', () => {
    expect(isWithinTransferLimit(0, 1_024)).toBe(true);
    expect(isWithinTransferLimit(1_024, 1_024)).toBe(true);
  });

  it('MUST reject totals above the negotiated limit', () => {
    expect(isWithinTransferLimit(1_025, 1_024)).toBe(false);
    expect(isWithinTransferLimit(1, 0)).toBe(false);
  });

  it('MUST reject non-safe-integer totals before comparing', () => {
    expect(isWithinTransferLimit(Number.NaN, 1_024)).toBe(false);
    expect(isWithinTransferLimit(-1, 1_024)).toBe(false);
    expect(isWithinTransferLimit(1.5, 1_024)).toBe(false);
  });
});

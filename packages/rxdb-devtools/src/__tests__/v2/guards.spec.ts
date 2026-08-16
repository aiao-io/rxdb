import { describe, expect, it } from 'vitest';

import {
  DEVTOOLS_DEFAULT_PAGE_SIZE,
  DEVTOOLS_MAX_CHUNK_BYTES,
  DEVTOOLS_MAX_INFLIGHT_REQUESTS,
  DEVTOOLS_MAX_INFLIGHT_TRANSFERS,
  DEVTOOLS_MAX_PAGE_SIZE,
  DEVTOOLS_MAX_PROTOCOL_VERSION,
  DEVTOOLS_MAX_REQUEST_TOMBSTONES,
  DEVTOOLS_MAX_SNAPSHOT_BYTES,
  DEVTOOLS_MAX_SNAPSHOT_RECORDS,
  DEVTOOLS_MAX_SUPPORTED_VERSIONS,
  DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT,
  DEVTOOLS_MAX_TRANSFER_TOMBSTONES,
  DEVTOOLS_NEGOTIATION_WINDOW_MS,
  DEVTOOLS_PROTOCOL_VERSION_V2,
  DEVTOOLS_REQUEST_TIMEOUT_MS,
  DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS,
  DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS,
  DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS
} from '../../v2/constants.js';
import { isPageSize, isSafeIntegerInRange, isSupportedVersionList } from '../../v2/guards.js';

describe('v2 frozen constants', () => {
  it('MUST match the values frozen by US-904b', () => {
    // 这些数字是 US-904c / US-904d / US-905 共同引用的唯一真相源。
    // 改动任何一个都会让三端行为分叉，所以在这里钉死。
    expect(DEVTOOLS_PROTOCOL_VERSION_V2).toBe(2);
    expect(DEVTOOLS_NEGOTIATION_WINDOW_MS).toBe(1_000);
    expect(DEVTOOLS_MAX_SUPPORTED_VERSIONS).toBe(8);
    expect(DEVTOOLS_MAX_PROTOCOL_VERSION).toBe(255);
    expect(DEVTOOLS_MAX_INFLIGHT_REQUESTS).toBe(32);
    expect(DEVTOOLS_MAX_INFLIGHT_TRANSFERS).toBe(2);
    expect(DEVTOOLS_MAX_REQUEST_TOMBSTONES).toBe(4_096);
    expect(DEVTOOLS_MAX_TRANSFER_TOMBSTONES).toBe(256);
    expect(DEVTOOLS_REQUEST_TIMEOUT_MS).toBe(15_000);
    expect(DEVTOOLS_TRANSFER_IDLE_TIMEOUT_MS).toBe(15_000);
    expect(DEVTOOLS_TRANSFER_TOTAL_TIMEOUT_MS).toBe(600_000);
    expect(DEVTOOLS_MAX_CHUNK_BYTES).toBe(262_144);
    expect(DEVTOOLS_MAX_TRANSFER_BYTES_LIMIT).toBe(1_073_741_824);
    expect(DEVTOOLS_DEFAULT_PAGE_SIZE).toBe(100);
    expect(DEVTOOLS_MAX_PAGE_SIZE).toBe(500);
    expect(DEVTOOLS_MAX_SNAPSHOT_RECORDS).toBe(100_000);
    expect(DEVTOOLS_MAX_SNAPSHOT_BYTES).toBe(33_554_432);
    expect(DEVTOOLS_SNAPSHOT_CURSOR_IDLE_MS).toBe(60_000);
  });
});

describe('isSafeIntegerInRange', () => {
  it('MUST accept inclusive boundaries', () => {
    expect(isSafeIntegerInRange(0, 0, 10)).toBe(true);
    expect(isSafeIntegerInRange(10, 0, 10)).toBe(true);
    expect(isSafeIntegerInRange(5, 5, 5)).toBe(true);
  });

  it('MUST reject values outside the range', () => {
    expect(isSafeIntegerInRange(-1, 0, 10)).toBe(false);
    expect(isSafeIntegerInRange(11, 0, 10)).toBe(false);
  });

  it('MUST reject NaN, Infinity, fractions and numeric strings', () => {
    expect(isSafeIntegerInRange(Number.NaN, 0, 10)).toBe(false);
    expect(isSafeIntegerInRange(Number.POSITIVE_INFINITY, 0, Number.MAX_SAFE_INTEGER)).toBe(false);
    expect(isSafeIntegerInRange(Number.NEGATIVE_INFINITY, 0, 10)).toBe(false);
    expect(isSafeIntegerInRange(1.5, 0, 10)).toBe(false);
    expect(isSafeIntegerInRange('5', 0, 10)).toBe(false);
    expect(isSafeIntegerInRange(null, 0, 10)).toBe(false);
  });

  it('MUST reject values beyond MAX_SAFE_INTEGER even when the range would allow them', () => {
    expect(isSafeIntegerInRange(Number.MAX_SAFE_INTEGER + 2, 0, Number.POSITIVE_INFINITY)).toBe(false);
  });

  it('MUST reject -0 normalised inputs consistently with 0', () => {
    expect(isSafeIntegerInRange(-0, 0, 10)).toBe(true);
  });
});

describe('isPageSize', () => {
  it('MUST accept 1 to 500', () => {
    expect(isPageSize(1)).toBe(true);
    expect(isPageSize(DEVTOOLS_DEFAULT_PAGE_SIZE)).toBe(true);
    expect(isPageSize(DEVTOOLS_MAX_PAGE_SIZE)).toBe(true);
  });

  it('MUST reject 0, negatives and anything above 500', () => {
    expect(isPageSize(0)).toBe(false);
    expect(isPageSize(-1)).toBe(false);
    expect(isPageSize(501)).toBe(false);
    expect(isPageSize(Number.NaN)).toBe(false);
  });
});

describe('isSupportedVersionList', () => {
  it('MUST accept a non-empty, strictly descending list within bounds', () => {
    expect(isSupportedVersionList([2, 1])).toBe(true);
    expect(isSupportedVersionList([1])).toBe(true);
    expect(isSupportedVersionList([255, 8, 7, 6, 5, 4, 3, 1])).toBe(true);
  });

  it('MUST reject a non-descending or duplicated list', () => {
    expect(isSupportedVersionList([1, 2])).toBe(false);
    expect(isSupportedVersionList([2, 2])).toBe(false);
    expect(isSupportedVersionList([3, 1, 2])).toBe(false);
  });

  it('MUST reject an empty list and a list longer than 8', () => {
    expect(isSupportedVersionList([])).toBe(false);
    expect(isSupportedVersionList([9, 8, 7, 6, 5, 4, 3, 2, 1])).toBe(false);
  });

  it('MUST reject out-of-range and non-integer members', () => {
    expect(isSupportedVersionList([256])).toBe(false);
    expect(isSupportedVersionList([0])).toBe(false);
    expect(isSupportedVersionList([-1])).toBe(false);
    expect(isSupportedVersionList([2.5])).toBe(false);
    expect(isSupportedVersionList([Number.NaN])).toBe(false);
    expect(isSupportedVersionList(['2'])).toBe(false);
  });

  it('MUST reject non-array input', () => {
    expect(isSupportedVersionList(undefined)).toBe(false);
    expect(isSupportedVersionList({ 0: 2, length: 1 })).toBe(false);
    expect(isSupportedVersionList('2')).toBe(false);
  });
});

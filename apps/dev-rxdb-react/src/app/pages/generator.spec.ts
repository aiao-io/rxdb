import { describe, expect, it } from 'vitest';
import { getActiveGeneratedFileIndex } from './generator';

describe('getActiveGeneratedFileIndex', () => {
  it.each([
    [0, 3, 0],
    [2, 3, 2],
    [3, 3, 0],
    [8, 2, 0],
    [-1, 2, 0],
    [4, 0, 0]
  ])('maps selected index %d with %d files to %d', (selectedIndex, fileCount, expected) => {
    expect(getActiveGeneratedFileIndex(selectedIndex, fileCount)).toBe(expected);
  });
});

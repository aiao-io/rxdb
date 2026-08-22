import { describe, expect, it } from 'vitest';
import { getUploadDirectory } from './useStorageTransfer';

describe('getUploadDirectory', () => {
  it('keeps files in the current directory when there is no relative folder', () => {
    expect(getUploadDirectory('readme.md', '/docs')).toBe('/docs');
    expect(getUploadDirectory('folder/readme.md', '/docs')).toBe('/docs/folder');
  });

  it('normalizes nested windows paths against the current directory', () => {
    expect(getUploadDirectory('a\\b\\c.txt', '/')).toBe('/a/b');
  });
});

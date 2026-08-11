import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatFileSize,
  getFileCategory,
  getFileExtension,
  isImageType,
  isPreviewableType
} from '../../file/index.js';

describe('file utils', () => {
  it('should format very large values without producing an undefined unit', () => {
    expect(formatFileSize(1024 ** 5)).toMatch(/ GB$/);
  });

  it('should reject non-finite and negative sizes as 0 B', () => {
    expect(formatFileSize(Number.NaN)).toBe('0 B');
    expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('0 B');
    expect(formatFileSize(-1)).toBe('0 B');
    expect(formatFileSize(0)).toBe('0 B');
  });

  it('should infer extensions and categories consistently', () => {
    expect(getFileExtension('photo.PNG')).toBe('png');
    // UTL-020：原断言是 `.toBe('no-extension')` —— 把「无扩展名文件被当成扩展名」
    // 这个缺陷写成了预期行为。无扩展名必须返回空串。
    expect(getFileExtension('no-extension')).toBe('');
    // 点开头的隐藏文件同理：`.bashrc` 没有扩展名
    expect(getFileExtension('.bashrc')).toBe('');
    // 目录里含点、文件名不含点时，不能把目录名当扩展名
    expect(getFileExtension('a.b/c')).toBe('');
    expect(getFileExtension('archive.tar.gz')).toBe('gz');
    expect(isImageType('photo.PNG')).toBe(true);
    expect(isPreviewableType('component.ts')).toBe(true);
    expect(getFileCategory('archive.zip')).toBe('archive');
    expect(getFileCategory('track.mp3')).toBe('audio');
    expect(getFileCategory('clip.mp4')).toBe('video');
    expect(getFileCategory('main.ts')).toBe('code');
    expect(getFileCategory('readme.md')).toBe('text');
    expect(getFileCategory('mystery.xyz')).toBe('unknown');
  });
});

it('formats the Unix epoch instead of treating it as missing', () => {
  expect(formatDate(0)).not.toBe('-');
  expect(formatDate(undefined)).toBe('-');
  expect(formatDate('')).toBe('-');
  expect(formatDate(null as unknown as undefined)).toBe('-');
  expect(formatDate('invalid')).toBe('-');
  expect(formatDate(new Date('2024-01-01T00:00:00.000Z'))).not.toBe('-');
  expect(formatDate('2024-01-01T00:00:00.000Z')).not.toBe('-');
});

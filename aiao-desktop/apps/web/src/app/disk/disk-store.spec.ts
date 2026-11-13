import { describe, expect, it } from 'vitest';

import { DiskError, isMissing } from './disk-store';

describe('DiskError', () => {
  it('错误码沿用 POSIX 写法，默认说明是「错误码: 虚拟机路径」', () => {
    const error = new DiskError('ENOENT', ['Users', 'me', 'a.txt']);
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('DiskError');
    expect(error.code).toBe('ENOENT');
    expect(error.path).toEqual(['Users', 'me', 'a.txt']);
    expect(error.message).toBe('ENOENT: /Users/me/a.txt');
  });

  it('也可以带 Finder 风格的完整说明', () => {
    expect(new DiskError('EACCES', ['System'], 'required by macOS').message).toBe('required by macOS');
  });
});

describe('isMissing', () => {
  it('路径不存在（ENOENT）或途中经过的不是目录（ENOTDIR）都算「不存在」', () => {
    expect(isMissing(new DiskError('ENOENT', ['a']))).toBe(true);
    expect(isMissing(new DiskError('ENOTDIR', ['a']))).toBe(true);
  });

  it('其他磁盘错误，以及不是 DiskError 的错误，都不算', () => {
    for (const code of ['EEXIST', 'EISDIR', 'EACCES'] as const)
      expect(isMissing(new DiskError(code, ['a']))).toBe(false);
    expect(isMissing(Object.assign(new Error('x'), { code: 'ENOENT' }))).toBe(false);
    expect(isMissing('ENOENT')).toBe(false);
    expect(isMissing(undefined)).toBe(false);
  });
});

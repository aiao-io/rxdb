import { describe, expect, it } from 'vitest';

import {
  DESKTOP,
  HOME,
  TRASH,
  VOLUME_NAME,
  diskPathOf,
  finderPathOf,
  fromVmPath,
  isWithin,
  toVmPath,
  uniqueName
} from './disk-path';

describe('磁盘路径', () => {
  it('卷挂在虚拟机的根目录', () => {
    expect(toVmPath(DESKTOP)).toBe('/Users/prasenjit/Desktop');
    expect(toVmPath([])).toBe('/');
    expect(fromVmPath('/Users/prasenjit/')).toEqual(HOME);
    expect(fromVmPath('/')).toEqual([]);
  });

  it('Finder 路径以卷名开头，废纸篓用自己的名字', () => {
    expect(finderPathOf(DESKTOP)).toEqual([VOLUME_NAME, 'Users', 'prasenjit', 'Desktop']);
    expect(finderPathOf(TRASH)).toEqual(['Trash']);
    expect(finderPathOf([...TRASH, 'old', 'a.md'])).toEqual(['Trash', 'old', 'a.md']);
    expect(diskPathOf([VOLUME_NAME, 'Applications'])).toEqual(['Applications']);
    expect(diskPathOf(['Trash'])).toEqual(TRASH);
    expect(diskPathOf(['Trash', 'old'])).toEqual([...TRASH, 'old']);
    expect(diskPathOf(['Recents'])).toBeNull();
  });

  it('isWithin 按整段比较', () => {
    expect(isWithin(DESKTOP, HOME)).toBe(true);
    expect(isWithin(HOME, HOME)).toBe(true);
    expect(isWithin(['Users', 'prasenjitx'], HOME)).toBe(false);
  });

  it('重名时追加序号', () => {
    expect(uniqueName([], 'untitled folder')).toBe('untitled folder');
    expect(uniqueName(['untitled folder'], 'untitled folder')).toBe('untitled folder 2');
    expect(uniqueName(['untitled folder', 'untitled folder 2'], 'untitled folder')).toBe('untitled folder 3');
    expect(uniqueName(['a.md'], 'a.md')).toBe('a 2.md');
  });
});

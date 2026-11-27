import { describe, expect, it } from 'vitest';

import {
  DESKTOP,
  HOME,
  TRASH,
  VOLUME_NAME,
  diskPathOf,
  finderPathOf,
  foldName,
  fromVmPath,
  isWithin,
  sameName,
  toVmPath,
  uniqueName
} from './disk-path';

describe('磁盘路径', () => {
  it('卷挂在虚拟机的根目录', () => {
    expect(toVmPath(DESKTOP)).toBe('/Users/stevejobs/Desktop');
    expect(toVmPath([])).toBe('/');
    expect(fromVmPath('/Users/stevejobs/')).toEqual(HOME);
    expect(fromVmPath('/')).toEqual([]);
  });

  it('Finder 路径以卷名开头，废纸篓用自己的名字', () => {
    expect(finderPathOf(DESKTOP)).toEqual([VOLUME_NAME, 'Users', 'stevejobs', 'Desktop']);
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
    expect(isWithin(['Users', 'stevejobsx'], HOME)).toBe(false);
  });

  it('重名时追加序号', () => {
    expect(uniqueName([], 'untitled folder')).toBe('untitled folder');
    expect(uniqueName(['untitled folder'], 'untitled folder')).toBe('untitled folder 2');
    expect(uniqueName(['untitled folder', 'untitled folder 2'], 'untitled folder')).toBe('untitled folder 3');
    expect(uniqueName(['a.md'], 'a.md')).toBe('a 2.md');
  });

  it('同级重名按大小写不敏感判断（与库的唯一索引同口径），新名字保留用户给的大小写', () => {
    expect(uniqueName(['Report.txt'], 'report.txt')).toBe('report 2.txt');
    expect(uniqueName(['report.txt'], 'REPORT.TXT')).toBe('REPORT 2.TXT');
    expect(uniqueName(['Untitled Folder'], 'untitled folder')).toBe('untitled folder 2');
    expect(uniqueName(['Report.txt', 'report 2.txt'], 'report.txt')).toBe('report 3.txt');
    expect(uniqueName(['É.txt'], 'é.txt')).toBe('é 2.txt');
    expect(uniqueName(['Report.txt'], 'notes.txt')).toBe('notes.txt');
  });

  it('foldName 与 sameName：只在大小写上不同的名字是同一个名字，其它都不是', () => {
    expect(foldName('Report.TXT')).toBe('report.txt');
    expect(sameName('Report.txt', 'report.TXT')).toBe(true);
    expect(sameName('report.txt', 'report 2.txt')).toBe(false);
    expect(sameName('a', 'a')).toBe(true);
  });
});

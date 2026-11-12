import { describe, expect, it } from 'vitest';

import { extensionOf, fileKind, formatSize, isPackageName, isTextName } from './disk-kinds';

describe('formatSize', () => {
  it('用 Finder 的十进制单位与写法', () => {
    expect(formatSize(0)).toBe('Zero bytes');
    expect(formatSize(1)).toBe('1 byte');
    expect(formatSize(999)).toBe('999 bytes');
    expect(formatSize(1_000)).toBe('1 KB');
    expect(formatSize(3_400)).toBe('3 KB');
    expect(formatSize(412_000)).toBe('412 KB');
    expect(formatSize(999_499)).toBe('999 KB');
  });

  it('MB 保留一位小数、GB 保留两位，末尾的 0 省掉', () => {
    expect(formatSize(999_500)).toBe('1 MB');
    expect(formatSize(2_100_000)).toBe('2.1 MB');
    expect(formatSize(24_000_000)).toBe('24 MB');
    expect(formatSize(148_000_000)).toBe('148 MB');
    expect(formatSize(999_960_000)).toBe('1 GB');
    expect(formatSize(1_200_000_000)).toBe('1.2 GB');
    expect(formatSize(7_940_000_000)).toBe('7.94 GB');
  });
});

describe('fileKind', () => {
  it('按扩展名给出 Finder 的种类与图标，不区分大小写', () => {
    expect(fileKind('README.md')).toEqual({ kind: 'Markdown', icon: 'f-txt' });
    expect(fileKind('Screenshot.PNG')).toEqual({ kind: 'PNG image', icon: 'f-img' });
    expect(fileKind('main.swift')).toEqual({ kind: 'Swift source', icon: 'f-code' });
    expect(fileKind('Xcode_26.xip')).toEqual({ kind: 'Archive', icon: 'f-zip' });
    expect(fileKind('Safari.app')).toEqual({ kind: 'Application', icon: 'f-app' });
  });

  it('没有扩展名或不认识的扩展名都是 Document', () => {
    expect(fileKind('notes')).toEqual({ kind: 'Document', icon: 'f-txt' });
    expect(fileKind('.zshrc')).toEqual({ kind: 'Document', icon: 'f-txt' });
    expect(fileKind('data.xyz')).toEqual({ kind: 'Document', icon: 'f-txt' });
  });
});

describe('扩展名判断', () => {
  it('隐藏文件的点不算扩展名', () => {
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('.Trash')).toBe('');
    expect(extensionOf('Makefile')).toBe('');
  });

  it('.app 是程序包', () => {
    expect(isPackageName('System Settings.app')).toBe(true);
    expect(isPackageName('app')).toBe(false);
  });

  it('文本类文件与无扩展名文件交给 TextEdit', () => {
    expect(isTextName('todo.md')).toBe(true);
    expect(isTextName('synth.ts')).toBe(true);
    expect(isTextName('Info.plist')).toBe(true);
    expect(isTextName('hello')).toBe(true);
    expect(isTextName('night-sky.jpg')).toBe(false);
    expect(isTextName('Interface Guidelines.pdf')).toBe(false);
  });
});

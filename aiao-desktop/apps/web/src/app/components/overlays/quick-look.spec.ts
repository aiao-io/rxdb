import { describe, expect, it } from 'vitest';

import type { FsNode } from '../../services/file-system';
import {
  TEXT_PREVIEW_LIMIT,
  ZOOM_MAX,
  ZOOM_MIN,
  cycleIndex,
  previewText,
  quickLookKindOf,
  stepSibling,
  zoomBy
} from './quick-look';

const file = (name: string): FsNode => ({
  name,
  path: null,
  kind: 'file',
  icon: 'f-txt',
  k: 'Document',
  hidden: false
});

describe('quickLookKindOf：按扩展名判定预览方式', () => {
  it('png / jpg / jpeg / heic 按图片预览', () => {
    expect(quickLookKindOf('photo.png', 'file')).toBe('image');
    expect(quickLookKindOf('photo.jpg', 'file')).toBe('image');
    expect(quickLookKindOf('photo.jpeg', 'file')).toBe('image');
    expect(quickLookKindOf('photo.heic', 'file')).toBe('image');
  });

  it('pdf 按 PDF 预览', () => {
    expect(quickLookKindOf('paper.pdf', 'file')).toBe('pdf');
  });

  it('文本扩展名与没有扩展名的文件按文本预览', () => {
    expect(quickLookKindOf('notes.txt', 'file')).toBe('text');
    expect(quickLookKindOf('app.ts', 'file')).toBe('text');
    expect(quickLookKindOf('README', 'file')).toBe('text');
  });

  it('mp4 / mov 是视频占位', () => {
    expect(quickLookKindOf('movie.mp4', 'file')).toBe('video');
    expect(quickLookKindOf('clip.mov', 'file')).toBe('video');
  });

  it('认不出的扩展名按其他处理，不去读文件', () => {
    expect(quickLookKindOf('archive.zip', 'file')).toBe('other');
    expect(quickLookKindOf('image.dmg', 'file')).toBe('other');
  });

  it('目录一律是其他（Quick Look 不预览目录）', () => {
    expect(quickLookKindOf('Photos.pdf', 'folder')).toBe('other');
  });

  it('扩展名大小写不敏感', () => {
    expect(quickLookKindOf('photo.PNG', 'file')).toBe('image');
    expect(quickLookKindOf('paper.PDF', 'file')).toBe('pdf');
  });
});

describe('cycleIndex：列表里的循环索引', () => {
  it('从第一项往回走绕到最后一项', () => {
    expect(cycleIndex(3, 0, -1)).toBe(2);
  });

  it('从最后一项往前走绕回第一项', () => {
    expect(cycleIndex(3, 2, 1)).toBe(0);
  });

  it('中间项正常步进', () => {
    expect(cycleIndex(3, 1, 1)).toBe(2);
    expect(cycleIndex(3, 1, -1)).toBe(0);
  });

  it('空列表恒为 0', () => {
    expect(cycleIndex(0, 0, 1)).toBe(0);
  });
});

describe('stepSibling：在 siblings 里取上/下一项', () => {
  const first = file('a.txt');
  const second = file('b.txt');
  const last = file('c.txt');
  const nodes = [first, second, last];

  it('下一项', () => {
    expect(stepSibling(nodes, first, 1)).toBe(second);
  });

  it('最后一项的下一项绕回第一项', () => {
    expect(stepSibling(nodes, last, 1)).toBe(first);
  });

  it('不在列表里的条目原样返回', () => {
    const outside = file('x.txt');
    expect(stepSibling(nodes, outside, 1)).toBe(outside);
  });

  it('空列表原样返回', () => {
    const only = file('a.txt');
    expect(stepSibling([], only, 1)).toBe(only);
  });
});

describe('zoomBy：25%–400% 之间的缩放步进', () => {
  it('放大一档是 1.25 倍', () => {
    expect(zoomBy(1, 1)).toBe(1.25);
  });

  it('缩小一档是 0.8 倍', () => {
    expect(zoomBy(1, -1)).toBe(0.8);
  });

  it('缩过头停在 25%', () => {
    expect(zoomBy(ZOOM_MIN, -1)).toBe(ZOOM_MIN);
    expect(zoomBy(0.3, -1)).toBe(ZOOM_MIN);
  });

  it('放过头停在 400%', () => {
    expect(zoomBy(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
    expect(zoomBy(3.5, 1)).toBe(ZOOM_MAX);
  });

  it('0 复位到 100%', () => {
    expect(zoomBy(2.5, 0)).toBe(1);
  });

  it('放大再缩小回到原值（没有浮点误差累积）', () => {
    expect(zoomBy(zoomBy(1, 1), -1)).toBe(1);
  });
});

describe('previewText：文本预览截断', () => {
  it('不超过上限的文本原样展示', () => {
    expect(previewText('hello')).toBe('hello');
    expect(previewText('a'.repeat(TEXT_PREVIEW_LIMIT))).toBe('a'.repeat(TEXT_PREVIEW_LIMIT));
  });

  it('超过上限只留前 2000 字符并加省略号', () => {
    const preview = previewText('a'.repeat(TEXT_PREVIEW_LIMIT + 500));
    expect(preview).toBe(`${'a'.repeat(TEXT_PREVIEW_LIMIT)}…`);
  });
});

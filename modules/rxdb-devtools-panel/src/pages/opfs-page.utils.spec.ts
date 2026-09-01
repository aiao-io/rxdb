import { describe, expect, it } from 'vitest';
import {
  createPathSegments,
  formatFileDate,
  formatFileSize,
  isBackdropInteraction,
  summarizeFiles
} from './opfs-page.utils';

describe('isBackdropInteraction', () => {
  it('accepts direct backdrop interactions', () => {
    const backdrop = new EventTarget();

    expect(isBackdropInteraction({ currentTarget: backdrop, target: backdrop })).toBe(true);
  });

  it('ignores interactions bubbling from modal content', () => {
    expect(
      isBackdropInteraction({
        currentTarget: new EventTarget(),
        target: new EventTarget()
      })
    ).toBe(false);
  });
});

describe('OPFS presentation helpers', () => {
  it.each([
    [undefined, '-'],
    [0, '0 B'],
    [1023, '1023 B'],
    [1024, '1.0 KB'],
    [1024 * 1024, '1.0 MB'],
    // P2-16：storage.page.ts 里那份实现的 `sizes` 只到 GB，1TB 时 `sizes[4]` 是 undefined，
    // 直接渲染成「1 undefined」；两份实现口径还不一致（0 与 undefined 的处理都不同）。
    // 统一后必须覆盖到 TB/PB，且超出档位不得产出 undefined。
    [1024 ** 3, '1.0 GB'],
    [1024 ** 4, '1.0 TB'],
    [1024 ** 5, '1.0 PB'],
    // 超出最大档位时钳到 PB，而不是越界
    [1024 ** 7, '1048576.0 PB']
  ] as const)('formats %s bytes as %s', (bytes, expected) => {
    expect(formatFileSize(bytes)).toBe(expected);
  });

  it.each([1024 ** 4, 1024 ** 5, 1024 ** 8])('永不产出 undefined 单位：%s', bytes => {
    expect(formatFileSize(bytes)).not.toContain('undefined');
  });

  it('builds cumulative breadcrumb paths', () => {
    expect(createPathSegments('/databases/demo/files')).toEqual([
      { name: 'databases', path: '/databases' },
      { name: 'demo', path: '/databases/demo' },
      { name: 'files', path: '/databases/demo/files' }
    ]);
    expect(createPathSegments('/')).toEqual([]);
  });

  it('counts files and directories', () => {
    expect(
      summarizeFiles([
        { name: 'docs', path: '/docs', type: 'directory' },
        { name: 'db.sqlite', path: '/db.sqlite', type: 'file' }
      ])
    ).toEqual({ directories: 1, files: 1 });
  });

  it('returns a stable placeholder for missing dates', () => {
    expect(formatFileDate(undefined)).toBe('-');
  });
});

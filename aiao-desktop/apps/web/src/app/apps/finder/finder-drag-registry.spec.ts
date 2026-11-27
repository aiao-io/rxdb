import { describe, expect, it } from 'vitest';

import { finderDragPaths, setFinderDrag } from './finder-drag-registry';

describe('finder-drag-registry 拖拽路径登记', () => {
  it('初始没有拖拽', () => {
    expect(finderDragPaths()).toBeNull();
  });

  it('拖拽开始写入路径，防御性拷贝（改原数组不影响登记值）', () => {
    const paths: string[][] = [
      ['Users', 'a'],
      ['Users', 'b']
    ];
    setFinderDrag(paths);
    expect(finderDragPaths()).toEqual([
      ['Users', 'a'],
      ['Users', 'b']
    ]);
    paths[0] = ['changed'];
    expect(finderDragPaths()).toEqual([
      ['Users', 'a'],
      ['Users', 'b']
    ]);
  });

  it('拖拽结束传 null 清空', () => {
    setFinderDrag([['Users', 'a']]);
    setFinderDrag(null);
    expect(finderDragPaths()).toBeNull();
  });
});

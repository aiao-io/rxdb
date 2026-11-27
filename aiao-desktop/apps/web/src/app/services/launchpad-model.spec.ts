import { describe, expect, it } from 'vitest';

import type { DesktopAppId } from './desktop-apps';
import {
  FOLDER_PREFIX,
  LaunchpadFolders,
  LaunchpadOrder,
  LaunchpadTileRect,
  addToLaunchpadFolder,
  createLaunchpadFolder,
  isLaunchpadFolders,
  isLaunchpadOrder,
  moveLaunchpadEntry,
  nextLaunchpadFolderName,
  reconcileLaunchpad,
  removeFromLaunchpadFolder,
  resolveLaunchpadDrop,
  sameLaunchpadFolders,
  sameLaunchpadOrder
} from './launchpad-model';

/** 测试里用占位应用 id。 */
const app = (id: string) => id as DesktopAppId;
const order = (...entries: readonly string[]): LaunchpadOrder => entries as unknown as LaunchpadOrder;
const folders = (value: Readonly<Record<string, readonly string[]>>): LaunchpadFolders =>
  value as unknown as LaunchpadFolders;

/** 瓦片矩形：行距 100、列距 100、瓦片 10×10，第 i 个瓦片位于 (i×100, Math.floor(i/7)×100)（行每 7 个换行，列不换行）。 */
const rect = (key: string, left: number, top: number, size = 10): LaunchpadTileRect => ({
  key,
  left,
  top,
  right: left + size,
  bottom: top + size
});
const grid = (...keys: readonly string[]): LaunchpadTileRect[] =>
  keys.map((key, index) => rect(key, index * 100, Math.floor(index / 7) * 100));

describe('resolveLaunchpadDrop 落点解析', () => {
  const rects = grid('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i');

  it('落在瓦片矩形里就是那个瓦片', () => {
    expect(resolveLaunchpadDrop(rects, 105, 5)).toEqual({ kind: 'tile', key: 'b' });
    expect(resolveLaunchpadDrop(rects, 700, 105)).toEqual({ kind: 'tile', key: 'h' });
  });

  it('瓦片之间是插入位置', () => {
    expect(resolveLaunchpadDrop(rects, 55, 5)).toEqual({ kind: 'slot', index: 1 });
    expect(resolveLaunchpadDrop(rects, -5, 5)).toEqual({ kind: 'slot', index: 0 });
    expect(resolveLaunchpadDrop(rects, 650, 5)).toEqual({ kind: 'slot', index: 7 });
  });

  it('行间隙与上下边缘', () => {
    expect(resolveLaunchpadDrop(rects, 5, 50)).toEqual({ kind: 'slot', index: 7 });
    expect(resolveLaunchpadDrop(rects, 5, 110)).toEqual({ kind: 'slot', index: 9 });
    expect(resolveLaunchpadDrop(rects, 5, -5)).toEqual({ kind: 'slot', index: 0 });
  });
});

describe('moveLaunchpadEntry 移动顺序表', () => {
  it('取出之后按 index 插入', () => {
    expect(moveLaunchpadEntry(order('a', 'b', 'c'), app('a'), 2)).toEqual(order('b', 'c', 'a'));
    expect(moveLaunchpadEntry(order('a', 'b', 'c'), app('c'), 0)).toEqual(order('c', 'a', 'b'));
    expect(moveLaunchpadEntry(order('a', 'b', 'c'), app('b'), 0)).toEqual(order('b', 'a', 'c'));
  });

  it('位置没变或条目不存在时原样返回', () => {
    const list = order('a', 'b', 'c');
    expect(moveLaunchpadEntry(list, app('b'), 1)).toBe(list);
    expect(moveLaunchpadEntry(list, app('zz'), 0)).toBe(list);
  });

  it('index 越界时钳到两端', () => {
    expect(moveLaunchpadEntry(order('a', 'b'), app('a'), 99)).toEqual(order('b', 'a'));
    expect(moveLaunchpadEntry(order('a', 'b'), app('b'), -5)).toEqual(order('b', 'a'));
  });

  it('文件夹标记同样可移动', () => {
    const marker = `${FOLDER_PREFIX}F`;
    expect(moveLaunchpadEntry(order('a', marker, 'b'), marker, 0)).toEqual(order(marker, 'a', 'b'));
  });
});

describe('createLaunchpadFolder 拖到应用上合成文件夹', () => {
  it('文件夹放在目标的位置，目标在前', () => {
    const result = createLaunchpadFolder(folders({}), order('a', 'b', 'c', 'd'), app('a'), app('c'));
    expect(result.order).toEqual(order('b', 'folder:Folder 1', 'd'));
    expect(result.folders).toEqual({ 'Folder 1': [app('c'), app('a')] });
  });

  it('目标在前拖拽物在后时插在目标位置', () => {
    const result = createLaunchpadFolder(folders({}), order('a', 'b', 'c'), app('c'), app('a'));
    expect(result.order).toEqual(order('folder:Folder 1', 'b'));
    expect(result.folders).toEqual({ 'Folder 1': [app('a'), app('c')] });
  });

  it('编号接在现有文件夹后面', () => {
    const result = createLaunchpadFolder(folders({ 'Folder 1': ['x'] }), order('a', 'b'), app('a'), app('b'));
    expect(result.folders).toEqual({ 'Folder 1': ['x'], 'Folder 2': [app('b'), app('a')] });
  });

  it('拖拽物原本在别的文件夹里会先移出', () => {
    const result = createLaunchpadFolder(folders({ F: ['a', 'x'] }), order('folder:F', 'b', 'c'), app('a'), app('c'));
    expect(result.folders).toEqual({ F: ['x'], 'Folder 1': [app('c'), app('a')] });
    expect(result.order).toEqual(order('folder:F', 'b', 'folder:Folder 1'));
  });

  it('拖拽物原本独占一个文件夹：文件夹删除后合成新文件夹', () => {
    const result = createLaunchpadFolder(folders({ F: ['a'] }), order('folder:F', 'b', 'c'), app('a'), app('c'));
    expect(result.folders).toEqual({ 'Folder 1': [app('c'), app('a')] });
    expect(result.order).toEqual(order('b', 'folder:Folder 1'));
  });

  it('目标在文件夹里、目标不在顺序表或同应用时原样返回', () => {
    const baseFolders = folders({ F: ['c'] });
    const baseOrder = order('folder:F', 'a');
    expect(createLaunchpadFolder(baseFolders, baseOrder, app('a'), app('c'))).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
    expect(createLaunchpadFolder(baseFolders, baseOrder, app('a'), app('zz'))).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
    expect(createLaunchpadFolder(baseFolders, baseOrder, app('a'), app('a'))).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
  });
});

describe('addToLaunchpadFolder 拖进文件夹', () => {
  it('应用追加到文件夹末尾并从顺序表移除', () => {
    const result = addToLaunchpadFolder(folders({ F: ['x'] }), order('folder:F', 'a', 'b'), app('a'), 'F');
    expect(result.order).toEqual(order('folder:F', 'b'));
    expect(result.folders).toEqual({ F: ['x', app('a')] });
  });

  it('从别的文件夹移入', () => {
    const result = addToLaunchpadFolder(
      folders({ F: ['x'], G: ['a'] }),
      order('folder:F', 'folder:G', 'b'),
      app('a'),
      'F'
    );
    expect(result.order).toEqual(order('folder:F', 'b'));
    expect(result.folders).toEqual({ F: ['x', app('a')] });
  });

  it('文件夹不存在或已在里面时原样返回', () => {
    const baseFolders = folders({ F: ['a'] });
    const baseOrder = order('folder:F', 'b');
    expect(addToLaunchpadFolder(baseFolders, baseOrder, app('a'), 'F')).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
    expect(addToLaunchpadFolder(baseFolders, baseOrder, app('b'), 'zz')).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
  });
});

describe('removeFromLaunchpadFolder 移出文件夹', () => {
  it('文件夹还有应用时回到标记之后的位置', () => {
    const result = removeFromLaunchpadFolder(folders({ F: ['x', 'a'] }), order('folder:F', 'b'), 'F', app('a'));
    expect(result.order).toEqual(order('folder:F', 'a', 'b'));
    expect(result.folders).toEqual({ F: ['x'] });
  });

  it('文件夹空了连标记一起删掉', () => {
    const result = removeFromLaunchpadFolder(folders({ F: ['a'] }), order('folder:F', 'b'), 'F', app('a'));
    expect(result.order).toEqual(order('a', 'b'));
    expect(result.folders).toEqual({});
  });

  it('没有标记时放到末尾', () => {
    const result = removeFromLaunchpadFolder(folders({ F: ['a'] }), order('b'), 'F', app('a'));
    expect(result.order).toEqual(order('b', 'a'));
  });

  it('应用不在这个文件夹里时原样返回', () => {
    const baseFolders = folders({ F: ['x'] });
    const baseOrder = order('folder:F', 'b');
    expect(removeFromLaunchpadFolder(baseFolders, baseOrder, 'F', app('b'))).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
    expect(removeFromLaunchpadFolder(baseFolders, baseOrder, 'zz', app('x'))).toEqual({
      order: baseOrder,
      folders: baseFolders
    });
  });
});

describe('reconcileLaunchpad 与登记表对账', () => {
  it('丢掉不认识的应用、悬空标记与空文件夹，补上新增应用', () => {
    const result = reconcileLaunchpad(order('ghost', 'folder:Gone', 'a'), folders({ Gone: ['ghost2'], E: [] }), [
      app('a'),
      app('b')
    ]);
    expect(result.order).toEqual(order('a', 'b'));
    expect(result.folders).toEqual({});
  });

  it('文件夹里的应用不再留在顺序表里，重复的只留第一个', () => {
    const result = reconcileLaunchpad(order('a', 'folder:F', 'b', 'a', 'folder:F'), folders({ F: ['a'] }), [
      app('a'),
      app('b'),
      app('c')
    ]);
    expect(result.order).toEqual(order('folder:F', 'b', 'c'));
    expect(result.folders).toEqual({ F: [app('a')] });
  });

  it('两个文件夹共用一个应用时只留第一个', () => {
    const result = reconcileLaunchpad(order('folder:F', 'folder:G'), folders({ F: ['a'], G: ['a'] }), [app('a')]);
    expect(result.order).toEqual(order('folder:F'));
    expect(result.folders).toEqual({ F: [app('a')] });
  });

  it('文件夹里不认识的应用被剔除', () => {
    const result = reconcileLaunchpad(order('folder:F'), folders({ F: ['zz', 'a'] }), [app('a')]);
    expect(result.order).toEqual(order('folder:F'));
    expect(result.folders).toEqual({ F: [app('a')] });
  });

  it('没有需要修复的内容时原样返回入参', () => {
    const baseOrder = order('a', 'folder:F', 'b');
    const baseFolders = folders({ F: ['x'] });
    const result = reconcileLaunchpad(baseOrder, baseFolders, [app('a'), app('b'), app('x')]);
    expect(result.order).toBe(baseOrder);
    expect(result.folders).toBe(baseFolders);
  });

  it('空顺序表从登记表生成', () => {
    const result = reconcileLaunchpad([], {}, [app('a'), app('b')]);
    expect(result.order).toEqual(order('a', 'b'));
    expect(result.folders).toEqual({});
  });
});

describe('nextLaunchpadFolderName 文件夹命名', () => {
  it('按现有编号最大值加一', () => {
    expect(nextLaunchpadFolderName(folders({}))).toBe('Folder 1');
    expect(nextLaunchpadFolderName(folders({ 'Folder 1': [] }))).toBe('Folder 2');
    expect(nextLaunchpadFolderName(folders({ 'Folder 1': [], 'Folder 5': [] }))).toBe('Folder 6');
    expect(nextLaunchpadFolderName(folders({ X: [] }))).toBe('Folder 1');
  });
});

describe('偏好形状校验与相等比较', () => {
  it('顺序表只收非空字符串数组', () => {
    expect(isLaunchpadOrder([])).toBe(true);
    expect(isLaunchpadOrder(['a', 'folder:F'])).toBe(true);
    expect(isLaunchpadOrder(['a', 1])).toBe(false);
    expect(isLaunchpadOrder('a')).toBe(false);
    expect(isLaunchpadOrder(null)).toBe(false);
  });

  it('文件夹只收名字非空、值为字符串数组的对象', () => {
    expect(isLaunchpadFolders({})).toBe(true);
    expect(isLaunchpadFolders({ F: ['a'] })).toBe(true);
    expect(isLaunchpadFolders({ F: [1] })).toBe(false);
    expect(isLaunchpadFolders({ '': ['a'] })).toBe(false);
    expect(isLaunchpadFolders(['a'])).toBe(false);
    expect(isLaunchpadFolders(null)).toBe(false);
  });

  it('相等比较', () => {
    expect(sameLaunchpadOrder(order('a', 'b'), order('a', 'b'))).toBe(true);
    expect(sameLaunchpadOrder(order('a', 'b'), order('b', 'a'))).toBe(false);
    expect(sameLaunchpadOrder(order('a'), order('a', 'b'))).toBe(false);
    expect(sameLaunchpadFolders(folders({ F: ['a'] }), folders({ F: ['a'] }))).toBe(true);
    expect(sameLaunchpadFolders(folders({ F: ['a'] }), folders({ G: ['a'] }))).toBe(false);
  });
});

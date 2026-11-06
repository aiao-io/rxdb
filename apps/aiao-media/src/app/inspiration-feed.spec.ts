import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { imageMvpCatalog } from './image-mvp-catalog';
import { authorInitial, columnCount, coverRatio, distribute } from './inspiration-feed';

const published = (image: string) => resolve(import.meta.dirname, '../../public', image.slice(1));

async function pixelSize(image: string): Promise<{ width: number; height: number }> {
  const bytes = readFileSync(published(image));
  if (image.endsWith('.svg')) {
    const box = /viewBox="0 0 (\d+) (\d+)"/.exec(bytes.toString('utf8'));
    return { width: Number(box?.[1]), height: Number(box?.[2]) };
  }
  const { width, height } = await sharp(bytes).metadata();
  return { width: width!, height: height! };
}

describe('灵感封面宽高比', () => {
  it.each(imageMvpCatalog.map(template => [template.id, template.image] as const))(
    '%s 的比例与随应用发布的图片文件一致',
    async (_id, image) => {
      const { width, height } = await pixelSize(image);
      expect(coverRatio(image)).toBeCloseTo(width / height, 6);
    }
  );

  it('未登记尺寸的图片按 4:5 预留，不阻断卡片渲染', () => {
    expect(coverRatio('/image-examples/not-registered.jpg')).toBeCloseTo(4 / 5, 6);
  });
});

describe('作者头像首字', () => {
  it.each([
    ['蛋黄堡', '蛋'],
    ['wory＠ホッピング中', 'w'],
    ['  Aiao', 'A'],
    ['🍵 茶馆', '🍵'],
    ['', '']
  ])('%j 显示 %j', (author, initial) => {
    expect(authorInitial(author)).toBe(initial);
  });
});

describe('瀑布流列数', () => {
  it.each([
    [350, 2],
    [429, 2],
    [828, 4],
    [1168, 5],
    [1536, 7]
  ])('内容宽 %d 时分 %d 列，手机宽度至少两列', (width, count) => {
    expect(columnCount(width)).toBe(count);
  });

  it.each([
    [150, 7],
    [190, 5],
    [250, 4],
    [320, 3]
  ])('单列最小 %d px 时，1168 宽的主区分 %d 列', (minWidth, count) => {
    expect(columnCount(1168, minWidth)).toBe(count);
  });

  it('超宽屏的主区里列数随宽度增长，卡片放大后列数相应减少', () => {
    // 3440 宽窗口扣掉侧栏与两侧留白后约 3168。
    expect(columnCount(3168)).toBe(15);
    expect(columnCount(3168, 320)).toBe(9);
    expect(columnCount(3168, 320)).toBeLessThan(columnCount(3168, 150));
  });

  it('列数有上限时，宽到放得下更多列也不再加列，卡片随之变大', () => {
    expect(columnCount(3168, 190, 8)).toBe(8);
    expect(columnCount(4848, 190, 8)).toBe(8);
    // 上限不影响本来就放不下那么多列的窄窗口。
    expect(columnCount(1168, 190, 8)).toBe(5);
    expect(columnCount(1648, 190, 8)).toBe(8);
  });

  it('卡片再大，手机宽度也至少两列', () => {
    expect(columnCount(350, 320)).toBe(2);
    expect(columnCount(350, 320, 4)).toBe(2);
  });
});

describe('瀑布流分列', () => {
  const tall = '/image-examples/coffee.jpg';
  const wide = '/prompt-art/coastline.svg';
  const card = (id: string, image = wide) => ({ id, image });
  const ids = (lanes: { id: string }[][]) => lanes.map(lane => lane.map(item => item.id));

  it('等高时依次放进各列，前几张排在第一排', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => card(id));
    expect(ids(distribute(items, 3))).toEqual([
      ['a', 'd'],
      ['b', 'e'],
      ['c', 'f']
    ]);
  });

  it('下一张放进当前最矮的一列，高卡片独占的列不再加卡片', () => {
    const items = [card('tall', tall), card('x'), card('y'), card('z')];
    expect(ids(distribute(items, 2))).toEqual([['tall'], ['x', 'y', 'z']]);
  });

  it('卡片少于列数时保留空列，卡片宽度不随数量变化', () => {
    expect(ids(distribute([card('a')], 3))).toEqual([['a'], [], []]);
    expect(ids(distribute([], 2))).toEqual([[], []]);
  });

  it('同一列内保持输入顺序', () => {
    const items = [card('a', tall), card('b'), card('c'), card('d'), card('e')];
    const lanes = ids(distribute(items, 2));
    for (const lane of lanes) expect(lane).toEqual([...lane].sort());
  });
});

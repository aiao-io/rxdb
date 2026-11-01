import { describe, expect, it } from 'vitest';

import { BOARD_LABEL_COLORS, nextLabelColor } from '../palette.js';
import { placePopover } from '../popover.js';

const viewport = { width: 1000, height: 800 };

describe('placePopover（弹层定位）', () => {
  it('默认在触发器下方、与触发器右边对齐', () => {
    const anchor = { top: 100, bottom: 120, left: 300, right: 340 };
    expect(placePopover(anchor, { width: 200, height: 150 }, viewport)).toEqual({ top: 124, left: 140 });
  });

  it('左对齐；越出左右边界时夹回视口内', () => {
    expect(
      placePopover({ top: 0, bottom: 20, left: 900, right: 940 }, { width: 200, height: 100 }, viewport, {
        align: 'start'
      })
    ).toEqual({ top: 24, left: 792 });
    expect(placePopover({ top: 0, bottom: 20, left: 10, right: 50 }, { width: 200, height: 100 }, viewport)).toEqual({
      top: 24,
      left: 8
    });
  });

  it('下方放不下且上方更宽裕时翻到上方', () => {
    const anchor = { top: 700, bottom: 720, left: 300, right: 340 };
    expect(placePopover(anchor, { width: 200, height: 300 }, viewport)).toEqual({ top: 396, left: 140 });
  });

  it('上下都放不下时贴视口边缘', () => {
    const anchor = { top: 380, bottom: 400, left: 300, right: 340 };
    expect(placePopover(anchor, { width: 200, height: 790 }, viewport)).toEqual({ top: 8, left: 140 });
  });
});

describe('标签色板', () => {
  it('8 个预设色，均为合法 #rrggbb', () => {
    expect(BOARD_LABEL_COLORS).toHaveLength(8);
    for (const option of BOARD_LABEL_COLORS) expect(option.color).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('新标签默认取第一个未被使用的预设色，用尽后循环', () => {
    expect(nextLabelColor([])).toBe(BOARD_LABEL_COLORS[0].color);
    expect(nextLabelColor([BOARD_LABEL_COLORS[0].color.toUpperCase()])).toBe(BOARD_LABEL_COLORS[1].color);
    expect(nextLabelColor(BOARD_LABEL_COLORS.map(option => option.color))).toBe(BOARD_LABEL_COLORS[0].color);
  });
});

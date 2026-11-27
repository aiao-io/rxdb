import { describe, expect, it } from 'vitest';

import { EventDate, miniMonth, monthCells, pickStep, timeDragMinutes } from './calendar-model';

describe('pickStep', () => {
  it('左右移动一天，跨月与跨年自动进位', () => {
    expect(pickStep([2026, 10, 30], 'ArrowRight')).toEqual([2026, 11, 1]);
    expect(pickStep([2026, 0, 1], 'ArrowLeft')).toEqual([2025, 11, 31]);
    expect(pickStep([2026, 10, 15], 'ArrowRight')).toEqual([2026, 10, 16]);
  });

  it('上下移动一周', () => {
    expect(pickStep([2026, 10, 15], 'ArrowUp')).toEqual([2026, 10, 8]);
    expect(pickStep([2026, 10, 28], 'ArrowDown')).toEqual([2026, 11, 5]);
  });

  it('与 monthCells 的格子日期同形，可以互相喂值', () => {
    const cell: EventDate = [2026, 10, 15];
    const stepped = pickStep(cell, 'ArrowDown');
    expect(monthCells(stepped[0], stepped[1]).some(c => !c.out && c.d === stepped[2])).toBe(true);
  });
});

describe('timeDragMinutes', () => {
  it('把纵向位移换算成 15 分钟一档', () => {
    expect(timeDragMinutes(0)).toBe(0);
    expect(timeDragMinutes(42)).toBe(60);
    expect(timeDragMinutes(-42)).toBe(-60);
    expect(timeDragMinutes(10)).toBe(15);
    expect(timeDragMinutes(-8)).toBe(-15);
  });
});

describe('miniMonth', () => {
  const now = new Date(2026, 10, 15);

  it('月初前的空位没有日期，当月每一天带着自己的年月日', () => {
    const { cells } = miniMonth(2026, 10, now);
    expect(cells.length).toBeGreaterThanOrEqual(28);
    expect(cells.filter(cell => cell.d === 0).length).toBe(new Date(2026, 10, 1).getDay());
    for (let d = 1; d <= 30; d++) {
      const cell = cells.find(item => item.d === d);
      expect(cell).toMatchObject({ y: 2026, m: 10, d, out: false });
    }
  });

  it('今天与空位标记保持原有语义', () => {
    const { cells } = miniMonth(2026, 10, now);
    expect(cells.find(cell => cell.d === 15)?.today).toBe(true);
    expect(cells.find(cell => cell.d === 1)?.today).toBe(false);
    expect(cells.filter(cell => cell.out).every(cell => cell.d === 0 && cell.text === '')).toBe(true);
  });
});

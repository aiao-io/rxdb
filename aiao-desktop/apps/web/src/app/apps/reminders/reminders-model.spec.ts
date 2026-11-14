import { describe, expect, it } from 'vitest';

import { SEED_REMINDERS } from './reminders-data';
import {
  DONE_TINT,
  ReminderDraft,
  ReminderFields,
  draftRow,
  dueToday,
  nextPosition,
  rowOf,
  togglePatch
} from './reminders-model';

const reminder = (patch: Partial<ReminderFields> = {}): ReminderFields => ({
  id: 'r1',
  title: 'Pick up dry cleaning',
  due: 'Today',
  done: false,
  tint: '#ff9f0a',
  position: 0,
  ...patch
});

describe('rowOf / draftRow', () => {
  it('库里的提醒转成普通行（不是草稿、不在编辑）', () => {
    expect(rowOf(reminder())).toEqual({
      id: 'r1',
      title: 'Pick up dry cleaning',
      due: 'Today',
      done: false,
      tint: '#ff9f0a',
      fresh: false,
      editing: false
    });
  });

  it('草稿转成 fresh 行：时间说明 Today、完成色强调蓝，编辑态跟着草稿走', () => {
    const draft: ReminderDraft = { id: 'draft-1', done: true, editing: true, title: '', createdId: null };
    expect(draftRow(draft)).toEqual({
      id: 'draft-1',
      title: '',
      due: 'Today',
      done: true,
      tint: DONE_TINT,
      fresh: true,
      editing: true
    });
    expect(draftRow({ ...draft, editing: false, title: 'Buy milk' })).toMatchObject({
      title: 'Buy milk',
      editing: false
    });
  });
});

describe('nextPosition', () => {
  it('比现有的都小，新建的排到最前', () => {
    expect(nextPosition([0, 1, 2, 3])).toBe(-1);
    expect(nextPosition([-2, 0, 5])).toBe(-3);
  });

  it('现有的位置都为正时仍然排在最前', () => {
    expect(nextPosition([4, 9])).toBe(3);
  });

  it('列表为空时从 0 开始', () => {
    expect(nextPosition([])).toBe(0);
  });
});

describe('dueToday', () => {
  it('时间说明是 Today 或 Today 加时刻、且没完成的算今天的提醒', () => {
    expect(dueToday(reminder({ due: 'Today' }))).toBe(true);
    expect(dueToday(reminder({ due: 'Today 5:00 PM' }))).toBe(true);
  });

  it('已完成、明天、以及只是以 Today 开头的词都不算', () => {
    expect(dueToday(reminder({ done: true }))).toBe(false);
    expect(dueToday(reminder({ due: 'Tomorrow 9:00 AM' }))).toBe(false);
    expect(dueToday(reminder({ due: 'Todays' }))).toBe(false);
    expect(dueToday(reminder({ due: 'Done' }))).toBe(false);
  });

  it('初始数据里恰好有三条今天的提醒（和原来小组件的 “3 remaining” 一致）', () => {
    const today = SEED_REMINDERS.filter(dueToday);
    expect(today.map(seed => seed.title)).toEqual([
      'Send design review feedback',
      'Review PR #142 — column view sizing',
      'Pick up dry cleaning'
    ]);
  });
});

describe('togglePatch', () => {
  it('未完成的勾上：标记完成并染成强调蓝', () => {
    expect(togglePatch({ done: false })).toEqual({ done: true, tint: DONE_TINT });
  });

  it('已完成的取消：只改 done，颜色保持', () => {
    expect(togglePatch({ done: true })).toEqual({ done: false });
  });
});

describe('SEED_REMINDERS', () => {
  it('七条：前五条待办、后两条已完成，已完成的用灰色', () => {
    expect(SEED_REMINDERS.map(seed => seed.done)).toEqual([false, false, false, false, false, true, true]);
    for (const seed of SEED_REMINDERS.filter(entry => entry.done)) expect(seed.tint).toBe('#8e8e93');
  });
});

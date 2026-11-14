import { describe, expect, it } from 'vitest';

import { SEED_NOTES } from './notes-data';
import {
  ALL_NOTES,
  NOTES_FOLDER,
  NoteLike,
  TRASH_FOLDER,
  folderCount,
  inFolder,
  newNoteBody,
  noteWhen,
  visibleNotes
} from './notes-model';

const note = (patch: Partial<NoteLike> = {}): NoteLike => ({
  folder: NOTES_FOLDER,
  title: 'Title',
  body: '<h1>Title</h1>',
  date: new Date(2026, 6, 20, 9, 30),
  pinned: false,
  ...patch
});

describe('inFolder / folderCount', () => {
  it('All iCloud 是除 Recently Deleted 以外的全部笔记，其余文件夹按名字匹配', () => {
    const notes = [note(), note({ folder: TRASH_FOLDER }), note()];
    expect(notes.map(entry => inFolder(entry, ALL_NOTES))).toEqual([true, false, true]);
    expect(folderCount(notes, ALL_NOTES)).toBe(2);
    expect(folderCount(notes, NOTES_FOLDER)).toBe(2);
    expect(folderCount(notes, TRASH_FOLDER)).toBe(1);
  });

  it('空列表的数量是 0', () => {
    expect(folderCount([], ALL_NOTES)).toBe(0);
  });
});

describe('visibleNotes', () => {
  const newest = note({ title: 'Newest', date: new Date(2026, 6, 27) });
  const oldest = note({ title: 'Oldest', date: new Date(2026, 6, 1) });
  const pinned = note({ title: 'Pinned', date: new Date(2026, 6, 10), pinned: true });
  const trashed = note({ title: 'Trashed', folder: TRASH_FOLDER, date: new Date(2026, 6, 30) });

  it('置顶优先，其余按日期从新到旧', () => {
    const titles = visibleNotes([oldest, newest, pinned], NOTES_FOLDER, '').map(entry => entry.title);
    expect(titles).toEqual(['Pinned', 'Newest', 'Oldest']);
  });

  it('不改动传入的数组', () => {
    const input = [oldest, newest];
    visibleNotes(input, NOTES_FOLDER, '');
    expect(input).toEqual([oldest, newest]);
  });

  it('按文件夹过滤：All iCloud 不含废纸篓，废纸篓只含自己的', () => {
    const all = [newest, trashed];
    expect(visibleNotes(all, ALL_NOTES, '').map(entry => entry.title)).toEqual(['Newest']);
    expect(visibleNotes(all, TRASH_FOLDER, '').map(entry => entry.title)).toEqual(['Trashed']);
  });

  it('搜索词同时匹配标题和正文，不分大小写', () => {
    const grocery = note({ title: 'Grocery', body: '<h1>Grocery</h1><p>Oat MILK</p>' });
    const all = [newest, grocery];
    expect(visibleNotes(all, NOTES_FOLDER, 'milk').map(entry => entry.title)).toEqual(['Grocery']);
    expect(visibleNotes(all, NOTES_FOLDER, 'NEWEST').map(entry => entry.title)).toEqual(['Newest']);
    expect(visibleNotes(all, NOTES_FOLDER, 'nothing like this')).toEqual([]);
  });
});

describe('noteWhen', () => {
  const now = new Date(2026, 10, 12, 18, 0);

  it('今天显示时刻', () => {
    expect(noteWhen(new Date(2026, 10, 12, 9, 5), now)).toBe('9:05 AM');
  });

  it('一周内显示星期', () => {
    expect(noteWhen(new Date(2026, 10, 9, 9, 5), now)).toBe('Monday');
  });

  it('更早的显示 dd/mm/yy', () => {
    expect(noteWhen(new Date(2026, 6, 27, 16, 12), now)).toBe('27/07/26');
  });
});

describe('newNoteBody', () => {
  it('标题、日期行和一个空段落', () => {
    expect(newNoteBody(new Date(2026, 6, 27, 16, 12))).toBe(
      '<h1>New Note</h1><div class="date">27 July 2026 at 4:12 PM</div><p><br></p>'
    );
  });
});

describe('SEED_NOTES', () => {
  it('六条：Notes 里五条（第一条置顶）、Recently Deleted 里一条，侧栏数量与原来写死的 5 / 5 / 1 一致', () => {
    expect(SEED_NOTES).toHaveLength(6);
    expect(SEED_NOTES[0].pinned).toBe(true);
    expect(SEED_NOTES.filter(seed => seed.pinned)).toHaveLength(1);
    const notes = SEED_NOTES.map(seed => ({ ...seed, pinned: seed.pinned ?? false }));
    expect(folderCount(notes, ALL_NOTES)).toBe(5);
    expect(folderCount(notes, NOTES_FOLDER)).toBe(5);
    expect(folderCount(notes, TRASH_FOLDER)).toBe(1);
  });

  it('初始列表的显示顺序与种子顺序一致（置顶且最新的在最前，日期依次变早）', () => {
    const notes = SEED_NOTES.map(seed => ({ ...seed, pinned: seed.pinned ?? false }));
    expect(visibleNotes(notes, NOTES_FOLDER, '').map(entry => entry.title)).toEqual([
      'Interface rules',
      'Window shadow recipe',
      'Dock falloff',
      'Grocery',
      'Sprint planning'
    ]);
  });

  it('每条笔记的正文以自己的标题开头', () => {
    for (const seed of SEED_NOTES) expect(seed.body.startsWith(`<h1>${seed.title}</h1>`)).toBe(true);
  });
});

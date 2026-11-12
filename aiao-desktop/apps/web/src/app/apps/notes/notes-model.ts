import { DAYS, MONS, time12Plain } from '../../shared/format';

/** 侧栏里的虚拟文件夹：除 Recently Deleted 以外的全部笔记。 */
export const ALL_NOTES = 'All iCloud';
/** 默认文件夹：新建的笔记放在这里。 */
export const NOTES_FOLDER = 'Notes';
/** 删除的笔记先放进这里；已经在里面的再删才是真删除。 */
export const TRASH_FOLDER = 'Recently Deleted';

/** 过滤、排序与计数用到的笔记字段：库里的 `Note` 实体和测试里的普通对象都满足。 */
export interface NoteLike {
  readonly folder: string;
  readonly title: string;
  readonly body: string;
  readonly date: Date;
  readonly pinned: boolean;
}

/** 笔记是否属于侧栏里的某个文件夹（`ALL_NOTES` 是除废纸篓以外的全部）。 */
export const inFolder = (note: Pick<NoteLike, 'folder'>, folder: string): boolean =>
  folder === ALL_NOTES ? note.folder !== TRASH_FOLDER : note.folder === folder;

/** 侧栏文件夹右侧的笔记数量。 */
export const folderCount = (notes: readonly Pick<NoteLike, 'folder'>[], folder: string): number =>
  notes.filter(note => inFolder(note, folder)).length;

/** 列表里显示的笔记：按文件夹与搜索词（标题或正文，不分大小写）过滤，置顶优先、其余按日期新到旧。 */
export function visibleNotes<T extends NoteLike>(notes: readonly T[], folder: string, query: string): T[] {
  const needle = query.toLowerCase();
  return notes
    .filter(note => inFolder(note, folder))
    .filter(note => !needle || `${note.title} ${note.body}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.getTime() - a.date.getTime());
}

/** 列表里的时间标签：今天显示时刻，一周内显示星期，更早的显示 dd/mm/yy。 */
export function noteWhen(date: Date, now: Date): string {
  if (date.toDateString() === now.toDateString()) return time12Plain(date);
  if ((now.getTime() - date.getTime()) / 864e5 < 7) return DAYS[date.getDay()];
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}/${String(date.getFullYear()).slice(2)}`;
}

/**
 * 列表里的摘要：去掉标题与日期行，取前 60 个字符。
 * 块级元素之间要补一个空格，否则 “Ship” 和 “Column view” 会连成一个词。
 * 用 DOMParser 解析：它产出的文档是惰性的，不会加载图片或触发事件属性。
 */
export function noteSnippet(body: string): string {
  const root = new DOMParser().parseFromString(body, 'text/html').body;
  root.querySelectorAll('h1,.date').forEach(node => node.remove());
  root.querySelectorAll('h2,h3,p,li,tr,div,br').forEach(node => node.insertAdjacentText('afterend', ' '));
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || 'No additional text';
}

/** 保存时取标题：优先首个 h1，没有就取第一行文字。 */
export function noteTitle(doc: HTMLElement): string {
  const heading = doc.querySelector('h1');
  const text = heading ? heading.textContent : (doc.textContent ?? '').split('\n')[0];
  return (text ?? '').trim().slice(0, 60);
}

/** 新建笔记的初始内容：标题、日期行和一个空段落。 */
export function newNoteBody(date: Date): string {
  const stamp = `${date.getDate()} ${MONS[date.getMonth()]} ${date.getFullYear()} at ${time12Plain(date)}`;
  return `<h1>New Note</h1><div class="date">${stamp}</div><p><br></p>`;
}

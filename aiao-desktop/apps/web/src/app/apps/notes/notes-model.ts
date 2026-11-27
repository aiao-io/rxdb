import { DAYS, MONS, time12Plain } from '../../shared/format';

/** 侧栏里的虚拟文件夹：除 Recently Deleted 以外的全部笔记。 */
export const ALL_NOTES = 'All Notes';
/** 默认文件夹：新建的笔记放在这里。 */
export const NOTES_FOLDER = 'Notes';
/** 删除的笔记先放进这里；已经在里面的再删才是真删除。 */
export const TRASH_FOLDER = 'Recently Deleted';

/** 系统占用的名字不能被用户文件夹复用。 */
export const SYSTEM_FOLDERS: readonly string[] = [ALL_NOTES, NOTES_FOLDER, TRASH_FOLDER];

/** Notes 文件夹名称的最大长度，避免侧栏被异常长文本撑坏。 */
export const NOTE_FOLDER_NAME_MAX_LENGTH = 60;

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

/**
 * 新建文件夹前的用户可操作校验；比较名称时忽略首尾空格与大小写。
 * `translate` 可选：调用方注入 i18n 翻译函数时文案按当前语言显示（与 calendar-draft 的服务注入风格一致）。
 */
export function noteFolderNameError(
  name: string,
  existing: readonly string[],
  translate?: (key: string, params?: Record<string, unknown>) => string
): string | null {
  const fail = (key: string, params: Record<string, unknown> | undefined, english: string): string =>
    translate?.(key, params) ?? english;
  const value = name.trim();
  if (!value) return fail('error.notes.enterFolderName', undefined, 'Enter a folder name.');
  if (value.length > NOTE_FOLDER_NAME_MAX_LENGTH)
    return fail(
      'error.notes.folderNameTooLong',
      { count: NOTE_FOLDER_NAME_MAX_LENGTH },
      `Folder names can be at most ${NOTE_FOLDER_NAME_MAX_LENGTH} characters.`
    );
  const folded = value.toLowerCase();
  if (SYSTEM_FOLDERS.some(folder => folder.toLowerCase() === folded))
    return fail('error.notes.reservedName', undefined, 'That name is reserved by Notes.');
  if (existing.some(folder => folder.trim().toLowerCase() === folded))
    return fail('error.notes.folderNameExists', undefined, 'A folder with that name already exists.');
  return null;
}

/** 列表里显示的笔记：按文件夹与搜索词（标题或正文，不分大小写）过滤，置顶优先、其余按日期新到旧。 */
export function visibleNotes<T extends NoteLike>(notes: readonly T[], folder: string, query: string): T[] {
  const needle = query.toLowerCase();
  return notes
    .filter(note => inFolder(note, folder))
    .filter(note => !needle || `${note.title} ${note.body}`.toLowerCase().includes(needle))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.date.getTime() - a.date.getTime());
}

/** 列表的排序方式。 */
export type NoteSort = 'edited' | 'created' | 'title';

/**
 * 列表排序：置顶优先，其余按所选方式。
 * 备忘实体只存创建日期（`date`），「编辑日期」暂时按同一字段新到旧排；等编辑器记录修改时间后再区分。
 */
export function sortNotes<T extends NoteLike>(notes: readonly T[], sort: NoteSort): T[] {
  return [...notes].sort((a, b) => {
    const pinned = Number(b.pinned) - Number(a.pinned);
    if (pinned) return pinned;
    if (sort === 'title') return a.title.localeCompare(b.title) || b.date.getTime() - a.date.getTime();
    return sort === 'created' ? a.date.getTime() - b.date.getTime() : b.date.getTime() - a.date.getTime();
  });
}

/**
 * 列表方向键：返回按步数移动后的笔记 id。
 * 还没选中时按第一行算（列表高亮的就是第一行），到头不再移动，返回 `null`。
 */
export const stepNote = (
  notes: readonly { readonly id: string }[],
  currentId: string | null,
  step: number
): string | null => {
  if (!notes.length) return null;
  const index = currentId === null ? 0 : notes.findIndex(note => note.id === currentId);
  if (index < 0) return null;
  return notes[index + step]?.id ?? null;
};

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
export function noteSnippet(body: string, emptyLabel = 'No additional text'): string {
  const root = new DOMParser().parseFromString(body, 'text/html').body;
  root.querySelectorAll('h1,.date').forEach(node => node.remove());
  root.querySelectorAll('h2,h3,p,li,tr,div,br').forEach(node => node.insertAdjacentText('afterend', ' '));
  return (root.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60) || emptyLabel;
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

/** 工具栏 Checklist 插入的一行待办：圆圈不可编辑，点击由编辑区上的事件委托处理。 */
export const CHECKLIST_ITEM = '<div class="todo"><i contenteditable="false"></i><span>&nbsp;</span></div>';

const TABLE_ROW = '<tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr>';

/** 工具栏 Table 插入的 3 × 3 表格（首行是表头），后面跟一个空段落放光标。 */
export const TABLE_HTML = `<table><tr><th>&nbsp;</th><th>&nbsp;</th><th>&nbsp;</th></tr>${TABLE_ROW}${TABLE_ROW}</table><p>&nbsp;</p>`;

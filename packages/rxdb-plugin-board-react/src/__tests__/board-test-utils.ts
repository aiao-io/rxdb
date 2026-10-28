import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { Board, BoardLabel, Column, Task, TaskLabel } from '@aiao/rxdb-plugin-board';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';
import { act, createEvent, fireEvent, screen } from '@testing-library/react';

/** 真实 PGlite 内存库 + 历史插件（可选搜索插件）。 */
export const connectBoardDb = async (prefix: string, withSearch = false): Promise<RxDB> => {
  const rxdb = new RxDB({
    dbName: `${prefix}-${Math.random().toString(36).slice(2)}`,
    entities: [Board, Column, Task, BoardLabel, TaskLabel],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None },
    multiInstance: false
  });
  rxdb.use(rxDBPluginHistory);
  if (withSearch) rxdb.use(rxDBPluginSearch);
  rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
  await rxdb.connect('pglite');
  return rxdb;
};

/**
 * 内存版 localStorage：Node 26 未给 `--localstorage-file` 时全局 `localStorage` 为 `undefined`，
 * 会盖住 happy-dom 的实现，用到存储的用例显式桩上这一份。
 */
export const memoryStorage = (): Storage => {
  const items = new Map<string, string>();
  return {
    get length() {
      return items.size;
    },
    clear: () => items.clear(),
    getItem: key => items.get(key) ?? null,
    key: index => [...items.keys()][index] ?? null,
    removeItem: key => void items.delete(key),
    setItem: (key, value) => void items.set(key, String(value))
  };
};

/** 可在外部决定结果的 Promise（迟到结果 / 进行中状态）。 */
export interface Deferred<T> {
  readonly promise: Promise<T>;
  resolve(value: T): void;
  reject(reason: unknown): void;
}

export const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
};

export const byTestId = (testId: string): HTMLElement => screen.getByTestId(testId);
export const allByTestId = (testId: string): HTMLElement[] => screen.queryAllByTestId(testId);
export const texts = (testId: string): string[] =>
  allByTestId(testId).map(element => element.textContent?.trim() ?? '');
export const inputValue = (testId: string): string => (byTestId(testId) as HTMLInputElement).value;
export const isDisabled = (element: HTMLElement): boolean => (element as HTMLButtonElement).disabled;

/** 输入并可选按一个键（受控输入走 change 事件）。 */
export const typeInto = (element: HTMLElement, value: string, key?: string, init: KeyboardEventInit = {}): void => {
  fireEvent.change(element, { target: { value } });
  if (key) fireEvent.keyDown(element, { key, ...init });
};

/** 某列（按标题）内的元素。 */
export const columnByTitle = (title: string): HTMLElement => {
  const column = allByTestId('column').find(
    element => element.querySelector('[data-testid="column-title"]')?.textContent?.trim() === title
  );
  if (!column) throw new Error(`找不到列：${title}`);
  return column;
};

/** 按标题找卡片。 */
export const cardByTitle = (title: string): HTMLElement => {
  const card = allByTestId('task-card').find(
    element => element.querySelector('[data-testid="task-title"]')?.textContent?.trim() === title
  );
  if (!card) throw new Error(`找不到卡片：${title}`);
  return card;
};

/** 按任务 id 找卡片（就地编辑中的卡片没有标题按钮）。 */
export const cardById = (taskId: string): HTMLElement => {
  const card = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
  if (!card) throw new Error(`找不到卡片：${taskId}`);
  return card;
};

export const within = (root: HTMLElement, testId: string): HTMLElement => {
  const element = root.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
  if (!element) throw new Error(`找不到 ${testId}`);
  return element;
};

export const withinAll = (root: HTMLElement, testId: string): HTMLElement[] => [
  ...root.querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`)
];

export const titlesIn = (column: HTMLElement): string[] =>
  withinAll(column, 'task-title').map(element => element.textContent?.trim() ?? '');

/** 布局桩：列 i 横向排开（200px 一列），卡片在列内纵向排开（60px 一张）。 */
export const rectOf = (element: HTMLElement): DOMRect => {
  const columns = allByTestId('column');
  const column = element.closest<HTMLElement>('[data-testid="column"]');
  const index = column ? columns.indexOf(column) : -1;
  if (element.matches('[data-column-id]')) return new DOMRect(index * 200, 0, 180, 300);
  if (element.matches('[data-column-header-id]')) return new DOMRect(index * 200, 0, 180, 30);
  if (column && element.matches('[data-task-id]')) {
    const cards = withinAll(column, 'task-card');
    return new DOMRect(index * 200, 40 + cards.indexOf(element) * 60, 180, 50);
  }
  return new DOMRect(300, 100, 32, 32);
};

/** 带坐标的拖拽事件（happy-dom 的 DragEvent 不接受 clientX / clientY 初始化）。 */
export const dragAt = (
  element: HTMLElement,
  type: 'dragOver' | 'drop',
  x: number,
  y: number,
  dataTransfer?: { getData(type: string): string }
): void => {
  const event = createEvent[type](element, dataTransfer ? { dataTransfer } : {});
  Object.defineProperty(event, 'clientX', { value: x });
  Object.defineProperty(event, 'clientY', { value: y });
  fireEvent(element, event);
};

/** 原生聚焦也走 act（焦点状态更新同步落地）。 */
export const focus = (element: HTMLElement): void => {
  act(() => element.focus());
};

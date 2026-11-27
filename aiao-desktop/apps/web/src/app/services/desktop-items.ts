import { I18N } from '@aiao/rxdb-i18n-angular';
import { ErrorHandler, Service, computed, inject, linkedSignal, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';

import { FinderClipboard } from '../apps/finder/finder-clipboard';
import { Preferences } from '../data/preferences';
import { DESKTOP, DiskPath, TRASH, VOLUME_NAME, finderPathOf } from '../disk/disk-path';
import { FsNode, visibleChildren } from '../disk/disk-tree';
import { FileOpener } from './file-opener';
import { FileSystem, describeDiskError } from './file-system';
import { Toast } from './toast';
import { WindowManager } from './window-manager';

export type DesktopCell = readonly [number, number];

/** 桌面图标：`cell` 是从右上角起算的 [列, 行] 网格坐标；`node` 是 ~/Desktop 里对应的条目。 */
export interface DesktopItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly cell: DesktopCell;
  readonly node: FsNode | null;
  readonly open: () => void;
}

/** 「Sort By / Clean Up By」的排序依据，也是 `desktop:sort` 偏好里的值。 */
export type DesktopSort = 'name' | 'kind' | 'date' | 'size';

/** 排序与叠放用的轻量条目视图：名字用磁盘原名，避免标签里的连字符变体参与比较。 */
export interface SortableItem {
  readonly id: string;
  readonly name: string;
  readonly node: FsNode | null;
}

/** 「Show View Options」的三组选项，`desktop:view-options` 偏好里的值。 */
export interface DesktopViewOptions {
  readonly iconSize: 'small' | 'medium' | 'large';
  readonly gridSpacing: 'compact' | 'default' | 'wide';
  readonly textSize: 'small' | 'medium' | 'large';
}

/** 图标大小、网格间距与文字大小换算出的桌面网格尺寸（像素）。 */
export interface DesktopGridMetrics {
  /** 网格列宽：相邻两列图标左边缘的距离。 */
  readonly w: number;
  /** 网格行高：相邻两行图标顶边缘的距离。 */
  readonly h: number;
  /** 图标块的宽（`.dicon` 元素的宽）。 */
  readonly tile: number;
  /** 图标画布边长。 */
  readonly art: number;
  /** 标签字号。 */
  readonly font: number;
  /** 标签行高。 */
  readonly line: number;
}

/** 桌面上的一叠（Use Stacks）：同「种类」的一组图标，`cell` 是叠本身占的格子。 */
export interface DesktopStack {
  readonly kind: string;
  readonly ids: readonly string[];
  readonly cell: DesktopCell;
}

const DRIVE_ID = 'hd';
/** 拖过的图标位置存在系统偏好里，刷新后图标还在原处。 */
const CELLS_KEY = 'desktop:cells';
/** Sort By / Use Stacks / Show View Options 的设置，存在系统偏好里。 */
const SORT_KEY = 'desktop:sort';
const STACKS_KEY = 'desktop:stacks';
const VIEW_KEY = 'desktop:view-options';
const SETTING_KEYS: readonly string[] = [SORT_KEY, STACKS_KEY, VIEW_KEY];
/** 桌面图标 id：Macintosh HD 是 `hd`，~/Desktop 里的条目是 `file:<名字>`。 */
export const desktopItemId = (name: string): string => `file:${name}`;
const itemId = desktopItemId;

const isCell = (value: unknown): value is DesktopCell =>
  Array.isArray(value) && value.length === 2 && value.every(part => Number.isInteger(part) && part >= 0);

const isCellMap = (value: unknown): value is Record<string, DesktopCell> =>
  typeof value === 'object' && value !== null && Object.values(value).every(isCell);

const SORTS: readonly DesktopSort[] = ['name', 'kind', 'date', 'size'];
const isSort = (value: unknown): value is DesktopSort =>
  typeof value === 'string' && SORTS.includes(value as DesktopSort);
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean';
const isViewOptions = (value: unknown): value is DesktopViewOptions => {
  if (typeof value !== 'object' || value === null) return false;
  const options = value as Partial<DesktopViewOptions>;
  return (
    (options.iconSize === 'small' || options.iconSize === 'medium' || options.iconSize === 'large') &&
    (options.gridSpacing === 'compact' || options.gridSpacing === 'default' || options.gridSpacing === 'wide') &&
    (options.textSize === 'small' || options.textSize === 'medium' || options.textSize === 'large')
  );
};

/** 内置桌面原来的排布；其余条目按列向下找第一个空格，一列放六个。 */
const INITIAL_CELLS: ReadonlyMap<string, DesktopCell> = new Map([
  [DRIVE_ID, [0, 0]],
  [itemId('Projects'), [0, 1]],
  [itemId('prasenx.txt'), [0, 2]],
  [itemId('Screenshot 2026-07-27 at 4.34.11 PM.png'), [0, 3]],
  [itemId('Interface Guidelines.pdf'), [1, 0]]
]);

function firstFreeCell(taken: readonly DesktopCell[]): DesktopCell {
  let col = 0;
  let row = 0;
  for (let guard = 0; taken.some(cell => cell[0] === col && cell[1] === row) && guard < 60; guard++) {
    row++;
    if (row > 5) {
      row = 0;
      col++;
    }
  }
  return [col, row];
}

/** 已有位置的图标保持不动，新出现的条目依次落到空格，消失的条目让出位置。 */
function layoutCells(ids: readonly string[], previous: ReadonlyMap<string, DesktopCell>): Map<string, DesktopCell> {
  const cells = new Map<string, DesktopCell>();
  for (const id of ids) {
    const cell = previous.get(id);
    if (cell) cells.set(id, cell);
  }
  for (const id of ids) if (!cells.has(id)) cells.set(id, firstFreeCell([...cells.values()]));
  return cells;
}

/** 区分大小写的码点升序（ASCII 顺序）：`'A' < 'a'`、`'PNG image' < 'Plain text'`。 */
const byText = (a: string, b: string): number =>
  a < b ? -1
  : a > b ? 1
  : 0;

const byName = (a: SortableItem, b: SortableItem): number => byText(a.name, b.name);

/** 「Sort By」的排序规则：Kind 按 Finder 种类，Date Modified 新在前，Size 大在前，同级按名字（码点升序）。 */
export function sortDesktopItems(items: readonly SortableItem[], criteria: DesktopSort): readonly SortableItem[] {
  const sorters: Readonly<Record<DesktopSort, (a: SortableItem, b: SortableItem) => number>> = {
    name: byName,
    kind: (a, b) => byText(a.node?.k ?? '', b.node?.k ?? '') || byName(a, b),
    date: (a, b) => (b.node?.date?.getTime() ?? 0) - (a.node?.date?.getTime() ?? 0) || byName(a, b),
    size: (a, b) => (b.node?.bytes ?? 0) - (a.node?.bytes ?? 0) || byName(a, b)
  };
  return [...items].sort(sorters[criteria]);
}

/** 按给定顺序把条目紧凑排进网格（一列六个，右上角起）：Sort By 与 Clean Up 共用。 */
export function layoutOrderedCells(ids: readonly string[]): Map<string, DesktopCell> {
  const cells = new Map<string, DesktopCell>();
  for (const id of ids) {
    const cell = firstFreeCell([...cells.values()]);
    cells.set(id, cell);
  }
  return cells;
}

/**
 * 把 `ids` 里每个条目的格子按 `delta` 平移，`ids[0]` 优先落位、其余按顺序避让；被占的格子顺着列往下找。
 * 只移动 `ids` 列出的条目，其他条目保持原位。
 */
export function shiftCells(
  cells: ReadonlyMap<string, DesktopCell>,
  ids: readonly string[],
  delta: DesktopCell
): Map<string, DesktopCell> {
  const moving = new Set(ids);
  const next = new Map<string, DesktopCell>();
  for (const [id, cell] of cells) if (!moving.has(id)) next.set(id, cell);
  const occupied = (cell: DesktopCell): boolean =>
    [...next.values()].some(other => other[0] === cell[0] && other[1] === cell[1]);
  for (const id of ids) {
    const origin = cells.get(id) ?? [0, 0];
    let col = Math.max(0, origin[0] + delta[0]);
    let row = Math.max(0, origin[1] + delta[1]);
    for (let guard = 0; occupied([col, row]) && guard < 60; guard++) {
      row++;
      if (row > 5) {
        row = 0;
        col++;
      }
    }
    next.set(id, [col, row]);
  }
  return next;
}

/** 改名后把旧 id 的格子迁给新 id；旧 id 已经不在（磁盘树先刷新）时保留新 id 现有的格子。 */
export function migrateCell(
  cells: ReadonlyMap<string, DesktopCell>,
  from: string,
  to: string
): Map<string, DesktopCell> {
  const next = new Map(cells);
  const cell = next.get(from) ?? next.get(to) ?? [0, 0];
  next.set(to, cell);
  next.delete(from);
  return next;
}

/**
 * 把条目按 Finder 种类分组叠放；叠按种类名的码点升序排列，各自落到第一个空格。
 * 返回的 `cell` 只给叠用，成员自己的格子不动（关掉叠放后原位恢复）。
 */
export function stackItems(items: readonly SortableItem[]): readonly DesktopStack[] {
  const groups = new Map<string, SortableItem[]>();
  for (const item of items) {
    const kind = item.node?.kind === 'folder' ? 'Folder' : (item.node?.k ?? 'File');
    const group = groups.get(kind);
    if (group) group.push(item);
    else groups.set(kind, [item]);
  }
  const taken: DesktopCell[] = [];
  return [...groups.entries()]
    .sort(([a], [b]) => byText(a, b))
    .map(([kind, members]) => {
      const cell = firstFreeCell(taken);
      taken.push(cell);
      return { kind, ids: members.map(member => member.id), cell };
    });
}

/** 按网格顺序（右上角起、先列后行）取 `from` 到 `to` 的连续区间；任一端不在就退回另一端。 */
export function rangeSelectIds(
  items: readonly { readonly id: string; readonly cell: DesktopCell }[],
  from: string,
  to: string
): readonly string[] {
  const ordered = [...items].sort((a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1]);
  const fromIndex = ordered.findIndex(item => item.id === from);
  const toIndex = ordered.findIndex(item => item.id === to);
  if (fromIndex < 0) return toIndex < 0 ? [] : [to];
  if (toIndex < 0) return [from];
  const start = Math.min(fromIndex, toIndex);
  const end = Math.max(fromIndex, toIndex);
  return ordered.slice(start, end + 1).map(item => item.id);
}

const ART_BY_SIZE: Readonly<Record<DesktopViewOptions['iconSize'], number>> = { small: 48, medium: 60, large: 72 };
const FONT_BY_SIZE: Readonly<Record<DesktopViewOptions['textSize'], number>> = { small: 10, medium: 12, large: 14 };
const LINE_BY_SIZE: Readonly<Record<DesktopViewOptions['textSize'], number>> = { small: 12, medium: 14, large: 16 };
const PAD_BY_SPACING: Readonly<Record<DesktopViewOptions['gridSpacing'], number>> = {
  compact: 6,
  default: 10,
  wide: 16
};

/** 视图选项换算成网格尺寸；默认（medium/default/medium）与旧硬编码网格一致：92×98。 */
export function gridMetrics(options: DesktopViewOptions): DesktopGridMetrics {
  const art = ART_BY_SIZE[options.iconSize];
  const font = FONT_BY_SIZE[options.textSize];
  const line = LINE_BY_SIZE[options.textSize];
  const tile = art + 22;
  return { w: tile + PAD_BY_SPACING[options.gridSpacing], h: art + line * 2 + 10, tile, art, font, line };
}

/** 标签里的连字符换成不换行连字符，长文件名只在空格处折行，和 Finder 的桌面标签一样。 */
const label = (name: string): string => name.replace(/-/g, '‑');

/** 桌面上的图标：Macintosh HD 加上 ~/Desktop 里的每个条目；拖动、框选和右键菜单在桌面组件里。 */
@Service({ autoProvided: false })
export class DesktopItems {
  private readonly wm = inject(WindowManager);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly toast = inject(Toast);
  private readonly preferences = inject(Preferences);
  private readonly clipboard = inject(FinderClipboard);
  private readonly errors = inject(ErrorHandler);
  private readonly i18nRuntime = inject(I18N, { optional: true }) ?? undefined;
  private readonly entries = computed(() => visibleChildren(this.fs.nodeAt(DESKTOP)));
  private readonly trashIds = computed(() => new Set(this.fs.nodeAt(TRASH)?.children?.map(entry => entry.id)));
  private readonly cells = linkedSignal<readonly FsNode[], ReadonlyMap<string, DesktopCell>>({
    source: this.entries,
    computation: (entries, previous) =>
      layoutCells([DRIVE_ID, ...entries.map(entry => itemId(entry.name))], previous?.value ?? INITIAL_CELLS)
  });

  readonly items = computed<readonly DesktopItem[]>(() => {
    const cells = this.cells();
    const cellOf = (id: string): DesktopCell => cells.get(id) ?? [0, 0];
    return [
      {
        id: DRIVE_ID,
        name: VOLUME_NAME,
        icon: 'f-hd',
        cell: cellOf(DRIVE_ID),
        node: this.fs.root(),
        open: () => this.wm.open('finder', { path: [VOLUME_NAME] })
      },
      ...this.entries().map((node): DesktopItem => ({
        id: itemId(node.name),
        name: label(node.name),
        icon: node.icon,
        cell: cellOf(itemId(node.name)),
        node,
        open: () => this.openNode(node)
      }))
    ];
  });

  /** 新建的文件夹被选中，由桌面组件读取后高亮。 */
  readonly created = signal<string | null>(null);
  readonly canUndoTrash = this.fs.canUndoTrash;

  /** Sort By 的当前依据；`null` 是 None（手动排布）。 */
  readonly sortCriteria = signal<DesktopSort | null>(null);
  /** Show View Options 的当前值；默认与旧硬编码网格一致。 */
  readonly viewOptions = signal<DesktopViewOptions>({ iconSize: 'medium', gridSpacing: 'default', textSize: 'medium' });
  /** Use Stacks 开关。 */
  readonly stacksEnabled = signal(false);

  /** Use Stacks 打开时的叠：按种类分组，`cell` 是叠在网格里的位置；关掉时是空数组。 */
  readonly stacks = computed<readonly DesktopStack[]>(() =>
    this.stacksEnabled() ?
      stackItems(
        this.items()
          .filter(item => item.id !== DRIVE_ID)
          .map(item => ({ id: item.id, name: item.node?.name ?? item.name, node: item.node }))
      )
    : []
  );

  constructor() {
    this.preferences.ready.then(
      () => this.restore(),
      () => undefined
    );
    /* 图标位置与排序/叠放/视图设置跨标签页共享（ADESK-US-105）：别的标签页改了，这边跟着挪。 */
    this.preferences.external$.pipe(takeUntilDestroyed()).subscribe(keys => {
      if (keys.includes(CELLS_KEY)) this.restoreCells();
      if (keys.some(key => SETTING_KEYS.includes(key))) this.restoreSettings();
    });
  }

  /** 在 ~/Desktop 里新建文件夹；成功后选中它。 */
  newFolder(): void {
    this.fs.newFolder(DESKTOP).then(
      name => this.created.set(itemId(name)),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  move(id: string, cell: DesktopCell): void {
    this.cells.update(cells => new Map(cells).set(id, cell));
    this.persistCells(this.cells());
  }

  /** 多选拖到空白：按与抓取图标的相对偏移整组移动（`ids[0]` 是抓取的图标），一次写回偏好。 */
  moveMany(ids: readonly string[], delta: DesktopCell): void {
    if (!ids.length) return;
    const next = shiftCells(this.cells(), ids, delta);
    this.cells.set(next);
    this.persistCells(next);
  }

  /** Sort By：按依据排序后紧凑重排并记住依据；`null`（None）只记住不重排。 */
  sortBy(criteria: DesktopSort | null): void {
    this.sortCriteria.set(criteria);
    void this.preferences.set(SORT_KEY, criteria).catch((error: unknown) => this.errors.handleError(error));
    if (criteria) this.applyOrder(this.sortedIds(criteria));
  }

  /** Clean Up：全部图标按第一个空格紧凑重排；带依据时先排序（Clean Up By）。 */
  cleanUp(criteria?: DesktopSort): void {
    this.applyOrder(criteria ? this.sortedIds(criteria) : this.currentOrder());
  }

  /** Use Stacks 开关（右键菜单与 ⌃⌘0 共用）。 */
  toggleStacks(): void {
    const next = !this.stacksEnabled();
    this.stacksEnabled.set(next);
    void this.preferences.set(STACKS_KEY, next).catch((error: unknown) => this.errors.handleError(error));
  }

  /** Show View Options：更新一项并写回偏好，网格与图标尺寸跟着变。 */
  setViewOption<K extends keyof DesktopViewOptions>(key: K, value: DesktopViewOptions[K]): void {
    const next = { ...this.viewOptions(), [key]: value };
    this.viewOptions.set(next);
    void this.preferences.set(VIEW_KEY, next).catch((error: unknown) => this.errors.handleError(error));
  }

  /** 桌面图标改名：成功返回新路径，并把旧 id 的格子迁给新名字（图标留在原位）。 */
  async rename(item: DesktopItem, name: string): Promise<DiskPath> {
    if (!item.node?.path)
      throw new Error(this.t('error.desktop.cantRename', `“${item.name}” can’t be renamed.`, { name: item.name }));
    const path = await this.fs.rename(item.node.path, name);
    const nextId = itemId(path.at(-1) ?? name);
    if (nextId !== item.id) {
      const next = migrateCell(this.cells(), item.id, nextId);
      this.cells.set(next);
      this.persistCells(next);
    }
    return path;
  }

  async transferToDirectory(ids: readonly string[], dir: DiskPath, copy: boolean): Promise<readonly DiskPath[]> {
    const selected = new Set(ids);
    const paths = this.items()
      .filter(item => selected.has(item.id) && item.node?.path?.length)
      .map(item => item.node!.path!);
    return this.transferPaths(paths, dir, copy);
  }

  paste(): void {
    const snapshot = this.clipboard.snapshot();
    if (!snapshot) {
      this.toast.show(this.t('shell.toast.nothingToPaste', 'Nothing to paste.'));
      return;
    }
    void this.transferPaths(
      snapshot.entries.map(entry => entry.path),
      DESKTOP,
      snapshot.mode === 'copy'
    ).then(
      () => {
        if (snapshot.mode === 'cut') this.clipboard.clear();
      },
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  /** 一次把选中的图标移进废纸篓；Macintosh HD 不能移走。 */
  async remove(ids: readonly string[]): Promise<boolean> {
    const selected = new Set(ids);
    const paths = this.items().flatMap(item =>
      selected.has(item.id) && item.node?.path?.length ? [item.node.path] : []
    );
    if (!paths.length) {
      this.toast.show(this.t('shell.toast.hdCantMoveToTrash', '“Macintosh HD” can’t be moved to the Trash.'));
      return false;
    }
    try {
      await this.fs.moveToTrashBatch(paths);
      return true;
    } catch (error) {
      this.toast.show(describeDiskError(error));
      return false;
    }
  }

  isTrashed(item: DesktopItem): boolean {
    const id = item.node?.id;
    return id !== undefined && this.trashIds().has(id);
  }

  undoTrash(): void {
    void this.fs.undoTrash().catch((error: unknown) => this.toast.show(describeDiskError(error)));
  }

  /** 启动（或别的标签页改动）后恢复位置与排序/叠放/视图设置。 */
  private restore(): void {
    this.restoreCells();
    this.restoreSettings();
  }

  /** 用偏好里存着的位置覆盖当前的位置（启动时，以及别的标签页拖动图标之后）。 */
  private restoreCells(): void {
    const saved = this.preferences.get(CELLS_KEY, isCellMap);
    if (saved) this.cells.update(cells => new Map([...cells, ...Object.entries(saved)]));
  }

  /** 恢复 Sort By / Use Stacks / Show View Options 的设置。 */
  private restoreSettings(): void {
    const sort = this.preferences.get(SORT_KEY, isSort);
    if (sort) this.sortCriteria.set(sort);
    const stacks = this.preferences.get(STACKS_KEY, isBoolean);
    if (stacks !== undefined) this.stacksEnabled.set(stacks);
    const view = this.preferences.get(VIEW_KEY, isViewOptions);
    if (view) this.viewOptions.set(view);
  }

  /** 位置写回系统偏好；失败交给 ErrorHandler 报告，不吞掉。 */
  private persistCells(cells: ReadonlyMap<string, DesktopCell>): void {
    this.preferences
      .set(CELLS_KEY, Object.fromEntries(cells))
      .catch((error: unknown) => this.errors.handleError(error));
  }

  /** 排序用的条目顺序：Macintosh HD 钉在最前，其余按依据排。 */
  private sortedIds(criteria: DesktopSort): readonly string[] {
    const entries = this.items()
      .filter(item => item.id !== DRIVE_ID)
      .map(item => ({ id: item.id, name: item.node?.name ?? item.name, node: item.node }));
    return [DRIVE_ID, ...sortDesktopItems(entries, criteria).map(item => item.id)];
  }

  /** Clean Up 保持当前视觉顺序：按格子先列后行。 */
  private currentOrder(): readonly string[] {
    const entries = this.items()
      .filter(item => item.id !== DRIVE_ID)
      .slice()
      .sort((a, b) => a.cell[0] - b.cell[0] || a.cell[1] - b.cell[1]);
    return [DRIVE_ID, ...entries.map(item => item.id)];
  }

  /** 按给定顺序紧凑重排并写回偏好。 */
  private applyOrder(ids: readonly string[]): void {
    const next = layoutOrderedCells(ids);
    this.cells.set(next);
    this.persistCells(next);
  }

  private openNode(node: FsNode): void {
    if (node.kind === 'folder' && node.path) this.wm.open('finder', { force: true, path: finderPathOf(node.path) });
    else this.opener.open(node);
  }

  private async transferPaths(paths: readonly DiskPath[], dir: DiskPath, copy: boolean): Promise<readonly DiskPath[]> {
    const targets: DiskPath[] = [];
    for (const path of paths) targets.push(await (copy ? this.fs.copyTo(path, dir) : this.fs.moveTo(path, dir)));
    return targets;
  }

  /** 桌面提示与错误消息的翻译：未注入 i18n 运行时（单测）时回退英文原文。 */
  private t(key: string, english: string, params: Record<string, unknown> = {}): string {
    return this.i18nRuntime ? this.i18nRuntime.t(key, params) : english;
  }
}

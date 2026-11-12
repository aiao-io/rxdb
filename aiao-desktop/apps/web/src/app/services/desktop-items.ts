import { Service, computed, inject, linkedSignal, signal } from '@angular/core';

import { DESKTOP, VOLUME_NAME, finderPathOf } from '../disk/disk-path';
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

const DRIVE_ID = 'hd';
const itemId = (name: string): string => `file:${name}`;

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

/** 标签里的连字符换成不换行连字符，长文件名只在空格处折行，和 Finder 的桌面标签一样。 */
const label = (name: string): string => name.replace(/-/g, '‑');

/** 桌面上的图标：Macintosh HD 加上 ~/Desktop 里的每个条目；拖动、框选和右键菜单在桌面组件里。 */
@Service({ autoProvided: false })
export class DesktopItems {
  private readonly wm = inject(WindowManager);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly toast = inject(Toast);
  private readonly entries = computed(() => visibleChildren(this.fs.nodeAt(DESKTOP)));
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
      ...this.entries().map(
        (node): DesktopItem => ({
          id: itemId(node.name),
          name: label(node.name),
          icon: node.icon,
          cell: cellOf(itemId(node.name)),
          node,
          open: () => this.openNode(node)
        })
      )
    ];
  });

  /** 新建的文件夹被选中，由桌面组件读取后高亮。 */
  readonly created = signal<string | null>(null);

  /** 在 ~/Desktop 里新建文件夹；成功后选中它。 */
  newFolder(): void {
    this.fs.newFolder(DESKTOP).then(
      name => this.created.set(itemId(name)),
      (error: unknown) => this.toast.show(describeDiskError(error))
    );
  }

  move(id: string, cell: DesktopCell): void {
    this.cells.update(cells => new Map(cells).set(id, cell));
  }

  /** 把图标对应的条目移进废纸篓；Macintosh HD 不能移走。失败时提示原因并返回 `false`。 */
  async remove(id: string): Promise<boolean> {
    const node = this.items().find(item => item.id === id)?.node;
    if (id === DRIVE_ID || !node?.path) {
      this.toast.show('“Macintosh HD” can’t be moved to the Trash.');
      return false;
    }
    try {
      await this.fs.moveToTrash(node.path);
      return true;
    } catch (error) {
      this.toast.show(describeDiskError(error));
      return false;
    }
  }

  private openNode(node: FsNode): void {
    if (node.kind === 'folder' && node.path) this.wm.open('finder', { path: finderPathOf(node.path) });
    else this.opener.open(node);
  }
}

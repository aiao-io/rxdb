import { Service, inject, signal } from '@angular/core';

import { DockState } from './dock-state';
import { WindowManager } from './window-manager';

/** 桌面图标：`cell` 是从右上角起算的 [列, 行] 网格坐标。 */
export interface DesktopItem {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
  readonly cell: readonly [number, number];
  readonly open: () => void;
}

/** 新图标落到第一个空格，按列向下排，一列放六个。 */
const firstFreeCell = (items: readonly DesktopItem[]): [number, number] => {
  let col = 0;
  let row = 0;
  for (let guard = 0; items.some(item => item.cell[0] === col && item.cell[1] === row) && guard < 40; guard++) {
    row++;
    if (row > 5) {
      row = 0;
      col++;
    }
  }
  return [col, row];
};

/** 桌面上的图标列表；拖动、框选和右键菜单在桌面组件里。 */
@Service({ autoProvided: false })
export class DesktopItems {
  private readonly wm = inject(WindowManager);
  private readonly dock = inject(DockState);

  readonly items = signal<readonly DesktopItem[]>([
    {
      id: 'hd',
      name: 'Macintosh HD',
      icon: 'f-hd',
      cell: [0, 0],
      open: () => this.wm.open('finder', { path: ['Macintosh HD'] })
    },
    {
      id: 'projects',
      name: 'Projects',
      icon: 'f-folder',
      cell: [0, 1],
      open: () => this.wm.open('finder', { path: ['Prasenjit', 'Projects'] })
    },
    {
      id: 'notes',
      name: 'prasenx.txt',
      icon: 'f-txt',
      cell: [0, 2],
      open: () => this.wm.open('textedit', { file: 'prasenx.txt' })
    },
    {
      id: 'shot',
      name: 'Screenshot 2026‑07‑27 at 4.34.11 PM.png',
      icon: 'f-img',
      cell: [0, 3],
      open: () => this.wm.open('preview', { file: 'Screenshot' })
    },
    {
      id: 'guide',
      name: 'Interface Guidelines.pdf',
      icon: 'f-pdf',
      cell: [1, 0],
      open: () => this.wm.open('preview', { file: 'Interface Guidelines.pdf' })
    }
  ]);

  /** 新建的文件夹被选中，由桌面组件读取后高亮。 */
  readonly created = signal<string | null>(null);

  newFolder(): void {
    const items = this.items();
    const count = items.filter(item => item.name.startsWith('untitled folder')).length;
    const item: DesktopItem = {
      id: `nf${Date.now()}`,
      name: `untitled folder${count ? ` ${count + 1}` : ''}`,
      icon: 'f-folder',
      cell: firstFreeCell(items),
      open: () => this.wm.open('finder', { path: ['Prasenjit', 'Desktop'] })
    };
    this.items.set([...items, item]);
    this.created.set(item.id);
  }

  move(id: string, cell: readonly [number, number]): void {
    this.items.update(items => items.map(item => (item.id === id ? { ...item, cell } : item)));
  }

  remove(id: string): void {
    this.items.update(items => items.filter(item => item.id !== id));
    this.dock.trashFull.set(true);
  }
}

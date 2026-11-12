import { Service, signal } from '@angular/core';

/** 虚拟文件系统的节点。 */
export interface FsNode {
  readonly name: string;
  readonly kind: 'folder' | 'file';
  readonly icon: string;
  readonly k: string;
  readonly date?: Date;
  readonly size?: string;
  readonly children?: FsNode[];
}

const dt = (month: number, day: number, hour = 10, minute = 24): Date => new Date(2026, month - 1, day, hour, minute);

/** 文件夹的日期取最新的子项，和真实 Finder 的显示一致。 */
export const folder = (name: string, children: FsNode[], icon = 'f-folder'): FsNode => {
  const dates = children.map(child => child.date?.getTime()).filter((time): time is number => time !== undefined);
  return {
    name,
    kind: 'folder',
    icon,
    children,
    k: 'Folder',
    date: dates.length ? new Date(Math.max(...dates)) : dt(7, 12, 9, 41)
  };
};

export const file = (name: string, icon: string, size: string, k: string, date: Date): FsNode => ({
  name,
  kind: 'file',
  icon,
  size,
  k,
  date
});

const APP_FILES = [
  'Safari',
  'Mail',
  'Messages',
  'Maps',
  'Photos',
  'Notes',
  'Calendar',
  'Music',
  'Terminal',
  'Calculator',
  'System Settings',
  'Preview',
  'Reminders',
  'FaceTime',
  'App Store',
  'Podcasts',
  'TV',
  'Weather',
  'Stocks',
  'Books',
  'Contacts',
  'Freeform',
  'Clock'
].map(name => file(`${name}.app`, 'f-app', `${92 + name.length * 7}MB`, 'Application', dt(6, 12)));

const buildRoot = (): FsNode =>
  folder(
    'Macintosh HD',
    [
      folder('Applications', APP_FILES),
      folder('Library', [
        folder('Fonts', [file('SFPro.ttf', 'f-code', '4.2 MB', 'TrueType font', dt(3, 2))]),
        folder('Caches', []),
        folder('Preferences', [])
      ]),
      folder('System', [folder('Library', []), folder('Volumes', [])]),
      folder('Users', [
        folder('prasenjit', [
          folder('Desktop', [
            folder('Projects', [
              folder('desktop-web', [
                file('index.html', 'f-code', '412 KB', 'HTML document', dt(7, 27, 16, 34)),
                file('README.md', 'f-txt', '3 KB', 'Markdown', dt(7, 27, 15, 10)),
                file('screenshot.png', 'f-img', '2.1 MB', 'PNG image', dt(7, 27, 16, 40))
              ]),
              folder('cleantype', [
                file('main.swift', 'f-code', '18 KB', 'Swift source', dt(7, 19)),
                file('Package.swift', 'f-code', '2 KB', 'Swift source', dt(7, 19))
              ]),
              folder('aurora-synth', [
                file('synth.ts', 'f-code', '44 KB', 'TypeScript', dt(7, 22)),
                file('index.html', 'f-code', '9 KB', 'HTML document', dt(7, 22))
              ]),
              file('todo.md', 'f-txt', '1 KB', 'Markdown', dt(7, 26))
            ]),
            file('prasenx.txt', 'f-txt', '1 KB', 'Plain text', dt(7, 27, 14, 2)),
            file('Screenshot 2026-07-27 at 4.34.11 PM.png', 'f-img', '3.8 MB', 'PNG image', dt(7, 27, 16, 34)),
            file('Interface Guidelines.pdf', 'f-pdf', '188 KB', 'PDF document', dt(7, 4))
          ]),
          folder('Documents', [
            folder('Specs', [
              file('materials.pdf', 'f-pdf', '96 KB', 'PDF document', dt(7, 1)),
              file('motion-audit.pdf', 'f-pdf', '94 KB', 'PDF document', dt(7, 20))
            ]),
            folder('Writing', [
              file('on-restraint.md', 'f-txt', '11 KB', 'Markdown', dt(7, 24)),
              file('shadow-notes.md', 'f-txt', '7 KB', 'Markdown', dt(7, 26))
            ]),
            file('design-review.key', 'f-app', '24 MB', 'Keynote', dt(7, 23)),
            file('roadmap-2026.numbers', 'f-app', '1.8 MB', 'Numbers', dt(5, 9))
          ]),
          folder('Downloads', [
            file('Xcode_26.xip', 'f-zip', '7.94 GB', 'Archive', dt(7, 15)),
            file('sf-symbols-7.dmg', 'f-app', '148 MB', 'Disk image', dt(7, 11)),
            file('wallpaper-tahoe-6k.heic', 'f-img', '32 MB', 'HEIC image', dt(7, 9)),
            file('render-final.mp4', 'f-movie', '412 MB', 'MPEG-4 movie', dt(7, 13))
          ]),
          folder('Movies', [
            file('interaction-study.mp4', 'f-movie', '208 MB', 'MPEG-4 movie', dt(7, 13)),
            file('capture-timelapse.mov', 'f-movie', '1.2 GB', 'QuickTime movie', dt(7, 13))
          ]),
          folder('Music', [
            file('aurora-synth-demo.wav', 'f-music', '58 MB', 'WAV audio', dt(7, 22)),
            file('lofi-loop.mp3', 'f-music', '6 MB', 'MP3 audio', dt(6, 30))
          ]),
          folder('Pictures', [
            file('lake-braies.jpg', 'f-img', '5.2 MB', 'JPEG image', dt(6, 18)),
            file('dolomites-dawn.jpg', 'f-img', '4.4 MB', 'JPEG image', dt(6, 18)),
            file('night-sky.jpg', 'f-img', '3.1 MB', 'JPEG image', dt(5, 2))
          ]),
          folder('Public', [folder('Drop Box', [])])
        ]),
        folder('Shared', [])
      ])
    ],
    'f-hd'
  );

/** Finder 侧栏与「前往」菜单的快捷位置；`null` 表示虚拟视图。 */
export const PLACES: Readonly<Record<string, readonly string[] | null>> = {
  AirDrop: null,
  Recents: null,
  Desktop: ['Macintosh HD', 'Users', 'prasenjit', 'Desktop'],
  Documents: ['Macintosh HD', 'Users', 'prasenjit', 'Documents'],
  Downloads: ['Macintosh HD', 'Users', 'prasenjit', 'Downloads'],
  Movies: ['Macintosh HD', 'Users', 'prasenjit', 'Movies'],
  Music: ['Macintosh HD', 'Users', 'prasenjit', 'Music'],
  Pictures: ['Macintosh HD', 'Users', 'prasenjit', 'Pictures'],
  Applications: ['Macintosh HD', 'Applications'],
  prasenjit: ['Macintosh HD', 'Users', 'prasenjit'],
  'Macintosh HD': ['Macintosh HD'],
  Trash: ['Trash']
};

/** 用户主目录，桌面启动时 Finder 默认打开这里。 */
export const HOME_PATH: readonly string[] = ['Macintosh HD', 'Users', 'prasenjit'];

const RECENT_PATHS: readonly (readonly string[])[] = [
  ['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Projects', 'desktop-web', 'index.html'],
  ['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'prasenx.txt'],
  ['Macintosh HD', 'Users', 'prasenjit', 'Documents', 'Writing', 'on-restraint.md'],
  ['Macintosh HD', 'Users', 'prasenjit', 'Downloads', 'render-final.mp4'],
  ['Macintosh HD', 'Users', 'prasenjit', 'Desktop', 'Interface Guidelines.pdf']
];

/** 内存里的虚拟磁盘。增删节点后递增 `version`，打开着的 Finder 窗口据此刷新。 */
@Service({ autoProvided: false })
export class FileSystem {
  readonly root = buildRoot();
  readonly trash = folder('Trash', [file('old-draft.md', 'f-txt', '2 KB', 'Markdown', dt(7, 12))], 'app-trash');
  readonly version = signal(0);

  get(path: readonly string[]): FsNode | null {
    if (path[0] === 'Trash') return this.trash;
    let node: FsNode = this.root;
    for (const name of path.slice(1)) {
      const next = node.children?.find(child => child.name === name);
      if (!next) return null;
      node = next;
    }
    return node;
  }

  recents(): FsNode[] {
    return RECENT_PATHS.map(path => this.get(path)).filter((node): node is FsNode => node !== null);
  }

  /** 递归查找名称包含关键字（小写）的节点。 */
  deepSearch(node: FsNode | null, query: string, out: FsNode[] = []): FsNode[] {
    for (const child of node?.children ?? []) {
      if (child.name.toLowerCase().includes(query)) out.push(child);
      this.deepSearch(child, query, out);
    }
    return out;
  }

  /** 从根开始找到某个节点的绝对路径。 */
  findPath(
    target: FsNode,
    node: FsNode = this.root,
    path: readonly string[] = ['Macintosh HD']
  ): readonly string[] | null {
    if (node === target) return path;
    for (const child of node.children ?? []) {
      const found = this.findPath(target, child, [...path, child.name]);
      if (found) return found;
    }
    return null;
  }

  /** 在目录里新建「untitled folder」，重名时追加序号；返回新名称。 */
  newFolder(path: readonly string[]): string | null {
    const children = this.get(path)?.children;
    if (!children) return null;
    let name = 'untitled folder';
    for (let i = 2; children.some(child => child.name === name); i++) name = `untitled folder ${i}`;
    children.push(folder(name, []));
    this.touch();
    return name;
  }

  /** 把目录里的一项移进废纸篓；成功返回 `true`。 */
  moveToTrash(path: readonly string[], name: string): boolean {
    const children = this.get(path)?.children;
    const index = children?.findIndex(child => child.name === name) ?? -1;
    if (!children || index < 0) return false;
    this.trash.children?.push(...children.splice(index, 1));
    this.touch();
    return true;
  }

  private touch(): void {
    this.version.update(value => value + 1);
  }
}

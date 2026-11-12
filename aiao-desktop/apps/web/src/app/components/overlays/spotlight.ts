import { Component, ElementRef, afterNextRender, afterRenderEffect, inject, signal, viewChild } from '@angular/core';

import { NOTE_SEED } from '../../apps/notes/notes-data';
import { SafariBrowsers } from '../../apps/safari/safari-browsers';
import { AppLauncher } from '../../services/app-launcher';
import { DESKTOP_APPS, LAUNCH_ORDER } from '../../services/desktop-apps';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, FsNode, HOME_PATH, describeDiskError } from '../../services/file-system';
import { Overlays } from '../../services/overlays';
import { Session } from '../../services/session';
import { ThemeService } from '../../services/theme';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';

interface SpotlightHit {
  readonly name: string;
  readonly kind: string;
  readonly icon: string;
  readonly run: () => void;
}

interface SpotlightGroup {
  readonly title: string;
  readonly hits: readonly { readonly hit: SpotlightHit; readonly index: number }[];
}

/** 聚焦搜索：应用、动作、磁盘文件、笔记与网页建议。 */
@Component({
  selector: 'app-spotlight',
  imports: [Icon],
  host: { id: 'spot', class: 'nosel', '[class.out]': "overlays.spotlight() === 'closing'" },
  template: `
    <div class="scrim" (pointerdown)="overlays.closeSpotlight()"></div>
    <div class="box">
      <div class="qrow">
        <svg appIcon="g-spot"></svg>
        <input
          #query
          (input)="search(query.value)"
          (keydown)="key($event)"
          autocomplete="off"
          data-sq
          placeholder="Spotlight Search"
          spellcheck="false"
        />
      </div>
      <div class="res scroll" #results data-sres>
        @for (group of groups(); track group.title) {
          <div class="cat">{{ group.title }}</div>
          @for (row of group.hits; track row.index) {
            <div
              class="r"
              [attr.data-i]="row.index"
              [class.on]="row.index === selected()"
              (click)="fire(row.index)"
              (keydown.enter)="fire(row.index)"
              (mousemove)="selected.set(row.index)"
              tabindex="-1"
            >
              <span class="art"><svg [appIcon]="row.hit.icon"></svg></span><span class="nm">{{ row.hit.name }}</span
              ><span class="kind">{{ row.hit.kind }}</span>
            </div>
          }
        }
      </div>
    </div>
  `
})
export class Spotlight {
  private readonly apps = inject(DESKTOP_APPS);
  private readonly launcher = inject(AppLauncher);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly wm = inject(WindowManager);
  private readonly theme = inject(ThemeService);
  private readonly toast = inject(Toast);
  private readonly session = inject(Session);
  private readonly safari = inject(SafariBrowsers);
  private readonly queryInput = viewChild.required<ElementRef<HTMLInputElement>>('query');
  private readonly resultsBox = viewChild.required<ElementRef<HTMLElement>>('results');
  private hits: SpotlightHit[] = [];
  private readonly actions: readonly SpotlightHit[] = [
    { name: 'Toggle Dark Mode', kind: 'Action', icon: 'g-moon', run: () => this.theme.toggle() },
    { name: 'Open Launchpad', kind: 'Action', icon: 'app-launchpad', run: () => this.overlays.openLaunchpad() },
    { name: 'Notification Centre', kind: 'Action', icon: 'g-cc', run: () => this.overlays.openNotifications() },
    {
      name: 'Empty Trash',
      kind: 'Action',
      icon: 'app-trash',
      run: () =>
        this.fs.emptyTrash().then(
          () => this.toast.show('Trash emptied'),
          (error: unknown) => this.toast.show(describeDiskError(error))
        )
    },
    {
      name: 'Change Wallpaper',
      kind: 'Action',
      icon: 'g-globe',
      run: () => this.wm.open('settings', { section: 'wallpaper' })
    },
    { name: 'Sleep', kind: 'Action', icon: 'g-power', run: () => this.session.sleepNow() }
  ];

  protected readonly overlays = inject(Overlays);

  protected readonly groups = signal<readonly SpotlightGroup[]>([]);
  protected readonly selected = signal(0);

  constructor() {
    afterNextRender(() => setTimeout(() => this.queryInput().nativeElement.focus(), 30));
    afterRenderEffect(() => {
      this.selected();
      this.resultsBox().nativeElement.querySelector('.r.on')?.scrollIntoView({ block: 'nearest' });
    });
  }

  protected search(value: string): void {
    const q = value.trim();
    this.selected.set(0);
    this.hits = [];
    this.groups.set(q ? this.collect(q) : []);
  }

  protected key(event: KeyboardEvent): void {
    if (event.key === 'ArrowDown') this.move(event, 1);
    else if (event.key === 'ArrowUp') this.move(event, -1);
    else if (event.key === 'Enter') {
      event.preventDefault();
      this.fire(this.selected());
    } else if (event.key === 'Escape') {
      event.preventDefault();
      this.overlays.closeSpotlight();
    }
  }

  protected fire(index: number): void {
    const hit = this.hits[index];
    this.overlays.closeSpotlight();
    if (hit) setTimeout(hit.run, 60);
  }

  private move(event: KeyboardEvent, delta: number): void {
    event.preventDefault();
    if (this.hits.length) this.selected.set(clamp(this.selected() + delta, 0, this.hits.length - 1));
  }

  private collect(q: string): SpotlightGroup[] {
    const lq = q.toLowerCase();
    const apps = LAUNCH_ORDER.filter(id => this.apps[id].name.toLowerCase().includes(lq)).map((id): SpotlightHit => ({
      name: this.apps[id].name,
      kind: 'Application',
      icon: this.apps[id].icon,
      run: () => this.launcher.activate(id)
    }));
    const actions = this.actions.filter(action => action.name.toLowerCase().includes(lq));
    const found = this.fs
      .deepSearch(this.fs.root(), lq)
      .slice(0, 12)
      .map(node => this.fileHit(node));
    const notes = NOTE_SEED.filter(note => note.title.toLowerCase().includes(lq))
      .slice(0, 3)
      .map((note): SpotlightHit => ({
        name: note.title,
        kind: 'Note',
        icon: 'app-notes',
        run: () => this.wm.open('notes')
      }));
    const web: SpotlightHit = {
      name: `Search the web for “${q}”`,
      kind: 'Safari',
      icon: 'app-safari',
      run: () => this.safari.goLatest(`search:${q}`)
    };
    /* 同名时优先真正的应用，而不是磁盘上的 .app 文件。 */
    const seen = new Set(apps.map(app => `${app.name.toLowerCase()}.app`));
    const sections: [string, readonly SpotlightHit[]][] = [
      ['Top Hit', [apps[0] ?? actions[0] ?? found[0]].filter((hit): hit is SpotlightHit => hit !== undefined)],
      [
        'Applications',
        [...apps, ...found.filter(hit => hit.kind === 'Application' && !seen.has(hit.name.toLowerCase()))]
      ],
      ['Actions', actions],
      ['Documents', found.filter(hit => hit.kind !== 'Folder' && hit.kind !== 'Application')],
      ['Folders', found.filter(hit => hit.kind === 'Folder')],
      ['Notes', notes],
      ['Suggested Websites', [web]]
    ];
    return sections.flatMap(([title, items]) => this.group(title, items));
  }

  /** 已经出现在前面分组里的同名同类结果不再重复，每组最多六条。 */
  private group(title: string, items: readonly SpotlightHit[]): SpotlightGroup[] {
    const unique = items.filter(item => !this.hits.some(hit => hit.name === item.name && hit.kind === item.kind));
    if (!unique.length) return [];
    const hits = unique.slice(0, 6).map(hit => ({ hit, index: this.hits.push(hit) - 1 }));
    return [{ title, hits }];
  }

  private fileHit(node: FsNode): SpotlightHit {
    const kind =
      node.kind === 'folder' ? 'Folder'
      : node.name.endsWith('.app') ? 'Application'
      : node.k || 'Document';
    const run =
      node.kind === 'folder' ?
        () => this.wm.open('finder', { path: this.fs.findPath(node) ?? HOME_PATH })
      : () => this.opener.open(node);
    return { name: node.name, kind, icon: node.icon, run };
  }
}

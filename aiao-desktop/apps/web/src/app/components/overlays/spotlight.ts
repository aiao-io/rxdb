import {
  Component,
  ElementRef,
  Injector,
  Signal,
  afterNextRender,
  afterRenderEffect,
  computed,
  effect,
  inject,
  runInInjectionContext,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { ApplicationRegistry } from '../../services/application-registry';

import { Note } from '../../apps/notes/notes.entities';
import { SafariBrowsers } from '../../apps/safari/safari-browsers';
import { ALL_ROWS, liveQuery } from '../../data/live-query';
import { AppLauncher } from '../../services/app-launcher';
import { browserClipboard } from '../../services/browser-clipboard';
import {} from '../../services/desktop-apps';
import { FileOpener } from '../../services/file-opener';
import { FileSystem, FsNode, HOME_PATH } from '../../services/file-system';
import { Overlays } from '../../services/overlays';
import { Session } from '../../services/session';
import {
  UnitConversion,
  calculateExpression,
  convertQuery,
  folderTail,
  formatNumber
} from '../../services/spotlight-queries';
import { ThemeService } from '../../services/theme';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';

interface SpotlightHit {
  readonly name: string;
  readonly kind: string;
  readonly icon: string;
  /** 第二行小字：文件所在文件夹的路径尾段。 */
  readonly subtitle?: string;
  readonly run: () => void;
}

interface SpotlightGroup {
  readonly title: string;
  readonly hits: readonly { readonly hit: SpotlightHit; readonly index: number }[];
}

/**
 * 聚焦搜索：应用、动作、磁盘文件、笔记与网页建议，外加算式求值与单位换算。
 * 无障碍（ADESK-US-108）：模态 `dialog`；输入框是 `combobox`，焦点始终留在输入框里，结果是 `listbox` 里的 `option`
 * （按分类分 `group`），方向键移动的「当前项」由 `aria-activedescendant` 指出，Enter 打开（算式/换算命中是复制结果），Esc 关闭。
 * 结果行的 `tabindex="-1"` 只是让鼠标点击能聚焦它：Tab 停靠点只有输入框。
 */
@Component({
  selector: 'app-spotlight',
  imports: [Icon],
  host: {
    id: 'spot',
    class: 'nosel',
    role: 'dialog',
    'aria-label': 'Spotlight',
    'aria-modal': 'true',
    '[class.out]': "overlays.spotlight() === 'closing'"
  },
  template: `
    <div class="scrim" (pointerdown)="overlays.closeSpotlight()" aria-hidden="true"></div>
    <div class="box">
      <div class="qrow">
        <svg appIcon="g-spot"></svg>
        <input
          #query
          [attr.aria-activedescendant]="activeId()"
          [attr.aria-expanded]="hasResults()"
          (input)="search(query.value)"
          (keydown)="key($event)"
          aria-autocomplete="list"
          aria-controls="spot-results"
          aria-label="Spotlight Search"
          autocomplete="off"
          data-sq
          placeholder="Spotlight Search"
          role="combobox"
          spellcheck="false"
        />
      </div>
      <div class="res scroll" id="spot-results" #results aria-label="Results" data-sres role="listbox">
        @for (group of groups(); track group.title) {
          <div [attr.aria-label]="group.title" role="group">
            <div class="cat" aria-hidden="true">{{ group.title }}</div>
            @for (row of group.hits; track row.index) {
              <div
                class="r"
                [attr.aria-label]="
                  row.hit.subtitle ?
                    row.hit.name + ', ' + row.hit.kind + ', ' + row.hit.subtitle
                  : row.hit.name + ', ' + row.hit.kind
                "
                [attr.aria-selected]="row.index === selected()"
                [attr.data-i]="row.index"
                [attr.id]="'spot-opt-' + row.index"
                [class.on]="row.index === selected()"
                (click)="fire(row.index)"
                (keydown.enter)="fire(row.index)"
                (mousemove)="selected.set(row.index)"
                role="option"
                tabindex="-1"
              >
                <span class="art"><svg [appIcon]="row.hit.icon"></svg></span><span class="nm">{{ row.hit.name }}</span>
                @if (row.hit.subtitle) {
                  <span class="sub">{{ row.hit.subtitle }}</span>
                }
                <span class="kind">{{ row.hit.kind }}</span>
              </div>
            }
          </div>
        } @empty {
          @if (term()) {
            <div class="empty" role="status">No Results</div>
          }
        }
      </div>
    </div>
  `,
  styles: `
    .r .sub {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 11px;
      color: var(--txt-3);
      text-align: right;
    }
    .r.on .sub {
      color: rgba(255, 255, 255, 0.75);
    }
  `
})
export class Spotlight {
  private readonly appOrder = inject(ApplicationRegistry).launchOrder;
  private readonly apps = inject(ApplicationRegistry).apps;
  private readonly launcher = inject(AppLauncher);
  private readonly fs = inject(FileSystem);
  private readonly opener = inject(FileOpener);
  private readonly wm = inject(WindowManager);
  private readonly theme = inject(ThemeService);
  private readonly session = inject(Session);
  /** 备忘录只在第一次搜索时才读（D-18）：打开聚焦搜索不该触发 Notes 的数据域种子。 */
  private notesQuery: Signal<readonly Note[]> | null = null;

  private readonly injector = inject(Injector);
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
      run: () => this.launcher.activate('trash')
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

  /** 当前查询（已 trim）。 */
  protected readonly term = signal('');
  protected readonly groups = signal<readonly SpotlightGroup[]>([]);
  protected readonly selected = signal(0);
  protected readonly hasResults = computed(() => this.groups().length > 0);
  /** `aria-activedescendant`：方向键选中的结果行；没有结果时没有。 */
  protected readonly activeId = computed(() => (this.hasResults() ? `spot-opt-${this.selected()}` : null));

  constructor() {
    afterNextRender(() =>
      setTimeout(() => {
        if (this.overlays.spotlight() === 'open') this.queryInput().nativeElement.focus();
      }, 30)
    );
    afterRenderEffect(() => {
      this.selected();
      this.resultsBox().nativeElement.querySelector('.r.on')?.scrollIntoView({ block: 'nearest' });
    });
  }

  protected search(value: string): void {
    this.term.set(value.trim());
    this.selected.set(0);
    this.refresh();
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

  private notes(): readonly Note[] {
    if (!this.notesQuery) {
      const query = runInInjectionContext(this.injector, () =>
        liveQuery(() => Note.findAll({ where: ALL_ROWS, orderBy: [{ field: 'date', sort: 'desc' }] }), [], Note)
      );
      this.notesQuery = query;
      /* 备忘录读到时（首次搜索触发数据域种子之后）刷新当前结果，第一次输入就能搜到它们。 */
      effect(
        () => {
          query();
          untracked(() => {
            if (this.term()) this.refresh();
          });
        },
        { injector: this.injector }
      );
    }
    return this.notesQuery();
  }

  /** 按当前输入重新收集结果：命中表从头记，分组去重才不会把上一轮的结果当成「已出现过」。 */
  private refresh(): void {
    this.hits = [];
    this.groups.set(this.term() ? this.collect(this.term()) : []);
    this.selected.update(index => clamp(index, 0, Math.max(this.hits.length - 1, 0)));
  }

  private move(event: KeyboardEvent, delta: number): void {
    event.preventDefault();
    if (this.hits.length) this.selected.set(clamp(this.selected() + delta, 0, this.hits.length - 1));
  }

  private collect(q: string): SpotlightGroup[] {
    const lq = q.toLowerCase();
    /* 算式与单位换算最先出现（macOS 把计算结果放在最上面），回车把结果复制到剪贴板。 */
    const result = calculateExpression(q);
    const conversion = convertQuery(q);
    const calculation: SpotlightHit | null = result === null ? null : this.calculationHit(result);
    const conversionHit: SpotlightHit | null = conversion === null ? null : this.conversionHit(conversion);
    const apps = this.appOrder()
      .filter(id => this.apps()[id].name.toLowerCase().includes(lq))
      .map((id): SpotlightHit => ({
        name: this.apps()[id].name,
        kind: 'Application',
        icon: this.apps()[id].icon,
        run: () => this.launcher.activate(id)
      }));
    const actions = this.actions.filter(action => action.name.toLowerCase().includes(lq));
    const foundNodes = this.fs.deepSearch(this.fs.root(), lq).slice(0, 12);
    const found = foundNodes.map(node => this.fileHit(node));
    const showAll: SpotlightHit | null = foundNodes.length ? this.showAllHit(foundNodes[0]) : null;
    const notes = this.notes()
      .filter(note => note.title.toLowerCase().includes(lq))
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
      /* Safari 的数据服务在真正搜索网页时才创建（打开聚焦搜索不触发它的数据域种子，D-18）。 */
      run: () => this.injector.get(SafariBrowsers).goLatest(`search:${q}`)
    };
    /* 同名时优先真正的应用，而不是磁盘上的 .app 文件。 */
    const seen = new Set(apps.map(app => `${app.name.toLowerCase()}.app`));
    const sections: [string, readonly SpotlightHit[]][] = [
      ['Calculator', calculation ? [calculation] : []],
      ['Conversion', conversionHit ? [conversionHit] : []],
      ['Top Hit', [apps[0] ?? actions[0] ?? found[0]].filter((hit): hit is SpotlightHit => hit !== undefined)],
      [
        'Applications',
        [...apps, ...found.filter(hit => hit.kind === 'Application' && !seen.has(hit.name.toLowerCase()))]
      ],
      ['Actions', [...actions, ...(showAll ? [showAll] : [])]],
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
    const path = this.fs.findPath(node);
    const kind =
      node.kind === 'folder' ? 'Folder'
      : node.name.endsWith('.app') ? 'Application'
      : node.k || 'Document';
    const run =
      node.kind === 'folder' ? () => this.wm.open('finder', { path: path ?? HOME_PATH }) : () => this.opener.open(node);
    return { name: node.name, kind, icon: node.icon, subtitle: path ? folderTail(path) : undefined, run };
  }

  /** 算式命中：名字是结果，回车复制。 */
  private calculationHit(result: number): SpotlightHit {
    const text = formatNumber(result);
    return { name: text, kind: 'Calculation', icon: 'app-calculator', run: () => this.copy(text) };
  }

  /** 换算命中：名字是完整的一句话，回车复制。 */
  private conversionHit(conversion: UnitConversion): SpotlightHit {
    return { name: conversion.text, kind: 'Conversion', icon: 'app-calculator', run: () => this.copy(conversion.text) };
  }

  private copy(text: string): void {
    void browserClipboard()
      .writeText(text)
      .catch(() => undefined);
  }

  /** Show All in Finder：打开 Finder 到第一个命中所在目录。 */
  private showAllHit(first: FsNode): SpotlightHit {
    return {
      name: 'Show All in Finder',
      kind: 'Action',
      icon: 'app-finder',
      run: () => this.wm.open('finder', { path: this.dirOf(first) })
    };
  }

  /** 命中节点的所在目录：文件夹就是它自己，文件是它的父目录。 */
  private dirOf(node: FsNode): readonly string[] {
    const path = this.fs.findPath(node) ?? HOME_PATH;
    return node.kind === 'folder' || path.length < 2 ? path : path.slice(0, -1);
  }
}

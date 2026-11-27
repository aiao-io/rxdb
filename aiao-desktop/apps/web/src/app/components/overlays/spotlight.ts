import { useI18n } from '@aiao/rxdb-i18n-angular';

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
import { appDisplayName } from '../../services/desktop-app-name';

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
import { diskKindLabel } from './quick-look';

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
    '[attr.aria-label]': 'aria()',
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
          [attr.aria-label]="i18n.t('shell.overlay.spotlightSearch')"
          [placeholder]="i18n.t('shell.overlay.spotlightSearch')"
          (input)="search(query.value)"
          (keydown)="key($event)"
          aria-autocomplete="list"
          aria-controls="spot-results"
          autocomplete="off"
          data-sq
          role="combobox"
          spellcheck="false"
        />
      </div>
      <div
        class="res scroll"
        id="spot-results"
        #results
        [attr.aria-label]="i18n.t('shell.overlay.results')"
        data-sres
        role="listbox"
      >
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
            <div class="empty" role="status">{{ i18n.t('shell.overlay.noResults') }}</div>
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
  /** 宿主上的对话框名称：host 装饰器里不能引用 this，经信号绑定。 */
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
  private readonly actions = computed<readonly SpotlightHit[]>(() => [
    {
      name: this.i18n.t('shell.overlay.toggleDarkMode'),
      kind: this.i18n.t('shell.overlay.kindAction'),
      icon: 'g-moon',
      run: () => this.theme.toggle()
    },
    {
      name: this.i18n.t('shell.overlay.openLaunchpad'),
      kind: this.i18n.t('shell.overlay.kindAction'),
      icon: 'app-launchpad',
      run: () => this.overlays.openLaunchpad()
    },
    {
      name: this.i18n.t('shell.overlay.notificationCentre'),
      kind: this.i18n.t('shell.overlay.kindAction'),
      icon: 'g-cc',
      run: () => this.overlays.openNotifications()
    },
    {
      name: this.i18n.t('shell.overlay.emptyTrash'),
      kind: this.i18n.t('shell.overlay.kindAction'),
      icon: 'app-trash',
      run: () => this.launcher.activate('trash')
    },
    {
      name: this.i18n.t('shell.overlay.changeWallpaper'),
      kind: this.i18n.t('shell.overlay.kindAction'),
      icon: 'g-globe',
      run: () => this.wm.open('settings', { section: 'wallpaper' })
    },
    {
      name: this.i18n.t('shell.overlay.sleep'),
      kind: this.i18n.t('shell.overlay.kindAction'),
      icon: 'g-power',
      run: () => this.session.sleepNow()
    }
  ]);

  protected readonly i18n = useI18n();
  protected readonly appName = appDisplayName.bind(null, this.i18n);
  protected readonly aria = computed(() => this.i18n.t('shell.overlay.spotlight'));
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
      .filter(id => {
        const app = this.apps()[id];
        return this.appName(app).toLowerCase().includes(lq) || app.name.toLowerCase().includes(lq);
      })
      .map((id): SpotlightHit => ({
        name: this.appName(this.apps()[id]),
        kind: this.i18n.t('disk.kind.application'),
        icon: this.apps()[id].icon,
        run: () => this.launcher.activate(id)
      }));
    const actions = this.actions().filter(action => action.name.toLowerCase().includes(lq));
    const foundNodes = this.fs.deepSearch(this.fs.root(), lq).slice(0, 12);
    const found = foundNodes.map(node => this.fileHit(node));
    const showAll: SpotlightHit | null = foundNodes.length ? this.showAllHit(foundNodes[0]) : null;
    const notes = this.notes()
      .filter(note => note.title.toLowerCase().includes(lq))
      .slice(0, 3)
      .map((note): SpotlightHit => ({
        name: note.title,
        kind: this.i18n.t('shell.overlay.kindNote'),
        icon: 'app-notes',
        run: () => this.wm.open('notes')
      }));
    const web: SpotlightHit = {
      name: this.i18n.t('shell.overlay.searchWeb', { q }),
      kind: this.i18n.t('shell.overlay.kindSafari'),
      icon: 'app-safari',
      /* Safari 的数据服务在真正搜索网页时才创建（打开聚焦搜索不触发它的数据域种子，D-18）。 */
      run: () => this.injector.get(SafariBrowsers).goLatest(`search:${q}`)
    };
    /* 同名时优先真正的应用，而不是磁盘上的 .app 文件。 */
    const seen = new Set(apps.map(app => `${app.name.toLowerCase()}.app`));
    /* 分组按节点判定（种类标签随语言变化，不能拿它当代码比较）。 */
    const appFiles = found.filter(
      (hit, index) => foundNodes[index].name.endsWith('.app') && !seen.has(hit.name.toLowerCase())
    );
    const fileFolders = found.filter((hit, index) => foundNodes[index].kind === 'folder');
    const documents = found.filter(
      (hit, index) => foundNodes[index].kind !== 'folder' && !foundNodes[index].name.endsWith('.app')
    );
    const sections: [string, readonly SpotlightHit[]][] = [
      [this.i18n.t('shell.overlay.calculator'), calculation ? [calculation] : []],
      [this.i18n.t('shell.overlay.conversion'), conversionHit ? [conversionHit] : []],
      [
        this.i18n.t('shell.overlay.topHit'),
        [apps[0] ?? actions[0] ?? found[0]].filter((hit): hit is SpotlightHit => hit !== undefined)
      ],
      [this.i18n.t('shell.overlay.applications'), [...apps, ...appFiles]],
      [this.i18n.t('shell.overlay.actions'), [...actions, ...(showAll ? [showAll] : [])]],
      [this.i18n.t('shell.overlay.documents'), documents],
      [this.i18n.t('shell.overlay.folders'), fileFolders],
      [this.i18n.t('shell.overlay.notes'), notes],
      [this.i18n.t('shell.overlay.suggestedWebsites'), [web]]
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
      node.kind === 'folder' ? this.i18n.t('shell.overlay.folder')
      : node.name.endsWith('.app') ? this.i18n.t('disk.kind.application')
      : diskKindLabel(this.i18n.t, node.k || 'Document');
    const run =
      node.kind === 'folder' ? () => this.wm.open('finder', { path: path ?? HOME_PATH }) : () => this.opener.open(node);
    return { name: node.name, kind, icon: node.icon, subtitle: path ? folderTail(path) : undefined, run };
  }

  /** 算式命中：名字是结果，回车复制。 */
  private calculationHit(result: number): SpotlightHit {
    const text = formatNumber(result);
    return {
      name: text,
      kind: this.i18n.t('shell.overlay.kindCalculation'),
      icon: 'app-calculator',
      run: () => this.copy(text)
    };
  }

  /** 换算命中：名字是完整的一句话，回车复制。 */
  private conversionHit(conversion: UnitConversion): SpotlightHit {
    return {
      name: conversion.text,
      kind: this.i18n.t('shell.overlay.kindConversion'),
      icon: 'app-calculator',
      run: () => this.copy(conversion.text)
    };
  }

  private copy(text: string): void {
    void browserClipboard()
      .writeText(text)
      .catch(() => undefined);
  }

  /** Show All in Finder：打开 Finder 到第一个命中所在目录。 */
  private showAllHit(first: FsNode): SpotlightHit {
    return {
      name: this.i18n.t('shell.overlay.showAllInFinder'),
      kind: this.i18n.t('shell.overlay.kindAction'),
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

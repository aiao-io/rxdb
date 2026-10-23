import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  Injector,
  OnInit,
  signal,
  untracked,
  viewChild,
  type ElementRef
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { BomDemoService } from '../bom-demo.service';
import { BomWorkspaceState } from '../bom-workspace-state';
import { materialLabel } from '../presentation/material-label';
import { WorkflowJourney } from './workflow-journey';

interface NavItem {
  path: string;
  label: string;
  description: string;
  icon: string;
  exact: boolean;
}

@Component({
  selector: 'bom-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet, WorkflowJourney],
  host: {
    '(keydown.escape)': 'closeNavigation()',
    '(keydown.tab)': 'trapNavigation($event)',
    '(keydown.shift.tab)': 'trapNavigation($event)'
  },
  template: `
    <a class="skip-link" href="#main-content">跳到主要内容</a>
    <div class="shell" [class.navigation-open]="navigationOpen()">
      @if (navigationOpen()) {
        <button class="navigation-backdrop" (click)="closeNavigation()" aria-label="关闭导航"></button>
      }
      <aside class="sidebar" id="bom-navigation" #navigation aria-label="演示场景导航">
        <a class="brand" (click)="closeNavigation()" aria-label="BOM 演示中心首页" routerLink="/">
          <span class="brand-mark" aria-hidden="true">
            <svg fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
              <path d="M12 3 21 8v8l-9 5-9-5V8l9-5Z M3 8l9 5 9-5 M12 13v8 M7.5 5.5l9 5" />
            </svg>
          </span>
          <span><strong>BOM 演示中心</strong><small>物料与制造工作台</small></span>
        </a>
        <div class="workspace-label"><span class="workspace-dot"></span>演示工作区</div>
        <nav class="nav" aria-label="主导航">
          @for (section of sections; track section.label) {
            <div class="nav-section">
              <div class="nav-section-title">{{ section.label }}</div>
              @for (item of section.items; track item.path) {
                <a
                  class="nav-item"
                  [attr.aria-label]="item.label"
                  [queryParams]="workspaceState.queryParams()"
                  [routerLink]="item.path"
                  [routerLinkActiveOptions]="navigationMatch"
                  (click)="closeNavigation()"
                  ariaCurrentWhenActive="page"
                  routerLinkActive="active"
                >
                  <svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" viewBox="0 0 24 24">
                    <path [attr.d]="item.icon" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                  <span class="nav-item-copy"
                    ><strong>{{ item.label }}</strong
                    ><small>{{ item.description }}</small></span
                  >
                  <span class="nav-arrow" aria-hidden="true">›</span>
                </a>
              }
            </div>
          }
        </nav>
        <div class="sidebar-bottom">
          <div class="dataset-card">
            <span class="dataset-icon" aria-hidden="true">SC</span>
            <div>
              <strong>电动滑板车（SC-100）</strong
              ><small>{{ ready() ? itemCount() + ' 项物料 · 可开始体验' : '从准备演示数据开始' }}</small>
            </div>
          </div>
          <p>本地演示 · 数据保存在当前浏览器</p>
        </div>
      </aside>
      <div class="workspace" [attr.inert]="navigationOpen() ? '' : null">
        <header class="header">
          <div class="header-location">
            <button
              class="navigation-toggle"
              #menuToggle
              [attr.aria-expanded]="navigationOpen()"
              [attr.aria-label]="navigationOpen() ? '关闭导航' : '打开导航'"
              (click)="openNavigation()"
              aria-controls="bom-navigation"
            >
              <svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
                <path d="M4 6h16M4 12h16M4 18h16" stroke-linecap="round" />
              </svg>
            </button>
            <div class="breadcrumb">
              <a routerLink="/">演示中心</a><span aria-hidden="true">/</span><strong>{{ activeLabel() }}</strong>
            </div>
          </div>
          <div class="header-actions">
            <span
              class="badge"
              [class.badge-neutral]="!ready() || resetting()"
              [class.badge-success]="ready() && !resetting()"
              data-testid="workspace-data-status"
              role="status"
            >
              {{ statusLabel() }}
            </span>
            <button
              class="btn btn-quiet reset-button"
              [disabled]="resetting() || serviceResetting() || initializing()"
              (click)="resetAll()"
              aria-label="重置演示数据"
            >
              <svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" viewBox="0 0 24 24">
                <path d="M4 10a8 8 0 1 1 1.2 7M4 4v6h6" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <span>重置演示</span>
            </button>
          </div>
        </header>
        @if (ready() && !reviewRoute()) {
          <div class="workspace-context" aria-label="当前分析条件">
            <div>
              <strong>{{ materialLabel(workspaceState.rootKey()) }}</strong
              ><span
                >{{ workspaceState.asOfDate() }} · {{ workspaceState.plannedQty() }}
                {{ workspaceState.plannedUom() }}</span
              >
            </div>
            <nav aria-label="连续分析">
              <a [queryParams]="workspaceState.queryParams()" routerLink="/explosion">结构与用量</a>
              <a [queryParams]="workspaceState.queryParams()" routerLink="/cost">成本来源</a>
              <a [queryParams]="workspaceState.queryParams()" routerLink="/where-used">使用影响</a>
            </nav>
          </div>
        }
        <main class="content" id="main-content" tabindex="-1">
          @if (!reviewRoute()) {
            <bom-workflow-journey />
          }
          @if (serviceResetting()) {
            <p class="workspace-notice hint" role="status">{{ resetStatus() }}</p>
          }
          @if (connectionError()) {
            <div class="error-box workspace-notice connection-error" role="alert">
              <strong>演示数据连接失败</strong>
              <div>请查看原因，或重置演示数据后重试。</div>
              <button class="btn" [disabled]="initializing()" (click)="connect()">重新连接，保留现有数据</button>
              <details>
                <summary>查看详细原因</summary>
                <p>{{ connectionError() }}</p>
              </details>
            </div>
          }
          @if (actionError()) {
            <div class="error-box workspace-notice action-error" role="alert">
              <strong>恢复演示数据失败</strong>
              <div>请稍后重试；下方保留本次错误原因。</div>
              <details>
                <summary>查看详细原因</summary>
                <p>{{ actionError() }}</p>
              </details>
            </div>
          }
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styleUrl: './app-shell.scss'
})
export class AppShell implements OnInit {
  private readonly service = inject(BomDemoService);
  private readonly router = inject(Router);
  private readonly menuToggle = viewChild.required<ElementRef<HTMLButtonElement>>('menuToggle');
  private readonly navigation = viewChild.required<ElementRef<HTMLElement>>('navigation');
  private readonly injector = inject(Injector);
  private readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );

  readonly workspaceState = inject(BomWorkspaceState);
  readonly reviewRoute = computed(() => this.currentUrl().split(/[?#]/)[0] === '/review');
  readonly navigationMatch = {
    paths: 'exact',
    queryParams: 'ignored',
    matrixParams: 'ignored',
    fragment: 'ignored'
  } as const;
  readonly materialLabel = materialLabel;
  readonly ready = this.service.ready;
  readonly serviceResetting = this.service.resetting;
  readonly resetStatus = this.service.resetStatus;
  readonly itemCount = this.service.itemCount;
  readonly resetting = signal(false);
  readonly connectionError = signal('');
  readonly actionError = signal('');
  readonly initializing = signal(true);
  readonly navigationOpen = signal(false);

  readonly sections: { label: string; items: NavItem[] }[] = [
    {
      label: '开始使用',
      items: [
        {
          path: '/',
          label: '概览',
          description: '数据准备与场景入口',
          icon: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',
          exact: true
        },
        {
          path: '/review',
          label: '生产改版核对',
          description: '核对本批用料与成本变化',
          icon: 'M8 3h8v4H8z M6 5H4v16h16V5h-2 M8 12l2 2 5-5 M8 18h8',
          exact: false
        }
      ]
    },
    {
      label: '结构与成本',
      items: [
        {
          path: '/explosion',
          label: '展开',
          description: '查看结构与用量依据',
          icon: 'M9 3h6v5H9z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4 M6 16v-4h12v4',
          exact: false
        },
        {
          path: '/cost',
          label: '成本卷算',
          description: '从总成本看到每笔明细',
          icon: 'M5 3h14v18H5z M8 7h8 M8 11h2 M14 11h2 M8 15h2 M14 15h2 M8 18h2 M14 18h2',
          exact: false
        },
        {
          path: '/where-used',
          label: '反查',
          description: '查找物料的上层用途',
          icon: 'M12 21V8 M7 13l5-5 5 5 M5 3h14',
          exact: false
        }
      ]
    },
    {
      label: '变更与制造',
      items: [
        {
          path: '/timeline',
          label: '时间轴',
          description: '对比变更前后的版本',
          icon: 'M4 5h16 M4 19h16 M7 5v14 M12 9h8 M12 14h5',
          exact: false
        },
        {
          path: '/mapping',
          label: '双图映射',
          description: '对照设计与制造清单',
          icon: 'M3 5h6v14H3z M15 5h6v14h-6z M9 9h6 M12 6l3 3-3 3 M15 15H9 M12 12l-3 3 3 3',
          exact: false
        },
        {
          path: '/instances',
          label: '实例追溯',
          description: '查看实物安装与换件',
          icon: 'M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M15 14h5v6h-5 M2 12h20',
          exact: false
        }
      ]
    }
  ];

  readonly activeLabel = computed(() => {
    const path = this.currentUrl().split(/[?#]/)[0];
    return this.sections.flatMap(section => section.items).find(item => item.path === path)?.label;
  });

  readonly statusLabel = computed(() => {
    if (this.resetting() || this.serviceResetting()) return '正在恢复数据…';
    if (this.initializing()) return '正在连接…';
    if (this.connectionError()) return '连接失败';
    return this.ready() ? `数据已就绪 · ${this.itemCount()} 项物料` : '待准备演示数据';
  });

  constructor() {
    effect(() => {
      this.service.dataRevision();
      untracked(() => {
        this.workspaceState.explosion.set(null);
        this.workspaceState.cost.set(null);
      });
    });
  }

  ngOnInit(): void {
    this.workspaceState.bindRouter(this.router);
    this.connect();
  }

  /** 无损重连，清空演示作为独立操作保留。 */
  connect(): void {
    this.initializing.set(true);
    this.connectionError.set('');
    void this.service
      .connectExisting()
      .catch(error => this.connectionError.set(String(error)))
      .finally(() => this.initializing.set(false));
  }

  closeNavigation(): void {
    const wasOpen = this.navigationOpen();
    this.navigationOpen.set(false);
    if (wasOpen)
      afterNextRender(
        () => {
          if (!this.navigationOpen()) this.menuToggle().nativeElement.focus();
        },
        { injector: this.injector }
      );
  }

  /** 打开导航后移入当前页面，并隔离背景交互。 */
  openNavigation(): void {
    this.navigationOpen.set(true);
    afterNextRender(
      () => {
        if (!this.navigationOpen()) return;
        const navigation = this.navigation().nativeElement;
        const target =
          navigation.querySelector<HTMLAnchorElement>('a[aria-current="page"]') ??
          navigation.querySelector<HTMLAnchorElement>('a');
        target?.focus();
      },
      { injector: this.injector }
    );
  }

  /** 抽屉内循环焦点，Escape 的关闭行为由宿主处理。 */
  trapNavigation(event: Event): void {
    if (!this.navigationOpen() || !(event instanceof KeyboardEvent)) return;
    const links = this.navigation().nativeElement.querySelectorAll<HTMLAnchorElement>('a[href]');
    const target = event.shiftKey ? links[links.length - 1] : links[0];
    const boundary = event.shiftKey ? links[0] : links[links.length - 1];
    if (document.activeElement !== boundary) return;
    event.preventDefault();
    target?.focus();
  }

  async resetAll(): Promise<void> {
    if (
      this.resetting() ||
      this.serviceResetting() ||
      !window.confirm('将清空当前演示数据中的修改，并恢复电动滑板车（SC-100）的完整示例数据。是否继续？')
    )
      return;
    this.resetting.set(true);
    this.connectionError.set('');
    this.actionError.set('');
    try {
      await this.service.resetAndSeed();
      await this.router.navigateByUrl('/');
    } catch (error) {
      this.actionError.set(String(error));
    } finally {
      this.resetting.set(false);
    }
  }
}

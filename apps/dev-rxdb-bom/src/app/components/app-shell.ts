import { ChangeDetectionStrategy, Component, effect, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { BomDemoService } from '../bom-demo.service';

/** 侧边栏导航条目。 */
interface NavItem {
  path: string;
  label: string;
  exact: boolean;
}

/**
 * 应用壳：侧边栏（分区导航 6 项）+ 顶栏（应用名/种子状态徽标/重置按钮）+ 页面出口。
 * 壳统一负责既有库连接（页面重载路径），各页面只消费服务信号。
 */
@Component({
  selector: 'bom-app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <span class="brand-mark">BOM</span>
          <span class="brand-name">演示中心</span>
        </div>
        <nav class="nav" aria-label="主导航">
          @for (section of sections; track section.label) {
            <div class="nav-section">
              <div class="nav-section-title">{{ section.label }}</div>
              @for (item of section.items; track item.path) {
                <a
                  class="nav-item"
                  [routerLink]="item.path"
                  [routerLinkActiveOptions]="{ exact: item.exact }"
                  routerLinkActive="active"
                >
                  <span class="nav-item-dot"></span>
                  <span class="nav-item-label">{{ item.label }}</span>
                </a>
              }
            </div>
          }
        </nav>
      </aside>
      <div class="workspace">
        <header class="header">
          <div class="header-title">
            <h1>BOM 端到端演示</h1>
            <span class="header-sub">rxdb-plugin-bom · SC-100 电动滑板车</span>
          </div>
          <div class="header-actions">
            <span class="badge" [class.badge-neutral]="!ready()" [class.badge-success]="ready()">
              {{ ready() ? '种子已就绪 · ' + itemCount() + ' 物料' : '连接中…' }}
            </span>
            <button class="btn btn-secondary" [disabled]="resetting()" (click)="resetAll()">重置数据库</button>
          </div>
        </header>
        <main class="content">
          @if (connectionError()) {
            <div class="error-box connection-error" role="alert">{{ connectionError() }}。可重置数据库后重试。</div>
          }
          <router-outlet />
        </main>
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
      }

      .shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
      }

      /* ---- 侧边栏 ---- */
      .sidebar {
        display: flex;
        flex-shrink: 0;
        flex-direction: column;
        width: 224px;
        border-right: 1px solid var(--color-border);
        background: var(--color-surface);
      }

      .brand {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: var(--space-4);
        border-bottom: 1px solid var(--color-border);
      }

      .brand-mark {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 28px;
        height: 28px;
        border-radius: var(--radius-md);
        background: var(--color-primary);
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.04em;
      }

      .brand-name {
        font-size: 14px;
        font-weight: 600;
      }

      .nav {
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: var(--space-4);
        overflow-y: auto;
        padding: var(--space-3) var(--space-2);
      }

      .nav-section {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .nav-section-title {
        padding: 0 var(--space-2);
        color: var(--color-text-muted);
        font-size: 11px;
        letter-spacing: 0.06em;
      }

      .nav-item {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        padding: 7px 10px;
        border-radius: var(--radius-sm);
        color: var(--color-text-secondary);
        font-size: 13px;
        text-decoration: none;
        transition:
          background 0.12s ease,
          color 0.12s ease;
      }

      .nav-item:hover {
        background: var(--color-hover);
        color: var(--color-text);
      }

      .nav-item.active {
        background: var(--color-primary-bg);
        color: var(--color-primary);
        font-weight: 600;
      }

      .nav-item-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
        opacity: 0.35;
      }

      .nav-item.active .nav-item-dot {
        opacity: 1;
      }

      /* ---- 工作区（顶栏 + 内容） ---- */
      .workspace {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
      }

      .header {
        display: flex;
        flex-shrink: 0;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-4);
        height: 56px;
        padding: 0 var(--space-5);
        border-bottom: 1px solid var(--color-border);
        background: var(--color-surface);
      }

      .header-title {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        min-width: 0;
      }

      .header-title h1 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
      }

      .header-sub {
        overflow: hidden;
        color: var(--color-text-muted);
        font-size: 12px;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .header-actions {
        display: flex;
        align-items: center;
        gap: var(--space-3);
      }

      .content {
        flex: 1;
        overflow-y: auto;
        background: var(--color-bg);
      }

      .connection-error {
        margin: var(--space-4);
      }

      @media (max-width: 760px) {
        .shell {
          flex-direction: column;
        }
        .sidebar {
          width: auto;
          border-right: 0;
          border-bottom: 1px solid var(--color-border);
        }
        .brand {
          display: none;
        }
        .nav {
          flex-direction: row;
          gap: var(--space-2);
          padding: var(--space-2);
          overflow-x: auto;
        }
        .nav-section {
          flex-direction: row;
        }
        .nav-section-title {
          display: none;
        }
        .nav-item {
          white-space: nowrap;
        }
        .workspace {
          min-height: 0;
        }
        .header {
          height: auto;
          min-height: 56px;
          padding: var(--space-2) var(--space-3);
          flex-wrap: wrap;
          gap: var(--space-2);
        }
        .header-sub {
          display: none;
        }
      }
    `
  ]
})
export class AppShell implements OnInit {
  private readonly service = inject(BomDemoService);

  readonly ready = this.service.ready;
  readonly itemCount = this.service.itemCount;
  readonly resetting = signal(false);
  readonly connectionError = signal('');

  /** 侧边栏分区导航：核心（概览/展开）+ 场景（时间轴/双图映射/成本卷算/反查）。 */
  readonly sections: { label: string; items: NavItem[] }[] = [
    {
      label: '核心',
      items: [
        { path: '/', label: '概览', exact: true },
        { path: '/explosion', label: '展开', exact: false }
      ]
    },
    {
      label: '场景',
      items: [
        { path: '/timeline', label: '时间轴', exact: false },
        { path: '/mapping', label: '双图映射', exact: false },
        { path: '/cost', label: '成本卷算', exact: false },
        { path: '/where-used', label: '反查', exact: false }
      ]
    }
  ];

  constructor() {
    effect(() => {
      if (this.ready()) this.connectionError.set('');
    });
  }

  ngOnInit(): void {
    // 壳统一连接既有库（页面重载路径：插件触发器幂等安装，种子行原样可用）
    void this.service.connectExisting().catch(error => this.connectionError.set(String(error)));
  }

  /** 顶栏重置：清库重装种子后整页重载，让各页本地信号回到初始态（服务信号已由 hydrate 刷新）。 */
  async resetAll(): Promise<void> {
    this.resetting.set(true);
    this.connectionError.set('');
    try {
      await this.service.resetAndSeed();
      window.location.reload();
    } catch (error) {
      this.connectionError.set(String(error));
    } finally {
      this.resetting.set(false);
    }
  }
}

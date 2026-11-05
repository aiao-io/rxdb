import { ChangeDetectionStrategy, Component, inject, signal, type OnInit } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { AdminAccess } from '../admin/admin-access';
import { AuthService } from '../auth/auth.service';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';

/** 文件共享与本机管理共用的工作区。 */
@Component({
  selector: 'app-workspace-page',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="skip-link" href="#workspace-content">跳到主要内容</a>
    <header class="border-base-300 bg-base-100 border-b">
      <div class="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4 lg:px-8">
        <a class="flex items-center gap-3 font-semibold" aria-label="近邻文件共享首页" routerLink="/">
          <span class="bg-primary text-primary-content grid h-10 w-10 place-items-center rounded-xl" aria-hidden="true">
            <svg fill="none" height="22" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" width="22">
              <path d="M4 8h13m-4-4 4 4-4 4M20 16H7m4-4-4 4 4 4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </span>
          <span>近邻<span class="text-base-content/50 ml-2 text-sm font-normal">P2P 文件共享</span></span>
        </a>
        <nav class="order-last flex w-full gap-1 sm:order-none sm:w-auto" aria-label="主要导航">
          <a
            class="btn btn-ghost btn-sm"
            [routerLinkActiveOptions]="{ exact: true }"
            ariaCurrentWhenActive="page"
            routerLink="/"
            routerLinkActive="nav-active"
            >文件共享</a
          >
          <a
            class="btn btn-ghost btn-sm"
            ariaCurrentWhenActive="page"
            data-testid="manage-entry"
            routerLink="/manage"
            routerLinkActive="nav-active"
            >本机管理</a
          >
          @if (admin.isAdmin()) {
            <a
              class="btn btn-ghost btn-sm"
              ariaCurrentWhenActive="page"
              data-testid="admin-entry"
              routerLink="/admin"
              routerLinkActive="nav-active"
              >管理后台</a
            >
          }
        </nav>
        <div class="ml-auto flex items-center gap-3">
          <span
            class="badge badge-outline gap-2 text-xs"
            [attr.data-state]="workspace.signalingState()"
            [class.text-success]="workspace.signalingState() === 'online'"
            data-testid="signaling-state"
            role="status"
          >
            <span
              class="status status-xs"
              [class.status-success]="workspace.signalingState() === 'online'"
              aria-hidden="true"
            ></span>
            {{ workspace.signalingState() === 'online' ? '设备发现已连接' : '设备发现未连接' }}
          </span>
          <div class="hidden max-w-52 text-right text-xs sm:block">
            <div class="truncate font-medium" data-testid="current-device">
              {{ workspace.device()?.name ?? '登记设备中…' }}
            </div>
            <div class="text-base-content/55 truncate" data-testid="current-user">
              {{ auth.session()?.user?.email }}
            </div>
          </div>
          <button class="btn btn-ghost btn-sm" [disabled]="signingOut()" (click)="signOut()" type="button">退出</button>
        </div>
      </div>
    </header>
    <main class="mx-auto max-w-7xl px-5 py-8 lg:px-8" id="workspace-content">
      @if (workspace.faults().deny || workspace.faults().corrupt || workspace.faults().delayMs) {
        <div class="alert alert-warning mb-5 text-sm" data-testid="fault-warning" role="status">
          <span>故障模拟已开启，会影响其他设备从本机下载。</span>
          <button
            class="btn btn-sm"
            (click)="workspace.setFaults({ deny: false, corrupt: false, delayMs: 0 })"
            type="button"
          >
            恢复正常共享
          </button>
        </div>
      }
      @if (error(); as message) {
        <div class="alert alert-error mb-5" role="alert">{{ message }}</div>
      }
      @switch (workspace.phase()) {
        @case ('failed') {
          <section class="card bg-base-100 mx-auto max-w-xl p-8" role="alert">
            <h1 class="text-xl font-semibold">暂时无法打开工作区</h1>
            <p class="my-4 text-sm">{{ workspace.startError() }}</p>
            <button class="btn btn-primary self-start" (click)="reload()" type="button">重新加载</button>
          </section>
        }
        @case ('ready') {
          @if (workspace.sync().phase === 'error') {
            <div class="alert alert-warning mb-5 text-sm" role="alert">
              文件列表同步失败，其他设备可能暂时看不到更新。网络恢复后会自动重试。
              <details>
                <summary>查看原因</summary>
                {{ workspace.sync().error }}
              </details>
            </div>
          }
          <router-outlet />
        }
        @default {
          <div class="flex items-center justify-center gap-3 py-24" role="status">
            <span class="loading loading-spinner loading-sm"></span>正在准备你的设备和共享文件…
          </div>
        }
      }
    </main>
    <footer class="text-base-content/55 mx-auto max-w-7xl px-5 pb-8 text-xs lg:px-8">
      设备直传需要位于同一局域网。保持页面打开，其他设备才能从这里下载。
    </footer>
  `
})
export default class WorkspacePage implements OnInit {
  readonly auth = inject(AuthService);
  readonly workspace = inject(P2PWorkspace);
  readonly admin = inject(AdminAccess);
  readonly signingOut = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.workspace.start().catch(() => undefined);
    // 确认不了身份就不显示入口，不影响文件共享本身
    void this.admin.check().catch(() => undefined);
  }
  reload(): void {
    location.reload();
  }
  async signOut(): Promise<void> {
    this.signingOut.set(true);
    try {
      await this.auth.signOut();
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : String(error));
      this.signingOut.set(false);
    }
  }
}

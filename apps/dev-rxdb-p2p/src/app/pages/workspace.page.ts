import { ChangeDetectionStrategy, Component, inject, type OnInit } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import { DevicesPanel } from './devices-panel';
import { FilesPanel } from './files-panel';
import { InspectorPanel } from './inspector-panel';
import { TransfersPanel } from './transfers-panel';

/** 工作区：本机设备、在线设备、共享文件、传输与会话。 */
@Component({
  selector: 'app-workspace-page',
  imports: [DevicesPanel, FilesPanel, TransfersPanel, InspectorPanel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="navbar bg-base-100 gap-2 px-4 shadow-sm">
      <div class="flex-1">
        <span class="font-semibold">局域网 P2P 文件共享</span>
        <span class="ml-2 text-xs opacity-60">@aiao/rxdb-plugin-p2p</span>
      </div>
      <span class="badge badge-sm" data-testid="signaling-state" [class]="workspace.signalingState() === 'online' ? 'badge-success' : 'badge-warning'">
        信令 {{ workspace.signalingState() }}
      </span>
      <span class="badge badge-sm" [class]="workspace.sync().phase === 'error' ? 'badge-error' : 'badge-ghost'" [title]="workspace.sync().error ?? ''">
        同步 {{ workspace.sync().phase }}
      </span>
      <div class="text-right text-xs leading-tight">
        <div data-testid="current-user">{{ auth.session()?.user?.email }}</div>
        <div class="opacity-60" data-testid="current-device">{{ workspace.device()?.name ?? '登记设备中…' }}</div>
      </div>
      <button class="btn btn-ghost btn-sm" type="button" (click)="auth.signOut()">退出</button>
    </header>

    @switch (workspace.phase()) {
      @case ('failed') {
        <div role="alert" class="alert alert-error m-4">启动失败：{{ workspace.startError() }}</div>
      }
      @case ('ready') {
        <main class="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          <div class="flex flex-col gap-4">
            <app-devices-panel />
            <app-inspector-panel />
          </div>
          <div class="flex flex-col gap-4">
            <app-files-panel />
            <app-transfers-panel />
          </div>
        </main>
      }
      @default {
        <div class="flex items-center gap-2 p-6"><span class="loading loading-spinner"></span>登记设备、打开本地库并连接信令…</div>
      }
    }
  `
})
export default class WorkspacePage implements OnInit {
  readonly auth = inject(AuthService);
  readonly workspace = inject(P2PWorkspace);

  ngOnInit(): void {
    void this.workspace.start().catch(() => undefined);
  }
}

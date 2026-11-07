import { formatFileSize } from '@aiao/utils';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { P2PWorkspace } from '../p2p/p2p-workspace.service';
import type { LinkView } from '../p2p/peer-links';

const DELAYS_MS = [0, 50, 200] as const;

/** 会话帧日志与本机供块端的故障注入。 */
@Component({
  selector: 'app-inspector-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="card bg-base-100 shadow-sm" data-testid="inspector-panel">
      <div class="card-body gap-3 p-4">
        <h2 class="card-title text-base">本机作为供块端：故障注入</h2>
        <div class="flex flex-wrap items-center gap-4 text-sm">
          <label class="label cursor-pointer gap-2">
            <input
              class="toggle toggle-sm"
              [checked]="workspace.faults().deny"
              (change)="workspace.setFaults({ deny: !workspace.faults().deny })"
              data-testid="fault-deny"
              type="checkbox"
            />
            拒绝授权
          </label>
          <label class="label cursor-pointer gap-2">
            <input
              class="toggle toggle-sm"
              [checked]="workspace.faults().corrupt"
              (change)="workspace.setFaults({ corrupt: !workspace.faults().corrupt })"
              data-testid="fault-corrupt"
              type="checkbox"
            />
            篡改数据块
          </label>
          <label class="flex items-center gap-2">
            每块延迟
            <select
              class="select select-sm w-24"
              #delayInput
              (change)="workspace.setFaults({ delayMs: +delayInput.value })"
            >
              @for (delay of delays; track delay) {
                <option [selected]="workspace.faults().delayMs === delay" [value]="delay">{{ delay }} ms</option>
              }
            </select>
          </label>
          <button
            class="btn btn-sm"
            (click)="workspace.freezeMainThread(10_000)"
            title="对端会在心跳超时（6 秒）内判定本机失联"
            type="button"
          >
            卡住本页 10 秒
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <h2 class="card-title flex-1 text-base">会话帧</h2>
          <select
            class="select select-sm max-w-64"
            #connectionInput
            (change)="selected.set(connectionInput.value)"
            aria-label="选择诊断连接"
          >
            @for (link of workspace.links(); track link.connectionId) {
              <option [selected]="link.connectionId === current()?.connectionId" [value]="link.connectionId">
                {{ link.peer.deviceName }} · {{ link.connectionId.slice(0, 8) }}
              </option>
            }
          </select>
        </div>
        @if (current(); as link) {
          <div class="text-xs opacity-70">
            发出 {{ link.totals.sent }} 帧 / {{ size(link.totals.bytesSent) }} · 收到 {{ link.totals.received }} 帧 /
            {{ size(link.totals.bytesReceived) }}
          </div>
          <div class="max-h-64 overflow-y-auto">
            <table class="table-xs table font-mono">
              <tbody>
                @for (frame of link.frames.slice().reverse(); track $index) {
                  <tr>
                    <td class="opacity-60">{{ frame.direction === 'out' ? '→' : '←' }}</td>
                    <td
                      [class.text-error]="frame.kind === 'error' || frame.kind === 'bye'"
                      [class.text-primary]="frame.kind === 'response'"
                    >
                      {{ frame.kind }}
                    </td>
                    <td>{{ frame.id ?? '' }}</td>
                    <td class="truncate">{{ frame.detail ?? '' }}</td>
                    <td class="text-right">{{ size(frame.bytes) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else {
          <p class="text-sm opacity-60">
            建立会话后，这里按时间倒序显示最近的帧：hello、request / response、cancel、ping / pong、bye。
          </p>
        }
      </div>
    </section>
  `
})
export class InspectorPanel {
  readonly workspace = inject(P2PWorkspace);
  readonly delays = DELAYS_MS;
  readonly selected = signal<string | null>(null);
  readonly current = computed<LinkView | undefined>(() => {
    const links = this.workspace.links();
    return links.find(link => link.connectionId === this.selected()) ?? links[0];
  });

  size(bytes: number): string {
    return formatFileSize(bytes);
  }
}

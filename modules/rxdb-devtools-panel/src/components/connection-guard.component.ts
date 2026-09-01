import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DevToolsStateService } from '../services/devtools-state.service';
import { DEVTOOLS_HOST_ACCESS } from '../transport';

/**
 * 连接守卫组件
 * 未连接时显示提示，已连接时显示内容
 */
@Component({
  selector: 'app-connection-guard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (accessState() === 'required') {
      <div class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
        <button class="btn btn-primary btn-sm" (click)="requestAccess()" type="button">允许访问当前站点</button>
        @if (accessError()) {
          <p class="text-error text-sm">{{ accessError() }}</p>
        }
      </div>
    } @else if (accessState() === 'requesting' || accessState() === 'checking') {
      <div class="flex h-full items-center justify-center"><div class="loading loading-spinner loading-lg"></div></div>
    } @else if (accessState() === 'unsupported') {
      <div class="flex h-full items-center justify-center p-8 text-center text-sm opacity-70">
        当前页面不支持扩展注入
      </div>
    } @else if (connected()) {
      <ng-content />
    } @else {
      <div class="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <div class="loading loading-spinner loading-lg"></div>
        <div>
          <h2 class="text-lg font-semibold">Waiting for RxDB connection...</h2>
          <p class="mt-2 text-sm opacity-70">Make sure the page has RxDB DevTools plugin enabled.</p>
        </div>
      </div>
    }
  `
})
export class ConnectionGuardComponent {
  private readonly devToolsState = inject(DevToolsStateService);
  private readonly access = inject(DEVTOOLS_HOST_ACCESS);

  readonly connected = this.devToolsState.connected;
  readonly accessState = this.access.state;
  readonly accessError = this.access.error;

  requestAccess(): void {
    void this.access.requestAccess();
  }
}

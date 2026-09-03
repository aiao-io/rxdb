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
      <div class="flex h-full flex-col items-center justify-center gap-2 p-8 text-center">
        <h2 class="text-base font-semibold">当前页面不支持扩展注入</h2>
        <p class="max-w-md text-sm opacity-70">
          扩展只能注入 {{ injectableSchemes }} 协议的页面，当前页面用的是别的协议。浏览器内部页与自定义
          scheme 的应用入口都不在这个集合里 —— 这是 Chromium 对扩展 match pattern 的限制，面板侧绕不开。
        </p>
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

  /**
   * Chromium 扩展 match pattern 认得的 scheme 集，供 `unsupported` 分支说明原因。
   *
   * @remarks
   * 与宿主侧把 URL 转成 host permission pattern 的判定同源（Chrome 实现见扩展的
   * `permissionPatternForUrl`）。文案**只描述协议这一事实**，不点名任何宿主：同一个分支
   * 在浏览器的 `chrome://` 内部页与桌面应用的自定义 scheme 入口下都会出现。
   */
  readonly injectableSchemes = 'http、https、file、ftp';

  readonly connected = this.devToolsState.connected;
  readonly accessState = this.access.state;
  readonly accessError = this.access.error;

  requestAccess(): void {
    void this.access.requestAccess();
  }
}

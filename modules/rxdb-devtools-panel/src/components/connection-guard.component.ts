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
          扩展只能注入 {{ injectableSchemes }} 协议的页面，当前页面用的是别的协议。浏览器内部页与自定义 scheme
          的应用入口都不在这个集合里 —— 这是 Chromium 对扩展 match pattern 的限制，面板侧绕不开。
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
  `,
  styles: [
    `
      /*
       * 宿主必须是有高度的块。缺了这两行，组件宿主是默认的 display:inline、高度 0，于是：
       *
       * - 本组件四个分支模板里的 h-full 全部解析成 0，「等待连接」「不支持注入」这些状态
       *   等于没有版面可用；
       * - 更要命的是 ng-content 那一支 —— 每一个页面都把自己的内容套在守卫里，
       *   所以整个面板的高度链在这里断掉。实测（Electron dock DevTools，抽屉 272px）：
       *   守卫 0x0、Files 页 0px、Events 页的虚拟滚动视口 clientHeight 为 0
       *   （内容 800px，只渲染三五条最小缓冲）、Database 页 452px 直接溢出抽屉而不是内部滚动。
       *
       * min-height:0 是给 flex 场景的：作为 flex 子项时默认 min-height:auto 会让它被内容
       * 撑开，而不是让内部滚动区接管溢出。
       *
       * 注意：这段注释里不能出现反引号 —— Angular 的 JIT 内联样式会被包进模板字面量，
       * 反引号会把它截断成语法错误（单测里表现为整个 spec 文件 parse 失败）。
       */
      :host {
        display: block;
        height: 100%;
        min-height: 0;
      }
    `
  ]
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

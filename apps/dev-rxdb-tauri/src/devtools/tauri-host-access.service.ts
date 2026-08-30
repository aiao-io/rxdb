import { Injectable, signal } from '@angular/core';
import type { DevToolsHostAccess, DevToolsHostAccessState } from '@modules/rxdb-devtools-panel';

/**
 * {@link DevToolsHostAccess} 的 Tauri 实现。
 *
 * @remarks
 * Tauri 里被检查页就是宿主自己的主 WebView，**天然可访问**——没有 Chrome 的
 * `optional_host_permissions` 授权 UI，也没有 `chrome://` 这类不可注入页面。所以授权状态恒为
 * `'granted'`，`requestAccess` 恒真。
 *
 * 脚本注入（{@link evaluate}）与重载（{@link reloadInspectedPage}）需要主进程把命令路由到
 * `main` 窗口，属于阶段 2 接真实 provider 时才用的能力；阶段 1 只用 fake provider 不碰这两条，
 * 因此先立成显式抛错，而不是静默空操作——静默空操作会把「没接线」伪装成「执行成功」。
 */
@Injectable({ providedIn: 'root' })
export class TauriHostAccessService implements DevToolsHostAccess {
  readonly state = signal<DevToolsHostAccessState>('granted');
  readonly error = signal<string | null>(null);

  async requestAccess(): Promise<boolean> {
    return true;
  }

  reloadInspectedPage(): void {
    // TODO(US-905 阶段 2)：经主进程重载 `main` 窗口。
    throw new Error('reloadInspectedPage is not wired for the Tauri host yet');
  }

  evaluate<T>(_code: string, _requestId: string): Promise<T> {
    // TODO(US-905 阶段 2)：经主进程在 `main` 窗口注入脚本。
    void _code;
    void _requestId;
    throw new Error('evaluate is not wired for the Tauri host yet');
  }
}

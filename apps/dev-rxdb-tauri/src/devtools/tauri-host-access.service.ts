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
 * # 脚本注入与重载：**决定不接**，不是欠账（US-905 阶段 2 定）
 *
 * {@link evaluate} 与 {@link reloadInspectedPage} 要成立，得有一条把命令路由到 `main` 窗口的
 * 通道。那条通道给出的能力是「调试窗口可以在被检查页里跑任意脚本」——它比调试窗口经
 * provider 能拿到的任何东西都大：provider 受 capability、descriptor 与 mutation policy 三层
 * 约束，而注入进去的脚本**在主窗口的授权上下文里**，那三层一条也管不着它。
 *
 * 阶段 2 接的是真实 SQLite 与原生文件 provider，两者都不需要这条通道；面板上唯一会碰
 * {@link evaluate} 的是 Settings 的清理按钮，而按 AC#12 那条路径本就应当以
 * `provider_unsupported` 收口（能力没声明就不执行），不是「先注入脚本再说」。
 *
 * 所以这两个方法保持显式抛错。抛错而不是静默空操作：空操作会把「没接线」伪装成「执行成功」。
 */
@Injectable({ providedIn: 'root' })
export class TauriHostAccessService implements DevToolsHostAccess {
  readonly state = signal<DevToolsHostAccessState>('granted');
  readonly error = signal<string | null>(null);

  async requestAccess(): Promise<boolean> {
    return true;
  }

  reloadInspectedPage(): void {
    throw new Error('reloadInspectedPage is deliberately not available to the Tauri devtools window');
  }

  // 必须是 async：签名承诺返回 Promise，同步抛出会绕过调用方的 `.catch` / `.finally`，
  // 于是「拒绝」这条错误炸在调用栈上，而挂在 finally 里的收尾（解锁 UI、清请求表）一条都不跑。
  async evaluate<T>(_code: string, _requestId: string): Promise<T> {
    void _code;
    void _requestId;
    throw new Error('evaluate is deliberately not available to the Tauri devtools window');
  }
}

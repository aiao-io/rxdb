import { Service } from '@angular/core';

import { DesktopWindow } from './desktop-window';

const describeFailure = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/**
 * 应用运行时（ADESK-US-206 阶段 A，D-18）：管应用实例的生命周期 `registered → loading → ready → closing → closed`，
 * 装载失败走 `failed`。窗口管理器只管窗口（层叠、焦点、最小化…），不知道每种应用怎么装载；
 * 应用载荷怎么来由登记表的 `load` 决定——Angular 组件是一次动态导入，同源 HTML 与远程应用的窗口组件
 * 也是动态导入，各自再在窗口里创建 iframe。
 *
 * 失败、关闭都只影响所在的窗口。重试创建**新实例**（新的实例序号），装载还在路上时被关闭或重试的旧实例，
 * 它迟到的结果按实例序号丢弃，不会让已关闭的窗口重新出现，也不会让新实例误判成已就绪。
 */
@Service({ autoProvided: false })
export class ApplicationRuntime {
  /** 开始（或重新开始）装载窗口里的应用：新建实例，进入 `loading`。 */
  start(win: DesktopWindow): void {
    const attempt = ++win.attempt;
    win.state.set('loading');
    win.failure.set(null);
    win.content.set(null);
    const load = win.app.load;
    if (!load) {
      this.fail(win, attempt, new Error(`“${win.app.name}” 没有登记应用载荷`));
      return;
    }
    load().then(
      component => this.ready(win, attempt, component),
      (error: unknown) => this.fail(win, attempt, error)
    );
  }

  /** 失败后重试：只对 `failed` 的窗口生效，创建新实例，不复用半初始化的组件。 */
  retry(win: DesktopWindow): void {
    if (win.state() === 'failed') this.start(win);
  }

  /**
   * 登记窗口但先不装载（ADESK-US-104）：窗口有意停在 `registered`，不请求应用载荷，等 {@link activate}。
   * 刷新后恢复窗口用它：最小化的窗口第一次还原才装载，终端、几猫3A大作这类重型应用第一次被点击才装载。
   * 只有刚登记、还没装载过的窗口能延后，其余状态是用法错误，直接抛出。
   */
  defer(win: DesktopWindow): void {
    if (win.state() !== 'registered' || win.attempt !== 0)
      throw new Error(`只有刚登记、还没装载过的窗口能延后（窗口 ${win.id} 现在是 ${win.state()}）`);
  }

  /**
   * 把延后的窗口装载起来：最小化的窗口第一次还原、延后的窗口第一次被点击时调用。
   * 只对 `registered` 的窗口生效；已经在装载、已就绪、失败（要走 {@link retry}）或正在关闭的窗口不受影响。
   */
  activate(win: DesktopWindow): void {
    if (win.state() === 'registered') this.start(win);
  }

  /** 窗口开始关闭：实例进入 `closing`，还在装载的旧结果从此被丢弃。 */
  closing(win: DesktopWindow): void {
    if (win.state() !== 'closed') win.state.set('closing');
  }

  /** 关闭动画结束，窗口已从列表移除：销毁组件引用。 */
  closed(win: DesktopWindow): void {
    win.state.set('closed');
    win.content.set(null);
  }

  /**
   * 窗口组件已装载，组件里的应用实例（remote-web 的 Orbit 实例）开始启动：窗口回到 `loading`，实例序号不变。
   * 窗口正在关闭或已关闭时不动，返回 false。
   */
  beginInstance(win: DesktopWindow): boolean {
    if (win.state() === 'closing' || win.state() === 'closed') return false;
    win.state.set('loading');
    win.failure.set(null);
    return true;
  }

  /**
   * 重试：在同一份已装载的载荷上创建**新实例**——实例序号加一（实例 ID 随之变化），回到 `loading`，不复用半初始化的实例。
   * 返回新的实例 ID；窗口正在关闭或已关闭时不动，返回 null。
   */
  renew(win: DesktopWindow): string | null {
    if (win.state() === 'closing' || win.state() === 'closed') return null;
    win.attempt++;
    this.beginInstance(win);
    return win.instanceId;
  }

  /** 应用实例就绪。只认当前实例 ID：旧实例迟到的 ready 被丢弃，不会让重试出来的新实例误判就绪。返回是否生效。 */
  instanceReady(win: DesktopWindow, instanceId: string): boolean {
    if (win.instanceId !== instanceId || win.state() !== 'loading') return false;
    win.state.set('ready');
    return true;
  }

  /**
   * 应用实例失败（装载超时、应用自报失败、运行中跳转或关闭连接）：窗口进入 `failed` 并带上原因。
   * 只认当前实例 ID，旧实例迟到的失败被丢弃；窗口正在关闭时也丢弃。返回是否生效。
   */
  instanceFailed(win: DesktopWindow, instanceId: string, reason: string): boolean {
    if (win.instanceId !== instanceId || (win.state() !== 'loading' && win.state() !== 'ready')) return false;
    win.failure.set(reason);
    win.state.set('failed');
    return true;
  }

  private ready(
    win: DesktopWindow,
    attempt: number,
    component: NonNullable<ReturnType<DesktopWindow['content']>>
  ): void {
    if (!this.live(win, attempt)) return;
    win.content.set(component);
    win.state.set('ready');
  }

  private fail(win: DesktopWindow, attempt: number, error: unknown): void {
    if (!this.live(win, attempt)) return;
    win.failure.set(describeFailure(error));
    win.state.set('failed');
  }

  /** 这次装载结果还算数：仍是当前实例、仍在装载中。 */
  private live(win: DesktopWindow, attempt: number): boolean {
    return win.attempt === attempt && win.state() === 'loading';
  }
}

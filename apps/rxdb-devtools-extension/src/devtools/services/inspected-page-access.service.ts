import { inject, Injectable, OnDestroy, signal } from '@angular/core';
import { executeInInspectedWindow, type DevToolsHostAccess } from '@modules/rxdb-devtools-panel';
import { PortService } from './port.service';

/**
 * 当前 inspected page 的按需 host 权限状态。
 *
 * @remarks
 * 与面板的 `DevToolsHostAccessState` 是同一组取值；此处保留别名只为扩展内部的可读性，
 * 真正的契约以 library 侧的 token 类型为准。
 */
export type InspectedPageAccessState = 'checking' | 'required' | 'requesting' | 'granted' | 'unsupported';

/**
 * 把 inspected page URL 转为 Chrome host permission pattern。
 *
 * @returns 可请求的当前 host pattern；不支持的协议或非法 URL 返回 `null`
 */
export function permissionPatternForUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'file:') return 'file:///*';
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.protocol}//${url.hostname}/*`;
  } catch {
    return null;
  }
}

/**
 * {@link DevToolsHostAccess} 的 Chrome 实现：按需站点权限 + inspected page 重载与注入求值。
 *
 * @remarks
 * `chrome.permissions` / `chrome.devtools.*` 全部止于本类，面板只认 token。
 */
@Injectable({ providedIn: 'root' })
export class InspectedPageAccessService implements DevToolsHostAccess, OnDestroy {
  private readonly portService = inject(PortService);
  private readonly navigationListener = (url: string): void => {
    this.portService.notifyNavigation();
    void this.refresh(url);
  };
  private revision = 0;
  private permissionPattern: string | null = null;

  readonly state = signal<InspectedPageAccessState>('checking');
  readonly error = signal<string | null>(null);

  constructor() {
    chrome.devtools.network.onNavigated.addListener(this.navigationListener);
    void this.refresh();
  }

  ngOnDestroy(): void {
    this.revision++;
    chrome.devtools.network.onNavigated.removeListener(this.navigationListener);
  }

  async requestAccess(): Promise<boolean> {
    const pattern = this.permissionPattern;
    if (!pattern) return false;
    this.state.set('requesting');
    this.error.set(null);
    const granted = await chrome.permissions.request({ origins: [pattern] });
    this.state.set(granted ? 'granted' : 'required');
    if (!granted) {
      this.error.set('未授予当前站点访问权限');
      return false;
    }
    this.portService.activateTab();
    return true;
  }

  /** 重载 inspected page。 */
  reloadInspectedPage(): void {
    chrome.devtools.inspectedWindow.reload({});
  }

  /**
   * 在 inspected page 启动脚本并等待匹配 `requestId` 的异步结果。
   *
   * @throws 页面拒绝启动、脚本执行失败或等待超时时抛出错误
   */
  evaluate<T>(code: string, requestId: string): Promise<T> {
    return executeInInspectedWindow<T>(this.portService, chrome.devtools.inspectedWindow, code, requestId);
  }

  private async refresh(url?: string): Promise<void> {
    const revision = ++this.revision;
    this.state.set('checking');
    this.error.set(null);
    const inspectedUrl = url ?? (await this.getInspectedUrl());
    if (revision !== this.revision) return;
    const pattern = permissionPatternForUrl(inspectedUrl ?? '');
    this.permissionPattern = pattern;
    if (!pattern) {
      this.state.set('unsupported');
      return;
    }
    const granted = await chrome.permissions.contains({ origins: [pattern] });
    if (revision !== this.revision) return;
    this.state.set(granted ? 'granted' : 'required');
    if (granted) this.portService.activateTab();
  }

  private getInspectedUrl(): Promise<string | null> {
    return new Promise(resolve => {
      chrome.devtools.inspectedWindow.eval<string>('location.href', (result, exceptionInfo) => {
        resolve(exceptionInfo?.isError || exceptionInfo?.isException || typeof result !== 'string' ? null : result);
      });
    });
  }
}

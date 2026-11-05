/**
 * 管理后台接口的前端封装（US-713）：每次请求带当前会话的 access token，错误转成带服务端说明的 Error。
 */
import { inject, Injectable } from '@angular/core';
import type {
  AdminAccountPage,
  AdminBanResult,
  AdminDeleteAccountResult,
  AdminKickResult,
  AdminOnlineDevice,
  AdminSelf,
  AdminServerFiles
} from '../../../shared/admin-protocol';
import { AuthService } from '../auth/auth.service';

const errorMessageOf = async (response: Response): Promise<string> => {
  const body = (await response.json().catch(() => null)) as { readonly error?: unknown } | null;
  return typeof body?.error === 'string' && body.error ? body.error : `管理接口返回 HTTP ${response.status}`;
};

/** Worker 的 `/api/admin/*`。 */
@Injectable({ providedIn: 'root' })
export class AdminApi {
  readonly #auth = inject(AuthService);

  /** 当前登录者是不是管理员；只用来决定入口显不显示，权限由服务端判定。 */
  me(): Promise<AdminSelf> {
    return this.#send('GET', '/me');
  }

  /** 一页账号（每页条数见 `ADMIN_ACCOUNTS_PAGE_SIZE`）。 */
  accounts(page: number): Promise<AdminAccountPage> {
    return this.#send('GET', `/accounts?page=${page}`);
  }

  /** 信令上在线的设备。 */
  async online(): Promise<readonly AdminOnlineDevice[]> {
    return (await this.#send<{ readonly devices: readonly AdminOnlineDevice[] }>('GET', '/online')).devices;
  }

  /** 服务器（R2）上的文件副本。 */
  files(): Promise<AdminServerFiles> {
    return this.#send('GET', '/files');
  }

  /** 封禁账号并断开它在线的设备。 */
  ban(userId: string): Promise<AdminBanResult> {
    return this.#send('POST', `/accounts/${encodeURIComponent(userId)}/ban`);
  }

  /** 解封账号。 */
  unban(userId: string): Promise<void> {
    return this.#send('POST', `/accounts/${encodeURIComponent(userId)}/unban`);
  }

  /** 删除账号及其设备登记与持有声明。 */
  deleteAccount(userId: string): Promise<AdminDeleteAccountResult> {
    return this.#send('DELETE', `/accounts/${encodeURIComponent(userId)}`);
  }

  /** 让一台在线设备下线。 */
  kick(deviceId: string): Promise<AdminKickResult> {
    return this.#send('POST', `/devices/${encodeURIComponent(deviceId)}/kick`);
  }

  /** 删除服务器上的文件副本。 */
  deleteFile(contentHash: string): Promise<void> {
    return this.#send('DELETE', `/files/${encodeURIComponent(contentHash)}`);
  }

  async #send<T>(method: string, path: string): Promise<T> {
    const token = await this.#auth.accessToken();
    const response = await fetch(`/api/admin${path}`, { method, headers: { authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(await errorMessageOf(response));
    return (response.status === 204 ? undefined : await response.json()) as T;
  }
}

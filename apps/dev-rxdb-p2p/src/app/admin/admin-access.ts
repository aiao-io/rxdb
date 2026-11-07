/**
 * 当前登录者是不是管理员（US-713）：只决定「管理后台」入口显不显示、`/admin` 放不放行，真正的权限由服务端判定。
 */
import { inject, Injectable, signal } from '@angular/core';
import { AdminApi } from './admin-api';

/** 管理员身份，向服务端问一次后缓存。 */
@Injectable({ providedIn: 'root' })
export class AdminAccess {
  readonly #api = inject(AdminApi);
  readonly #admin = signal(false);
  #checking: Promise<boolean> | undefined;
  /** 是否管理员；服务端确认之前一律为 false。 */
  readonly isAdmin = this.#admin.asReadonly();

  /**
   * 向服务端确认身份：并发与重复调用共用同一次请求；失败时不缓存，下一次调用会重试。
   *
   * @throws Error 管理接口不可达或拒绝了会话
   */
  check(): Promise<boolean> {
    this.#checking ??= this.#api.me().then(
      ({ admin }) => {
        this.#admin.set(admin);
        return admin;
      },
      (error: unknown) => {
        this.#checking = undefined;
        throw error;
      }
    );
    return this.#checking;
  }
}

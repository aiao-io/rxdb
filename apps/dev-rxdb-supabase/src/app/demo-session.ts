import { RXDB_ANONYMOUS_SUBJECT } from '@aiao/rxdb';
import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import { joinTenant } from './catalog/catalog-remote';
import { currentIdentityChoice, describeIdentity } from './demo-identity';
import { getErrorMessage } from './error-message';
import { getPreparedSession, type PreparedSession } from './setup_rxdb_wa-sqlite';
import { DEMO_ACCOUNTS, signInAnonymousUser, signInDemoAccount, signOutToVisitor } from './supabase-session';

/**
 * 本页面打开的是哪个身份的库，以及切换身份。
 *
 * @remarks
 * 本地库在创建 RxDB 时按会话身份定下来（US-035），所以切换身份 = 登录或退出之后重新加载页面，
 * 由启动流程按新的会话打开那个身份自己的库。会话保存在浏览器里，所有标签页共用：
 * 别的标签页换了身份，本页还开着上一个身份的库，同步会被身份守卫拦下（报身份不匹配），这里提示重新加载。
 */
@Injectable({ providedIn: 'root' })
export class DemoSession {
  readonly #document = inject(DOCUMENT);
  readonly #switching = signal(false);
  readonly #error = signal<string | null>(null);
  readonly #sessionMoved = signal(false);

  /** 远端模式的会话；本地模式（没有 Supabase 配置）为 `undefined` */
  readonly prepared: PreparedSession | undefined = getPreparedSession();
  /** 当前身份的名字与说明；本地模式为 `undefined` */
  readonly description = this.prepared && describeIdentity(this.prepared.session);
  /** 当前身份对应切换菜单里的哪一项 */
  readonly currentChoice = this.prepared ? currentIdentityChoice(this.prepared.session) : null;
  /** 匿名用户或账号：数据库角色 authenticated；访客没有会话 */
  readonly signedIn = this.prepared !== undefined && this.prepared.session.kind !== 'visitor';
  /** Todo 走未分区的日志同步，只对登录身份开放（US-225）；访客的 Todo 只存本地 */
  readonly canSyncTodo = this.signedIn;

  /** 正在登录或退出 */
  readonly $switching = this.#switching.asReadonly();
  /** 上一次切换失败的原因 */
  readonly $error = this.#error.asReadonly();
  /** 浏览器里的会话已经换成另一个身份，本页还开着上一个身份的库 */
  readonly $sessionMoved = this.#sessionMoved.asReadonly();

  constructor() {
    const prepared = this.prepared;
    if (!prepared) return;
    prepared.client.auth.onAuthStateChange((_event, session) => {
      const subject = session?.user.id ?? RXDB_ANONYMOUS_SUBJECT;
      if (subject !== prepared.identity.subject && !this.#switching()) this.#sessionMoved.set(true);
    });
  }

  /**
   * 切换到菜单里的一个身份：登录或退出，然后重新加载，打开那个身份自己的本地库。
   *
   * @param choice - {@link IDENTITY_CHOICES} 里的 `key`
   */
  async switchTo(choice: string): Promise<void> {
    const prepared = this.prepared;
    if (!prepared || choice === this.currentChoice || this.#switching()) return;
    this.#switching.set(true);
    this.#error.set(null);
    try {
      await signInAs(prepared, choice);
      this.reload();
    } catch (error) {
      this.#error.set(getErrorMessage(error, '切换身份失败'));
      this.#switching.set(false);
    }
  }

  /** 重新加载页面，按浏览器里当前的会话打开对应身份的库 */
  reload(): void {
    this.#document.defaultView?.location.reload();
  }
}

function signInAs(prepared: PreparedSession, choice: string): Promise<void> {
  const auth = prepared.client.auth;
  if (choice === 'visitor') return signOutToVisitor(auth);
  if (choice === 'anonymous') return signInAnonymousUser(auth);
  const account = DEMO_ACCOUNTS.find(item => item.id === choice);
  if (!account) return Promise.reject(new Error(`未知的身份：${choice}`));
  return signInDemoAccount(auth, account, () => joinTenant(prepared.client, account.tenantId));
}

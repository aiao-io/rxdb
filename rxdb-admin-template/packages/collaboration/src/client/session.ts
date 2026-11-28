import type { RxDBIdentity } from '@aiao/rxdb';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { CollaborationError, demand, type Identity } from '../model.js';
import { CollaborationApi } from './api.js';

/** 提示的语气：一般说明、成功、需要留意（如实时连接中断）与失败。 */
export type MessageTone = 'info' | 'success' | 'warning' | 'error';

/** 命令入口下发的公开配置：Supabase 地址与公开 key（anon / publishable）。 */
export interface AuthConfig {
  supabaseUrl: string;
  supabaseKey: string;
}

/**
 * Supabase Auth（GoTrue）的错误码到协作词条与错误类别。
 *
 * @remarks
 * GoTrue 的 `message` 是英文、随版本变化，直接显示会让中文界面冒出一句英文原文；错误码才是稳定的契约。
 * 类别刻意不用 `unauthenticated`：协作控制器遇到它会让会话失效，而这里是登录之前的输入错误。
 */
const authFailures: Readonly<Record<string, { code: string; message: string }>> = {
  otp_expired: { code: 'invalid', message: '验证码已过期或无效，请重新获取' },
  email_address_invalid: { code: 'invalid', message: '邮箱地址无效' },
  over_email_send_rate_limit: { code: 'limit', message: '发送过于频繁，请稍后再试' },
  over_request_rate_limit: { code: 'limit', message: '请求过于频繁，请稍后再试' }
};

/**
 * 把 Supabase Auth 返回的错误换成带协作词条的 {@link CollaborationError}；不认识的错误码统一提示「登录失败」，
 * 原始错误码与 HTTP 状态留在 `details` 里，供运维排查。
 */
function authFailure(error: Error & { code?: unknown; status?: unknown }): CollaborationError {
  const authCode = typeof error.code === 'string' ? error.code : null;
  const known = authCode !== null && Object.hasOwn(authFailures, authCode) ? authFailures[authCode] : undefined;
  const { code, message } = known ?? { code: 'unavailable', message: '登录失败，请稍后重试' };
  return new CollaborationError(code, message, {
    authCode,
    status: typeof error.status === 'number' ? error.status : null
  });
}

/** 缓存授权：最近一次联网验证过的身份与它的到期时刻；离线冷启动只信任未过期的授权。 */
interface Grant {
  user: Identity;
  expiresAt: number;
}

/**
 * 应用的全局登录会话（ADMIN-US-201）：邮箱验证码登录、会话恢复与退出，整个应用共用一个。
 *
 * @remarks
 * 一个页面里只能有一个 Supabase 认证客户端（多个实例会争抢同一份本机会话与令牌刷新），所以登录页、顶栏账号菜单、
 * 路由守卫与团队协作都用 {@link authSession} 拿到的同一个实例。身份的规则：
 * - 在线：本机缓存的会话必须经 Auth 的 `getUser` 确认（账号仍存在、邮箱已验证）才算登录，确认后写下缓存授权；
 * - 离线：信任本机缓存的会话或未过期的缓存授权，不访问 Auth；
 * - 退出：清除缓存授权、通知同一浏览器的其他页面，再清除本机会话。
 *
 * 身份每次确认或变化都派发 `identity` 事件（团队协作据此登记任务账本、重读可访问团队）；任何可见状态变化都派发 `change`。
 * 加载 supabase-js 推迟到 {@link AuthSession.initialize}，它不进应用的首屏入口。
 */
export class AuthSession extends EventTarget {
  private started?: Promise<void>;
  /** 本次 {@link AuthSession.initialize} 用的公开配置；初始化完成之后才有。 */
  private config?: AuthConfig;
  private epoch = 0;
  private unsubscribe?: () => void;
  private readonly channel = new BroadcastChannel('admin-collaboration-session');
  /** 退出前的检查（编辑界面还有没保存的输入等），任一抛错即拒绝退出。 */
  private readonly guards = new Set<() => void>();
  /** Supabase 认证客户端；{@link AuthSession.initialize} 完成后才存在。 */
  auth?: SupabaseClient;
  /** 当前已确认的身份；未登录、已退出或会话失效时为 null。 */
  user: Identity | null = null;
  /** 当前身份的到期时刻（毫秒）：在线时取会话的到期时刻，离线时取缓存授权或本机会话的到期时刻。 */
  expiresAt = 0;
  /** 身份是否经过联网确认：离线冷启动恢复的身份为 false。 */
  online = navigator.onLine;
  /** 登录相关的最近一条提示（验证码已发送、验证码错误等），登录页显示它。 */
  message = '';
  messageTone: MessageTone = 'info';

  /** 是否已登录（有确认过的身份）。 */
  get signedIn(): boolean {
    return this.user !== null;
  }

  /**
   * @param base 协作 HTTP 接口的路径前缀（公开配置从 `${base}/config` 读取）。
   * @param loadConfig 读取公开配置；默认经协作命令入口读取。
   */
  constructor(
    readonly base: string,
    private readonly loadConfig: () => Promise<AuthConfig> = () =>
      new CollaborationApi(
        base,
        async () => '',
        () => 0
      ).config()
  ) {
    super();
    this.channel.onmessage = event => {
      if (event.data?.type === 'logout' && event.data.userId === this.user?.id) this.signOut();
    };
  }

  /**
   * 本机库的身份（ADMIN-US-222）：按它命名并绑定本机工作台库与团队库，换了账号就是另一个库。
   *
   * @returns `scope` 是 Supabase 项目 URL 的 origin，与 `rxdb-adapter-supabase` 的 `callerIdentity()` 同一口径；
   *   `subject` 是账号 id。没有身份（从没登录过、已退出、会话失效）时为 null
   *
   * @remarks
   * {@link AuthSession.initialize} 完成之前，取本机记下的最近一次确认的身份与公开配置：应用要在首屏之前同步建库，
   * 这时还没有联网确认。登录门禁随后按会话重新确认，确认出别的账号时应用重新载入页面、换到那个账号的库。
   * 初始化完成之后只认当前确认的身份。
   */
  databaseIdentity(): RxDBIdentity | null {
    const user = this.config ? this.user : this.readGrant()?.user;
    const config = this.config ?? this.readConfig();
    if (!user || !config) return null;
    return { scope: new URL(config.supabaseUrl.trim()).origin, subject: user.id };
  }

  /**
   * 打开 `userId` 的本机库要用的身份（ADMIN-US-222）：会话已经不是这个用户（另一个页面换了账号、或已经退出）时
   * 按会话失效处理，不替别人打开库。
   *
   * @param userId - 要打开的库所属的账号 id
   * @returns 这个账号的库身份，口径同 {@link AuthSession.databaseIdentity}
   * @throws CollaborationError `unauthenticated`：会话没有身份，或不是这个账号
   */
  databaseIdentityFor(userId: string): RxDBIdentity {
    const identity = this.databaseIdentity();
    demand(identity?.subject === userId, 'unauthenticated', '会话已失效，请重新登录');
    return identity;
  }

  /** 设置登录提示与语气（不派发事件，调用方随后 `changed()`）；传空串即清除。 */
  notify(message: string, tone: MessageTone = 'info'): void {
    this.message = message;
    this.messageTone = tone;
  }

  /** 通知界面重绘（派发 `change`）。 */
  changed(): void {
    this.dispatchEvent(new Event('change'));
  }

  /**
   * 建立认证客户端并恢复身份；可以重复调用，只在第一次真正执行，之后返回同一个结果。
   * 在线时读取公开配置（并缓存）、按本机会话确认身份；离线时用缓存的配置与未过期的缓存授权，首次使用必须联网。
   */
  initialize(): Promise<void> {
    // 失败（例如读不到公开配置）不缓存：下一次调用重新尝试
    this.started ??= this.start().catch((error: unknown) => {
      this.started = undefined;
      throw error;
    });
    return this.started;
  }

  /**
   * 登记退出前的检查：检查抛错（例如 `unsaved`）即拒绝退出，错误交给调用方显示。
   * @returns 撤销这项检查的函数。
   */
  guardLogout(check: () => void): () => void {
    this.guards.add(check);
    return () => this.guards.delete(check);
  }

  /** 向邮箱发送一次性验证码。 */
  async sendCode(email: string): Promise<void> {
    demand(this.auth, 'configuration', '认证未配置');
    const { error } = await this.auth.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
    if (error) throw authFailure(error);
    this.notify('验证码已发送，请检查邮箱', 'success');
    this.changed();
  }

  /** 校验邮箱验证码并建立会话；成功后清掉登录提示。 */
  async verify(email: string, token: string): Promise<void> {
    demand(this.auth, 'configuration', '认证未配置');
    const { data, error } = await this.auth.auth.verifyOtp({ email, token, type: 'email' });
    if (error) throw authFailure(error);
    await this.accept(data.session);
    this.notify('');
    this.changed();
  }

  /** 网络恢复后刷新会话并重新确认身份；离线或未登录时只更新在线状态。 */
  async reconnect(): Promise<void> {
    if (!navigator.onLine) this.online = false;
    if (!navigator.onLine || !this.auth || !this.user) {
      this.changed();
      return;
    }
    const { data, error } = await this.auth.auth.refreshSession();
    demand(!error && data.session, 'unauthenticated', '会话已过期，请重新登录');
    await this.accept(data.session);
  }

  /** 主动退出：清除身份与缓存授权，通知同一浏览器的其他页面，再清除本机会话。 */
  async logout(): Promise<void> {
    for (const check of this.guards) check();
    const userId = this.user?.id;
    this.signOut();
    this.channel.postMessage({ type: 'logout', userId });
    if (this.auth) await this.auth.auth.signOut({ scope: 'local' });
  }

  /** 身份不再成立（会话失效、被拒绝、其他页面退出）：清除身份与缓存授权，派发 `identity` 与 `change`。 */
  signOut(): void {
    this.epoch++;
    localStorage.removeItem(this.grantKey());
    this.user = null;
    this.expiresAt = 0;
    this.dispatchEvent(new Event('identity'));
    this.changed();
  }

  /** 释放：不再监听认证事件与其他页面的退出广播。 */
  dispose(): void {
    this.epoch++;
    this.unsubscribe?.();
    this.channel.close();
  }

  private grantKey(): string {
    return `admin-collaboration-grant:${this.base}`;
  }

  private configKey(): string {
    return `admin-collaboration-config:${this.base}`;
  }

  /** 本机记下的缓存授权：最近一次联网确认的身份与它的到期时刻；没有时为 null。 */
  private readGrant(): Grant | null {
    const cached = localStorage.getItem(this.grantKey());
    return cached ? (JSON.parse(cached) as Grant) : null;
  }

  /** 本机缓存的公开配置：最近一次联网读到的；没有时为 null。 */
  private readConfig(): AuthConfig | null {
    const cached = localStorage.getItem(this.configKey());
    return cached ? (JSON.parse(cached) as AuthConfig) : null;
  }

  private async start(): Promise<void> {
    let config: AuthConfig;
    if (navigator.onLine) {
      config = await this.loadConfig();
      localStorage.setItem(this.configKey(), JSON.stringify(config));
    } else {
      const cached = this.readConfig();
      demand(cached, 'offline', '首次使用需要联网登录');
      config = cached;
    }
    this.config = config;
    const { createClient } = await import('@supabase/supabase-js');
    this.auth = createClient(config.supabaseUrl, config.supabaseKey, {
      auth: {
        storageKey: `admin-collaboration-auth:${config.supabaseUrl}`,
        detectSessionInUrl: false,
        autoRefreshToken: true
      }
    });
    if (navigator.onLine) {
      const { data } = await this.auth.auth.getSession();
      await this.accept(data.session);
    } else this.restoreGrant();
    const { data } = this.auth.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return;
      if (event === 'SIGNED_OUT') {
        // 离线时会话自然过期：已确认的身份留在本机继续可用，联网后重新确认
        if (navigator.onLine || !this.user) this.signOut();
        return;
      }
      queueMicrotask(() => {
        void this.accept(session).catch((error: unknown) => {
          this.notify(error instanceof Error ? error.message : '登录失败，请稍后重试', 'error');
          this.changed();
        });
      });
    });
    this.unsubscribe = () => data.subscription.unsubscribe();
  }

  /**
   * 离线时恢复身份：只信任上次在线确认过、未过期的缓存授权；没有、已过期，或不属于给定账号时保持原样（冷启动即未登录）。
   * @param userId supabase-js 离线恢复出的本机会话所属的账号；冷启动时不传。
   */
  private restoreGrant(userId?: string): void {
    const grant = this.readGrant();
    this.online = false;
    if (grant && grant.expiresAt > Date.now() && (userId === undefined || grant.user.id === userId)) {
      this.user = grant.user;
      this.expiresAt = grant.expiresAt;
      this.dispatchEvent(new Event('identity'));
    }
    this.changed();
  }

  /**
   * 接受一份会话：没有会话即退出；离线时不访问 Auth，也不信任本机存着的会话——supabase-js 启动时会从本机存储恢复会话并发出
   * `SIGNED_IN`，只按缓存授权恢复同一账号（见 `restoreGrant`）；在线时经 `getUser` 确认账号仍存在、邮箱已验证，
   * 确认后写下缓存授权。确认失败按会话失效处理（退出）并抛出 `unauthenticated`。期间又有新的会话到达时丢弃旧结果。
   */
  private async accept(session: Session | null): Promise<void> {
    const epoch = ++this.epoch;
    if (!session) {
      this.signOut();
      return;
    }
    if (!navigator.onLine) {
      this.restoreGrant(session.user.id);
      return;
    }
    demand(this.auth, 'configuration', '认证未配置');
    const { data, error } = await this.auth.auth.getUser(session.access_token);
    if (epoch !== this.epoch) return;
    if (error || !data.user?.email || !data.user.email_confirmed_at) {
      this.signOut();
      throw new CollaborationError('unauthenticated', '请重新验证邮箱');
    }
    this.user = { id: data.user.id, email: data.user.email, verified: true };
    this.expiresAt = (session.expires_at ?? 0) * 1000;
    this.online = true;
    localStorage.setItem(this.grantKey(), JSON.stringify({ user: this.user, expiresAt: this.expiresAt }));
    this.dispatchEvent(new Event('identity'));
    this.changed();
  }
}

const sessions = new Map<string, AuthSession>();

/**
 * 应用共用的全局会话：同一接口前缀只有一个实例（一个页面里只能有一个 Supabase 认证客户端）。
 * 登录页、顶栏账号菜单、路由守卫与团队协作都从这里取。
 * @param base 协作 HTTP 接口的路径前缀，默认 `/collaboration-api`。
 */
export function authSession(base = '/collaboration-api'): AuthSession {
  let session = sessions.get(base);
  if (!session) {
    session = new AuthSession(base);
    sessions.set(base, session);
  }
  return session;
}

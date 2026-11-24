import type { InstallationStatus } from '@aiao-media/api-contracts';
import { AdminLayoutComponent, AdminPageDirective } from '@aiao/rxdb-admin-angular';
import { DOCUMENT } from '@angular/common';
import { Component, computed, DestroyRef, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { LucideClapperboard as Clapperboard, LucideDynamicIcon } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { AdminAccount } from './admin-account';
import { AdminAccountMenu } from './admin-account-menu';
import { AdminAccountState } from './admin-account-state';
import { AdminSupabaseAuth, type AdminSession } from './admin-auth';
import { AdminConfigModelComponent } from './admin-config-model';
import { AdminConsole } from './admin-console';
import { AdminPlatformConfigComponent } from './admin-platform-config';
import { AdminConfigDatabaseHost } from './admin-rxdb';
import { ADMIN_MENU, bindAdminNavigator, tabFromUrl } from './admin-shell';
import { ProductClient } from './product-client';

export const ADMIN_SESSION_STORAGE_KEY = 'aiao-media-admin-session-v1';

function isSession(value: unknown): value is AdminSession {
  if (!value || typeof value !== 'object') return false;
  const session = value as Partial<AdminSession>;
  return (
    typeof session.accessToken === 'string' &&
    session.accessToken.length > 0 &&
    typeof session.expiresAt === 'number' &&
    Number.isFinite(session.expiresAt) &&
    typeof session.user === 'object' &&
    session.user !== null &&
    typeof session.user.id === 'string' &&
    session.user.id.length > 0 &&
    (session.user.email === undefined || session.user.email === null || typeof session.user.email === 'string')
  );
}

function readStoredSession(): AdminSession | null {
  const raw = localStorage.getItem(ADMIN_SESSION_STORAGE_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (!isSession(value) || value.expiresAt <= Date.now()) {
      localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
      return null;
    }
    return value;
  } catch {
    localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    return null;
  }
}

@Component({
  imports: [
    AdminAccount,
    AdminAccountMenu,
    AdminConsole,
    AdminConfigModelComponent,
    AdminPlatformConfigComponent,
    AdminLayoutComponent,
    AdminPageDirective,
    FormsModule,
    LucideDynamicIcon
  ],
  selector: 'aiao-media-admin-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly router = inject(Router);
  private authClient: AdminSupabaseAuth | null = null;
  private readonly configHost = inject(AdminConfigDatabaseHost);
  private readonly document = inject(DOCUMENT);
  readonly installation = signal<InstallationStatus | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly session = signal<AdminSession | null>(null);
  readonly menu = ADMIN_MENU;
  readonly Clapperboard = Clapperboard;
  readonly url = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(event => event.urlAfterRedirects)
    ),
    { initialValue: this.router.url }
  );
  readonly routeTab = computed(() => tabFromUrl(this.url()));
  readonly navigating = toSignal(
    this.router.events.pipe(
      filter(
        event =>
          event instanceof NavigationStart ||
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError
      ),
      map(event => event instanceof NavigationStart)
    ),
    { initialValue: false }
  );
  readonly form = {
    email: '',
    password: '',
    confirmation: '',
    bootstrapSecret: '',
    supabaseUrl: '',
    anonKey: '',
    serviceRoleKey: ''
  };
  readonly client = new ProductClient(async () => {
    if (!this.authClient || !this.session()) {
      this.logout();
      throw new Error('登录已过期，请重新登录。');
    }
    return this.authClient.authorization();
  });
  readonly account = new AdminAccountState(this.client);
  readonly accountPage = computed(() => this.url().split(/[?#]/, 1)[0].replace(/\/$/, '') === '/account');

  constructor() {
    effect(() => {
      const userId = this.session()?.user.id ?? null;
      untracked(() => void this.account.connect(userId));
    });
    inject(DestroyRef).onDestroy(() => void this.account.connect(null));
  }

  ngOnInit(): void {
    bindAdminNavigator(url => void this.router.navigateByUrl(url));
    void this.load();
  }
  async load(): Promise<void> {
    await this.run(async () => {
      const installation = await this.request<InstallationStatus>('/api/installation');
      this.installation.set(installation);
      if (!installation.initialized || !installation.auth) {
        this.logout();
        return;
      }
      this.authClient = new AdminSupabaseAuth(installation.auth);
      this.session.set(await this.authClient.restore(readStoredSession()));
    });
  }
  async initialize(): Promise<void> {
    if (this.form.password !== this.form.confirmation) {
      this.message.set('两次输入的密码不一致。');
      return;
    }
    await this.run(async () => {
      const { email, password, bootstrapSecret, supabaseUrl, anonKey, serviceRoleKey } = this.form;
      await this.request('/api/installation', {
        email,
        password,
        bootstrapSecret,
        ...(this.installation()?.managed ? {} : { supabaseUrl, anonKey, serviceRoleKey })
      });
      this.form.password = this.form.confirmation = this.form.bootstrapSecret = this.form.serviceRoleKey = '';
      this.installation.set(await this.request('/api/installation'));
      this.message.set('初始化完成，请使用管理员账号登录。');
    });
  }
  async login(): Promise<void> {
    await this.run(async () => {
      if (!this.authClient) throw new Error('账号服务尚未准备好，请重新检查安装状态。');
      const session = await this.authClient.signIn(this.form.email, this.form.password);
      this.session.set(session);
      try {
        await this.client.admin('session');
      } catch (error) {
        this.logout();
        throw error;
      }
      localStorage.setItem(ADMIN_SESSION_STORAGE_KEY, JSON.stringify(session));
      this.form.password = '';
      await this.router.navigateByUrl('/users');
    });
  }
  navigateToTab(tab: string): void {
    void this.router.navigateByUrl(`/${tab}`);
  }
  logout(): void {
    this.session.set(null);
    void this.account.connect(null);
    localStorage.removeItem(ADMIN_SESSION_STORAGE_KEY);
    this.form.password = '';
    void this.authClient?.signOut().catch(() => undefined);
    // 配置库按账号打开且其实例被根注入器缓存：关闭后重新加载页面，下一个账号拿到自己的库。
    if (this.configHost.isOpen()) void this.configHost.close().finally(() => this.document.location.reload());
  }
  private async run(operation: () => Promise<void>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true);
    this.message.set('');
    try {
      await operation();
    } catch (error) {
      this.message.set(error instanceof Error ? error.message : '请求失败，请重试。');
    } finally {
      this.busy.set(false);
    }
  }
  private async request<T>(url: string, payload?: unknown): Promise<T> {
    const response = await fetch(url, {
      method: payload === undefined ? 'GET' : 'POST',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(30000),
      headers: { 'content-type': 'application/json' },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
    if (!response.ok) {
      const result = (await response.json()) as { error?: string };
      throw new Error(result.error ?? '服务暂不可用，请重试。');
    }
    return response.json() as Promise<T>;
  }
}

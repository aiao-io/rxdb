import type { InstallationStatus } from '@aiao-media/api-contracts';
import { AdminLayoutComponent, AdminPageDirective } from '@aiao/rxdb-admin-angular';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router } from '@angular/router';
import { LucideClapperboard as Clapperboard, LucideDynamicIcon } from '@lucide/angular';
import { filter, map } from 'rxjs';
import { AdminConsole } from './admin-console';
import { ADMIN_MENU, bindAdminNavigator, tabFromUrl } from './admin-shell';
import { ProductClient } from './product-client';

interface Session {
  accessToken: string;
  expiresAt: number;
  user: { id: string; email?: string };
}

@Component({
  imports: [AdminConsole, AdminLayoutComponent, AdminPageDirective, FormsModule, LucideDynamicIcon],
  selector: 'aiao-media-admin-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  private readonly router = inject(Router);
  readonly installation = signal<InstallationStatus | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly session = signal<Session | null>(null);
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
    const session = this.session();
    const config = this.installation()?.auth;
    if (!session || !config || session.expiresAt <= Date.now()) {
      this.logout();
      throw new Error('登录已过期，请重新登录。');
    }
    return {
      config,
      session: { access_token: session.accessToken },
      userId: session.user.id
    };
  });
  ngOnInit(): void {
    bindAdminNavigator(url => void this.router.navigateByUrl(url));
    void this.load();
  }
  async load(): Promise<void> {
    await this.run(async () => {
      this.installation.set(await this.request('/api/installation'));
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
      const session = await this.request<Session>('/api/admin/login', {
        email: this.form.email,
        password: this.form.password
      });
      this.session.set(session);
      this.form.password = '';
      await this.router.navigateByUrl('/users');
    });
  }
  navigateToTab(tab: string): void {
    void this.router.navigateByUrl(`/${tab}`);
  }
  logout(): void {
    this.session.set(null);
    this.form.password = '';
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

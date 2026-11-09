import type { InstallationStatus } from '@aiao-media/api-contracts';
import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminConsole } from './admin-console';
import { ProductClient } from './product-client';

interface Session {
  accessToken: string;
  expiresAt: number;
  user: { id: string; email?: string };
}

@Component({
  imports: [AdminConsole, FormsModule],
  selector: 'aiao-media-admin-root',
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App implements OnInit {
  readonly installation = signal<InstallationStatus | null>(null);
  readonly busy = signal(false);
  readonly message = signal('');
  readonly session = signal<Session | null>(null);
  readonly form = {
    email: '',
    password: '',
    confirmation: '',
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
      const { email, password, supabaseUrl, anonKey, serviceRoleKey } = this.form;
      await this.request('/api/installation', {
        email,
        password,
        ...(this.installation()?.managed ? {} : { supabaseUrl, anonKey, serviceRoleKey })
      });
      this.form.password = this.form.confirmation = this.form.serviceRoleKey = '';
      this.installation.set(await this.request('/api/installation'));
      this.message.set('初始化完成，请使用管理员账号登录。');
    });
  }
  async login(): Promise<void> {
    await this.run(async () => {
      this.session.set(
        await this.request('/api/admin/login', { email: this.form.email, password: this.form.password })
      );
      this.form.password = '';
    });
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

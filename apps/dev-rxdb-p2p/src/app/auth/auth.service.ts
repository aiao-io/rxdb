/**
 * 认证宿主（Supabase Auth）的前端：邮箱 + 密码登录，会话由 supabase-js 持久化并自动续期。
 */
import { Injectable, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { readRuntimeConfig } from '../config/runtime-config';

/** 登录状态。 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  readonly #session = signal<Session | null>(null);
  /** 已按当前用户身份发请求的 Supabase 客户端。 */
  readonly client: SupabaseClient;
  /** 当前会话；未登录时为 null。 */
  readonly session = this.#session.asReadonly();
  /** 本地保存的会话已读回。 */
  readonly restored: Promise<void>;

  constructor() {
    const { supabaseUrl, supabaseAnonKey } = readRuntimeConfig();
    this.client = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'dev-rxdb-p2p-auth' }
    });
    this.client.auth.onAuthStateChange((_event, session) => this.#session.set(session));
    this.restored = this.client.auth.getSession().then(({ data }) => this.#session.set(data.session));
  }

  /** 登录。 */
  async signIn(email: string, password: string): Promise<void> {
    const { error } = await this.client.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }

  /**
   * 注册并登录。
   *
   * @throws Error 项目要求先验证邮箱（本地栈关掉了验证，托管项目按其设置）
   */
  async signUp(email: string, password: string): Promise<void> {
    const { data, error } = await this.client.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) throw new Error('注册成功，请先打开邮件里的验证链接，再回来登录');
  }

  /** 当前有效的 access token（快过期时 supabase-js 先续期）。 */
  async accessToken(): Promise<string> {
    const { data, error } = await this.client.auth.getSession();
    if (error) throw error;
    if (!data.session) throw new Error('not signed in');
    return data.session.access_token;
  }

  /** 退出并整页重载：本地库的实体类只能绑定一个实例，换用户时重新开始。 */
  async signOut(): Promise<void> {
    const { error } = await this.client.auth.signOut();
    if (error) throw error;
    location.assign('/login');
  }
}

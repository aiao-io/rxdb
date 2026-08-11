/**
 * @fileoverview Supabase Adapter 核心类型定义
 */

import type { IRxDBAdapterOptions } from '@aiao/rxdb';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRlsCheckTable {
  /** 目标 schema，默认 public */
  schema?: string;

  /** 目标表名 */
  table: string;
}

export interface SupabaseRlsCheckOptions {
  /** 自检使用的 RPC 名称 */
  rpcName?: string;

  /** 检查失败时仅告警还是直接阻断连接 */
  failureMode?: 'warn' | 'throw';

  /** 自定义要检查的表；默认从 rxdb.entities 推导 */
  tables?: SupabaseRlsCheckTable[];
}

/**
 * Supabase Adapter 配置选项
 *
 * 支持两种初始化方式：
 * 1. 传入 URL + Key，适配器内部创建客户端
 * 2. 传入已有的 SupabaseClient 实例，复用现有客户端
 */
export interface SupabaseAdapterOptions extends IRxDBAdapterOptions {
  /** Supabase 项目 URL（与 supabaseKey 配合使用） */
  supabaseUrl?: string;

  /** Supabase API Key（与 supabaseUrl 配合使用） */
  supabaseKey?: string;

  /** 自定义 Supabase 客户端（优先级高于 URL + Key） */
  client?: SupabaseClient;

  /**
   * 连接时执行 RLS 自检。
   *
   * - `false`: 禁用自检
   * - `true` / `undefined`: 使用默认 RPC `rxdb_check_rls`，失败时告警但不中断连接
   * - `object`: 自定义 RPC、失败模式或检查表列表
   *
   * @remarks
   * 自检只确认目标表存在且已启用 RLS。事务写 RPC 以 `SECURITY INVOKER` 执行，
   * 因而目标表权限和 RLS policy 都按调用者身份判定，不要求 `FORCE ROW LEVEL SECURITY`。
   * 自检不验证 policy 内容、认证 claims、tenant ownership 或表级 grants。
   */
  rlsCheck?: boolean | SupabaseRlsCheckOptions;
}

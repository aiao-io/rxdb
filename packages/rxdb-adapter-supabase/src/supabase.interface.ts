/**
 * @fileoverview Supabase Adapter 核心类型定义
 */

import type { IRxDBAdapterOptions, RxDBIdentity } from '@aiao/rxdb';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseRlsCheckTable {
  /** 目标 schema，默认 public */
  schema?: string;

  /** 目标表名 */
  table: string;
}

/**
 * 一条远端变更历史：`rxdb_entity_history()` 返回的一行（US-229）
 *
 * @remarks
 * 只读得到调用者**当前**能编辑的行的历史（按每条历史记录时的行判定），四个正文字段只含调用者有列权限的列。
 * 修改的前像另判一次：调用者不能编辑改动前的行时（如换了租户），`beforeData` 与 `inversePatch` 为 `null`。
 */
export interface SupabaseEntityHistoryItem {
  /** 历史记录 id，按写入顺序递增；翻页时作为 {@link SupabaseEntityHistoryOptions.afterId} 传回 */
  id: number;

  /** 同一次写入在同步日志 `rxdb_change` 里的 id */
  changeId: number | null;

  /** 实体命名空间，即业务表所在 schema */
  namespace: string;

  /** 实体名 */
  entity: string;

  /** 行 id 的文本形式 */
  entityId: string;

  /** 写入时这一行所在的分区；未分区实体为 `null` */
  bucket: string | null;

  /** 写入的种类 */
  type: 'INSERT' | 'UPDATE' | 'DELETE';

  /** 这次写入改了什么 */
  patch: Record<string, unknown> | null;

  /** 撤回这次写入要改回什么；调用者不能编辑改动前的行时为 `null` */
  inversePatch: Record<string, unknown> | null;

  /** 写入之前的整行；新增，或调用者不能编辑改动前的行时为 `null` */
  beforeData: Record<string, unknown> | null;

  /** 写入之后的整行；删除为 `null` */
  afterData: Record<string, unknown> | null;

  /** 操作者 `auth.uid()`；`service_role` 或没有会话的写入为 `null` */
  actor: string | null;

  /** 写入时 JWT 里的角色 */
  role: string | null;

  /** 写入路径：直写业务表（同步触发器）、经 `rxdb_mutations` 推送、推送里父行删除带走的子行 */
  source: 'trigger' | 'push' | 'cascade';

  /** 推送方的客户端 id；直写与级联为 `null` */
  clientId: string | null;

  /** 推送方本地的 change id；直写与级联为 `null` */
  localId: number | null;

  /** 写入所在的分支，业务写只发生在 `main` */
  branchId: string;

  /** 写入时刻 */
  createdAt: Date;
}

/**
 * 读变更历史的分页选项（US-229）
 */
export interface SupabaseEntityHistoryOptions {
  /** 只返回 id 大于它的历史，传上一页最后一条的 `id`；不传从头读 */
  afterId?: number;

  /** 一页最多几条，1～1000；不传时服务端取 100 */
  limit?: number;
}

/**
 * 实体在远端的同步登记（`rxdb_entity_sync_info()` 的结果，US-033）
 */
export interface SupabaseEntitySyncInfo {
  /** 实体命名空间，即业务表所在 schema */
  namespace: string;

  /** 实体名 */
  entity: string;

  /** 业务表名；实体没经 `rxdb_enable_sync_for_table` 登记过时为 `null` */
  tableName: string | null;

  /** 业务表有 `rxdb_bucket` 列、按授权分区同步时为 `true` */
  bucketed: boolean;
}

/**
 * 待拉数探针：`rxdb_pending_change_counts()` 的一项入参（US-236）
 *
 * @remarks
 * 数一个实体（分区实体细到一个区）在游标之后、不是本库推上去的日志条数。
 */
export interface SupabasePendingChangeProbe {
  /** 实体命名空间 */
  readonly namespace: string;

  /** 实体名 */
  readonly entity: string;

  /** 分区；数未分区日志时为 `null` */
  readonly bucket: string | null;

  /** 游标：只数 id 大于它的日志 */
  readonly afterId: number;

  /** 本库推上去的远端 id（推送回执写下的 `RxDBChange.remoteId`）：落在范围里的不算 */
  readonly excludeIds: readonly number[];
}

/**
 * 同步插件绑定本地库时用的调用者身份，与 `RxDBAdapterSupabase.callerIdentity()` 同一编码（US-033）
 */
export type SupabaseScopedSyncIdentity = RxDBIdentity;

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

/**
 * @fileoverview Supabase 适配器包入口。
 * 提供基于 PostgREST 的 RxDB 适配器、实体仓库与树形仓库实现。
 *
 * 各模块导出约定：
 * - `errors.ts`              → `SupabaseSyncError` 及具体错误子类
 * - `supabase.interface.ts`  → 适配器、配置与能力选项类型
 * - `RxDBAdapterSupabase.ts` → `RxDBAdapterSupabase` 适配器主体
 * - `SupabaseRepository.ts`  → 实体仓库（含关系查询与批量写入）
 * - `SupabaseTreeRepository.ts` → 树形仓库（递归 CTE 实现的后代/祖先查询）
 */

export * from './errors.js';
export * from './RxDBAdapterSupabase.js';
export * from './supabase.interface.js';
export * from './SupabaseRepository.js';
export * from './SupabaseTreeRepository.js';

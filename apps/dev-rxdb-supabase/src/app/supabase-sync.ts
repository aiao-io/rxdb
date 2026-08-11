import { RxDB } from '@aiao/rxdb';
import { inject } from '@angular/core';
import { ResolveFn } from '@angular/router';
import { RemoteSyncState, type RemoteSyncStateWriter } from './remote-sync-state';
import { readSupabaseConfig, RuntimeEnv } from './runtime-config';

/** `connectSupabase` 真正用到的 RxDB 能力子集，便于测试替身。 */
export type RemoteSyncDatabase = Pick<RxDB, 'connect'>;

/**
 * 按环境变量决定是否连接远端 Supabase 适配器。
 *
 * @param database - RxDB 实例
 * @param env - 构建期注入的环境变量
 * @returns 是否真的连上了远端；两个变量都缺失时返回 `false` 并跳过连接
 *
 * @remarks
 * 返回 `false` 表示"本地模式"。**当前没有任何页面消费这个返回值**（见 P1-2），
 * 于是纯本地模式下 pull / push 按钮照样可点。
 */
export async function connectSupabase(database: RemoteSyncDatabase, env: RuntimeEnv): Promise<boolean> {
  const hasUrl = Boolean(env.VITE_SUPABASE_URL?.trim());
  const hasKey = Boolean(env.VITE_SUPABASE_KEY?.trim());
  if (!hasUrl && !hasKey) return false;
  readSupabaseConfig(env);
  await database.connect('supabase');
  return true;
}

/**
 * 连接远端并把结果写进可被 UI 绑定的状态。
 *
 * @param database - RxDB 实例
 * @param env - 构建期注入的环境变量
 * @param state - 承接结果的状态写入面
 * @returns 是否连上了远端
 * @throws 透传 `connectSupabase` 的错误（**标回未连接之后**再抛）
 *
 * @remarks
 * P1-2：原先 resolver 只把 boolean 交给 route data，而两个 todo 页都没注入
 * `ActivatedRoute` —— 这个结论被算出来后就丢掉了。
 * 抛错路径也必须标回 `false`：否则一次成功、一次失败之后，状态会停在上一次的 `true`，
 * UI 以为还连着。
 */
export async function resolveRemoteSync(
  database: RemoteSyncDatabase,
  env: RuntimeEnv,
  state: RemoteSyncStateWriter
): Promise<boolean> {
  try {
    const connected = await connectSupabase(database, env);
    state.markConnected(connected);
    return connected;
  } catch (error) {
    state.markConnected(false);
    throw error;
  }
}

/** 路由 resolver：进入页面前尝试建立远端连接，并把结果写入 {@link RemoteSyncState}。 */
export const supabaseSyncResolver: ResolveFn<boolean> = () =>
  resolveRemoteSync(inject(RxDB), import.meta.env, inject(RemoteSyncState));

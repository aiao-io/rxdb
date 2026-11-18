import { verifyFingerprints } from '../commit.js';
import { demand, type Command, type Environment, type Identity } from '../model.js';
import { preload } from './content.js';
import { execute, plan, type EngineOptions } from './engine.js';
import { gather } from './scope.js';
import { stateChanges } from './state-changes.js';
import type { CommandStore } from './store.js';

/**
 * 执行一条命令：按命令加载并锁定它涉及的行（局部状态），让引擎做授权与状态校验并声明所需的提交数据，
 * 用平台的 `computeCommitExchangeRecordFingerprint()` 复算并核对上传提交的内容指纹（交换记录的严格解析与批次形状已在
 * 解析命令时按平台规则判过），按声明预加载，交给纯函数的引擎裁决，再把新提交、共享记录改动（连同键索引）
 * 与局部状态的差异写回。调用方负责事务：任一步失败时整体回滚；工作区不存在时与无权访问同样拒绝。
 * `options` 是部署入口注入的引擎扩展（特殊业务检查），默认没有。
 * 读取不经这里：浏览器经 Supabase 的只读投影读取（见 `reader.ts`），授权由投影的成员资格条件裁决。
 */
export async function runCommand(
  store: CommandStore,
  user: Identity,
  command: Command,
  env: Environment,
  options: EngineOptions = {}
): Promise<Record<string, unknown>> {
  const state = await gather(store.loader, user, command, env.now);
  demand(state, 'forbidden', '当前用户没有操作权限');
  const before = structuredClone(state);
  const planned = plan(state, user, command);
  if (command.type === 'upload' || command.type === 'fork') verifyFingerprints(command.commits);
  const { result, effects } = execute(state, user, command, env, await preload(store.commits, planned), options);
  if (effects.commits.length) await store.commits.append(effects.commits);
  if (effects.shared) await store.commits.apply(effects.shared);
  if (effects.reindex) await store.commits.reindex(effects.reindex);
  await store.save(stateChanges(before, state), effects, env.now);
  return result;
}
